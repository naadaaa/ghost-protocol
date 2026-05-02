"use client";

export default function ContactsList({ users, presence, currentTarget, onSelect }) {
  return (
    <div style={{ fontFamily: "monospace", fontSize: "12px" }}>
      <p style={{ color: "#4ade80", fontSize: "11px", marginBottom: "8px" }}>
        [CONTACTS] — {users.length} registered
      </p>
      {users.length === 0 && (
        <p style={{ color: "#166534" }}>no other users found.</p>
      )}
      {users.map((u) => {
        const isOnline = presence[u.uid] === "ACTIVE";
        const isActive = currentTarget?.uid === u.uid;
        return (
          <div
            key={u.uid}
            onClick={() => onSelect(u)}
            style={{
              padding: "6px 8px",
              cursor: "pointer",
              borderLeft: isActive ? "2px solid #4ade80" : "2px solid transparent",
              background: isActive ? "rgba(74, 222, 128, 0.05)" : "transparent",
              marginBottom: "2px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span style={{ color: isOnline ? "#4ade80" : "#374151", fontSize: "8px" }}>
              {isOnline ? "●" : "○"}
            </span>
            <div>
              <p style={{ color: isActive ? "#d1fae5" : "#6b7280", margin: 0 }}>
                {u.displayName}
              </p>
              <p style={{ color: "#374151", margin: 0, fontSize: "10px" }}>{u.email}</p>
            </div>
            {isOnline && (
              <span style={{ color: "#4ade80", fontSize: "10px", marginLeft: "auto" }}>ACTIVE</span>
            )}
          </div>
        );
      })}
    </div>
  );
}