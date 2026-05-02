"use client";
import { useState, useEffect, useRef } from "react";
import { getChatHistory, sendMessage, wipeChat } from "@/lib/api";

// ── Encryption helpers (AES-GCM via Web Crypto API) ────────────────────────
// Key is derived from the two UIDs so both sides produce the same key.
// The backend / Redis only ever stores base64 ciphertext — never plaintext.

async function deriveKey(uidA, uidB) {
  const roomKey = [uidA, uidB].sort().join("_");
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(roomKey),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: encoder.encode("ghost-protocol-salt"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptText(plaintext, uidA, uidB) {
  const key = await deriveKey(uidA, uidB);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

async function decryptText(base64, uidA, uidB) {
  try {
    const key = await deriveKey(uidA, uidB);
    const combined = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch {
    return "[encrypted]";
  }
}

// ── Component ───────────────────────────────────────────────────────────────

export default function GhostChat({ user, token, targetUser, socket, onPulse, ttlSeconds, setTtlSeconds }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [wiped, setWiped] = useState(false);
  const [ttl, setTtl] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const typingTimer = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!targetUser) return;
    setWiped(false);
    setMessages([]);

    getChatHistory(token, targetUser.uid)
      .then(async ({ messages: msgs, ttl: t }) => {
        const decrypted = await Promise.all(
          msgs.map(async (m) => ({
            ...m,
            text: await decryptText(m.text, user.uid, targetUser.uid),
          }))
        );
        setMessages(decrypted);
        setTtl(t);
      })
      .catch(console.error);

    socket?.emit("joinRoom", { myUid: user.uid, targetUid: targetUser.uid });
  }, [targetUser?.uid]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!socket) return;

    const handleMessage = async (msg) => {
      const room = [user.uid, targetUser?.uid].sort().join("_");
      if (msg.key === `chat:${room}`) {
        const plaintext = await decryptText(msg.text, user.uid, targetUser.uid);
        const decryptedMsg = { ...msg, text: plaintext };
        setMessages((prev) => {
          if (prev.some((m) => m.ts === msg.ts && m.senderUid === msg.senderUid)) return prev;
          return [...prev, decryptedMsg];
        });
        setTtl(msg.ttl);
        setWiped(false);
      }
    };

    const handleWipe = ({ key }) => {
      const room = [user.uid, targetUser?.uid].sort().join("_");
      if (key === `chat:${room}`) {
        setMessages([]);
        setTtl(null);
        setWiped(true);
        onPulse({ type: "GHOST", message: "Ghost cleared. Chat memory wiped.", ts: Date.now() });
      }
    };

    const handleTyping = ({ uid, isTyping: t }) => {
      if (uid === targetUser?.uid) setIsTyping(t);
    };

    socket.on("message", handleMessage);
    socket.on("wipe", handleWipe);
    socket.on("typing", handleTyping);

    return () => {
      socket.off("message", handleMessage);
      socket.off("wipe", handleWipe);
      socket.off("typing", handleTyping);
    };
  }, [socket, targetUser?.uid]);

  const handleSend = async () => {
    if (!input.trim() || !targetUser) return;
    setSending(true);
    try {
      const ciphertext = await encryptText(input.trim(), user.uid, targetUser.uid);
      onPulse({
        type: "CRYPTO",
        message: `Payload encrypted (AES-256-GCM). Redis stores ciphertext only.`,
        ts: Date.now(),
      });
      await sendMessage(token, targetUser.uid, ciphertext, ttlSeconds);
      setInput("");
      socket?.emit("typing", { myUid: user.uid, targetUid: targetUser.uid, isTyping: false });
    } catch (err) {
      onPulse({ type: "REDIS", message: `Send failed: ${err.message}`, ts: Date.now() });
    } finally {
      setSending(false);
    }
  };

  const handleTypingInput = (val) => {
    setInput(val);
    socket?.emit("typing", { myUid: user.uid, targetUid: targetUser?.uid, isTyping: true });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket?.emit("typing", { myUid: user.uid, targetUid: targetUser?.uid, isTyping: false });
    }, 1500);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleWipe = async () => {
    if (!targetUser) return;
    try {
      await wipeChat(token, targetUser.uid);
    } catch (err) {
      onPulse({ type: "GHOST", message: `Wipe failed: ${err.message}`, ts: Date.now() });
    }
  };

  if (!targetUser) {
    return (
      <div style={{ fontFamily: "monospace", color: "#166534", fontSize: "13px", padding: "16px" }}>
        <p>{">"} select a contact to open ghost channel...</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: "monospace" }}>
      {/* Header */}
      <div style={{
        borderBottom: "1px solid #166534",
        padding: "8px 12px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: "11px",
      }}>
        <div>
          <span style={{ color: "#4ade80" }}>[GHOST CHANNEL] </span>
          <span style={{ color: "#d1fae5" }}>{targetUser.displayName}</span>
          <span style={{ color: "#c084fc", marginLeft: "8px" }}>[AES-256-GCM E2E]</span>
          {ttl !== null && ttl > 0 && (
            <span style={{ color: "#6b7280", marginLeft: "12px" }}>TTL: {ttl}s</span>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={{ color: "#6b7280" }}>
            TTL(s):
            <input
              type="number"
              min={10}
              max={3600}
              value={ttlSeconds}
              onChange={(e) => setTtlSeconds(Number(e.target.value))}
              style={{
                background: "transparent",
                border: "1px solid #166534",
                color: "#4ade80",
                width: "60px",
                marginLeft: "4px",
                padding: "1px 4px",
                fontFamily: "monospace",
                fontSize: "11px",
              }}
            />
          </label>
          <button
            onClick={handleWipe}
            style={{
              background: "transparent",
              border: "1px solid #dc2626",
              color: "#f87171",
              cursor: "pointer",
              padding: "2px 8px",
              fontFamily: "monospace",
              fontSize: "11px",
            }}
          >
            [PURGE]
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px", fontSize: "13px" }}>
        {wiped && (
          <p style={{ color: "#f87171", textAlign: "center", marginBottom: "12px" }}>
            ◈ GHOST HAS CLEARED THE MEMORY ◈
          </p>
        )}
        {messages.length === 0 && !wiped && (
          <p style={{ color: "#166534" }}>{">"} no messages yet. channel is silent.</p>
        )}
        {messages.map((m, i) => {
          const isMe = m.senderUid === user.uid;
          return (
            <div key={i} style={{ marginBottom: "4px" }}>
              <span style={{ color: isMe ? "#4ade80" : "#60a5fa" }}>
                [{isMe ? user.displayName : targetUser.displayName}]
              </span>
              <span style={{ color: "#d1fae5" }}> {m.text}</span>
              <span style={{ color: "#374151", fontSize: "10px", marginLeft: "8px" }}>
                {new Date(m.ts).toLocaleTimeString()}
              </span>
            </div>
          );
        })}
        {isTyping && (
          <p style={{ color: "#6b7280", fontSize: "11px" }}>{targetUser.displayName} is typing...</p>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        borderTop: "1px solid #166534",
        padding: "8px 12px",
        display: "flex",
        gap: "8px",
        alignItems: "center",
      }}>
        <span style={{ color: "#166534" }}>{">"}</span>
        <input
          value={input}
          onChange={(e) => handleTypingInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="type message... [AES-256 encrypted before sending]"
          disabled={sending}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#4ade80",
            fontFamily: "monospace",
            fontSize: "13px",
          }}
        />
        <button
          onClick={handleSend}
          disabled={sending || !input.trim()}
          style={{
            background: "transparent",
            border: "1px solid #166534",
            color: "#4ade80",
            cursor: "pointer",
            padding: "4px 12px",
            fontFamily: "monospace",
            fontSize: "12px",
            opacity: sending || !input.trim() ? 0.4 : 1,
          }}
        >
          {sending ? "..." : "SEND"}
        </button>
      </div>
    </div>
  );
}