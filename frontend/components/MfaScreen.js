"use client";
import { useState } from "react";
import axios from "axios";

export default function MfaScreen({ user, token, onVerified, onPulse }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleVerify = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/auth/verify-mfa`,
        { code },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.status === "SECURE") {
        onPulse({ type: "TWILIO", message: "Session is now SECURE.", ts: Date.now() });
        onVerified(user, token);
      }
    } catch (err) {
      setError("Invalid code. Try again.");
      onPulse({ type: "TWILIO", message: "MFA verification failed.", ts: Date.now() });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: "monospace" }} className="flex flex-col gap-4 items-start">
      <p className="text-green-400">[TWILIO] SMS sent. Enter 6-digit code:</p>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        maxLength={6}
        placeholder="> ______"
        className="bg-black border border-green-400 text-green-400 px-4 py-2 w-48 tracking-widest"
      />
      {error && <p className="text-red-400">{error}</p>}
      <button
        onClick={handleVerify}
        disabled={loading || code.length !== 6}
        className="border border-green-400 text-green-400 px-6 py-2 hover:bg-green-400 hover:text-black transition-colors disabled:opacity-50"
      >
        {loading ? "> verifying..." : "> verify()"}
      </button>
    </div>
  );
}