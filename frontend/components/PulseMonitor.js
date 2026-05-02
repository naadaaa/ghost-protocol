"use client";
import { useEffect, useRef } from "react";

const TYPE_COLORS = {
  AUTH: "#4ade80",    // green-400
  SOCKET: "#60a5fa",  // blue-400
  REDIS: "#f59e0b",   // amber-400
  GHOST: "#f87171",   // red-400
  TWILIO: "#c084fc",  // purple-400
};

function formatTs(ts) {
  return new Date(ts).toISOString().replace("T", " ").slice(0, -1);
}

export default function PulseMonitor({ logs }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="flex flex-col h-full">
      <p style={{ color: "#4ade80", fontFamily: "monospace", fontSize: "11px", marginBottom: "8px" }}>
        [SYSTEM PULSE MONITOR] — live backend events
      </p>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          fontFamily: "monospace",
          fontSize: "11px",
          lineHeight: "1.6",
          padding: "4px 0",
        }}
      >
        {logs.length === 0 && (
          <p style={{ color: "#1a4731" }}>awaiting events...</p>
        )}
        {logs.map((e, i) => (
          <div key={i} style={{ marginBottom: "2px" }}>
            <span style={{ color: "#374151" }}>{formatTs(e.ts)} </span>
            <span style={{ color: TYPE_COLORS[e.type] || "#9ca3af" }}>
              [{e.type}]
            </span>
            <span style={{ color: "#d1fae5" }}> {e.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}