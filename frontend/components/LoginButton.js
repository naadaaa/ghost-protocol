"use client";
import { auth } from "@/lib/firebase";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { useState } from "react";
import axios from "axios";

export default function LoginButton({ onPendingMfa, onVerified, onPulse }) {
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const token = await result.user.getIdToken();

      localStorage.setItem("fbToken", token);
      onPulse({ type: "AUTH", message: "Google login successful. Sending token to backend...", ts: Date.now() });

      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/auth/login`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data.status === "PENDING_MFA") {
        onPulse({ type: "TWILIO", message: "MFA challenge sent. Check your phone.", ts: Date.now() });
        onPendingMfa(res.data.user, token);
      } else if (res.data.status === "SECURE") {
        // MFA was bypassed (Twilio issue) — go straight to chat
        onPulse({ type: "AUTH", message: "Session is SECURE. Redirecting...", ts: Date.now() });
        onVerified(res.data.user);
      }
    } catch (err) {
      console.error(err);
      onPulse({ type: "AUTH", message: `Login error: ${err.message}`, ts: Date.now() });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleLogin}
      disabled={loading}
      style={{ fontFamily: "monospace" }}
      className="border border-green-400 text-green-400 px-6 py-3 hover:bg-green-400 hover:text-black transition-colors disabled:opacity-50"
    >
      {loading ? "> authenticating..." : "> sign_in_with_google()"}
    </button>
  );
}