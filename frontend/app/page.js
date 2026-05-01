"use client";
import { useState } from "react";
import LoginButton from "@/components/LoginButton";
import MfaScreen from "@/components/MfaScreen";
import { useRouter } from "next/navigation";

export default function Home() {
  const [stage, setStage] = useState("login"); // "login" | "mfa"
  const [pendingUser, setPendingUser] = useState(null);
  const [pendingToken, setPendingToken] = useState(null);
  const [pulseLog, setPulseLog] = useState([]);
  const router = useRouter();

  const addPulse = (event) =>
    setPulseLog((prev) => [event, ...prev].slice(0, 50));

  const handlePendingMfa = (user, token) => {
    setPendingUser(user);
    setPendingToken(token);
    setStage("mfa");
  };

  const handleVerified = (user) => {
    localStorage.setItem("user", JSON.stringify(user));
    router.push("/chat");
  };

  return (
    <main className="min-h-screen bg-black text-green-400 flex flex-col items-center justify-center gap-8 p-8" style={{ fontFamily: "monospace" }}>
      <h1 className="text-2xl tracking-widest">GHOST PROTOCOL</h1>
      <p className="text-green-600 text-sm">ephemeral · verified · volatile</p>

      <div className="w-full max-w-2xl flex gap-6">
        {/* Auth pane */}
        <div className="flex-1 border border-green-800 p-6 flex flex-col gap-4">
          <p className="text-green-600 text-xs">[AUTH CONSOLE]</p>
          {stage === "login" && (
            <LoginButton
              onPendingMfa={handlePendingMfa}
              onVerified={handleVerified}
              onPulse={addPulse}
            />
          )}
          {stage === "mfa" && (
            <MfaScreen
              user={pendingUser}
              token={pendingToken}
              onVerified={handleVerified}
              onPulse={addPulse}
            />
          )}
        </div>

        {/* Pulse monitor pane */}
        <div className="flex-1 border border-green-800 p-4 flex flex-col gap-1 overflow-y-auto max-h-64">
          <p className="text-green-600 text-xs mb-2">[SYSTEM PULSE]</p>
          {pulseLog.length === 0 && <p className="text-green-900 text-xs">awaiting events...</p>}
          {pulseLog.map((e, i) => (
            <p key={i} className="text-xs text-green-300">
              <span className="text-green-600">[{e.type}]</span> {e.message}
            </p>
          ))}
        </div>
      </div>
    </main>
  );
}