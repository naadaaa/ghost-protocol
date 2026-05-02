"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { getUsers } from "@/lib/api";
import GhostChat from "@/components/GhostChat";
import PulseMonitor from "@/components/PulseMonitor";
import ContactsList from "@/components/ContactsList";

export default function ChatPage() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [users, setUsers] = useState([]);
  const [targetUser, setTargetUser] = useState(null);
  const [pulseLog, setPulseLog] = useState([]);
  const [presence, setPresence] = useState({});
  const [socket, setSocket] = useState(null);
  const [ttlSeconds, setTtlSeconds] = useState(120);
  const presenceRef = useRef({});
  const router = useRouter();

  const addPulse = (event) => {
    setPulseLog((prev) => [...prev, event].slice(-100));
  };

  useEffect(() => {
    const stored = localStorage.getItem("user");
    const storedToken = localStorage.getItem("fbToken");
    if (!stored || !storedToken) {
      router.push("/");
      return;
    }
    const u = JSON.parse(stored);
    setUser(u);
    setToken(storedToken);

    // Connect socket
    const s = getSocket();
    s.connect();

    s.once("connect", () => {
      s.emit("register", u.uid);
    });

    // Pulse events from backend
    s.on("pulse", (event) => addPulse(event));

    // ── Presence — update ref AND state so it always re-renders ──
    s.on("presence", (data) => {
      presenceRef.current = { ...presenceRef.current, [data.uid]: data.status };
      setPresence({ ...presenceRef.current });
    });

    // Online list on first connect
    s.on("onlineList", (list) => {
      const map = {};
      list.forEach((uid) => { map[uid] = "ACTIVE"; });
      presenceRef.current = { ...presenceRef.current, ...map };
      setPresence({ ...presenceRef.current });
    });

    setSocket(s);

    // Load contacts
    getUsers(storedToken).then(setUsers).catch(console.error);

    return () => {
      s.off("pulse");
      s.off("presence");
      s.off("onlineList");
      s.disconnect();
    };
  }, []);

  const handleLogout = () => {
    socket?.disconnect();
    localStorage.removeItem("user");
    localStorage.removeItem("fbToken");
    router.push("/");
  };

  if (!user) return null;

  return (
    <main style={{
      minHeight: "100vh",
      background: "#000",
      color: "#4ade80",
      fontFamily: "monospace",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Top Bar */}
      <div style={{
        borderBottom: "1px solid #166534",
        padding: "8px 16px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: "12px",
      }}>
        <div>
          <span style={{ color: "#4ade80", letterSpacing: "4px" }}>GHOST PROTOCOL</span>
          <span style={{ color: "#166534", marginLeft: "16px" }}>ephemeral · verified · volatile</span>
        </div>
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <span style={{ color: "#6b7280" }}>{user.displayName}</span>
          <span style={{ color: "#374151" }}>|</span>
          <span style={{ color: "#166534", fontSize: "11px" }}>{user.uid.slice(0, 12)}...</span>
          <button
            onClick={handleLogout}
            style={{
              background: "transparent",
              border: "1px solid #166534",
              color: "#6b7280",
              cursor: "pointer",
              padding: "2px 8px",
              fontFamily: "monospace",
              fontSize: "11px",
            }}
          >
            [LOGOUT]
          </button>
        </div>
      </div>

      {/* Main Layout */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Left: Contacts */}
        <div style={{
          width: "200px",
          borderRight: "1px solid #166534",
          padding: "12px",
          overflowY: "auto",
          flexShrink: 0,
        }}>
          <ContactsList
            users={users}
            presence={presence}
            currentTarget={targetUser}
            onSelect={(u) => {
              setTargetUser(u);
              addPulse({ type: "SOCKET", message: `Opened channel with ${u.displayName}`, ts: Date.now() });
            }}
          />
        </div>

        {/* Center: Ghost Chat */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid #166534",
          overflow: "hidden",
        }}>
          <GhostChat
            user={user}
            token={token}
            targetUser={targetUser}
            socket={socket}
            onPulse={addPulse}
            ttlSeconds={ttlSeconds}
            setTtlSeconds={setTtlSeconds}
          />
        </div>

        {/* Right: System Pulse Monitor */}
        <div style={{
          width: "340px",
          padding: "12px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          flexShrink: 0,
        }}>
          <PulseMonitor logs={pulseLog} />
        </div>
      </div>
    </main>
  );
}