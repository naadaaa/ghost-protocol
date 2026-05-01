"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function ChatPage() {
  const [user, setUser] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (!stored) {
      router.push("/");
      return;
    }
    setUser(JSON.parse(stored));
  }, [router]);

  if (!user) return null;

  return (
    <main className="min-h-screen bg-black text-green-400 flex flex-col items-center justify-center gap-4 p-8" style={{ fontFamily: "monospace" }}>
      <h1 className="text-2xl tracking-widest">GHOST PROTOCOL</h1>
      <p className="text-green-600 text-sm">ghost console initializing...</p>
      <div className="border border-green-800 p-6 w-full max-w-md">
        <p className="text-xs text-green-600">[AUTH CONSOLE]</p>
        <p className="text-sm mt-2">✓ Logged in as: <span className="text-green-300">{user.displayName}</span></p>
        <p className="text-sm">✓ Email: <span className="text-green-300">{user.email}</span></p>
        <p className="text-sm">✓ UID: <span className="text-green-300 text-xs">{user.uid}</span></p>
        <p className="text-xs text-green-700 mt-4">// chat module — coming soon (teammate's part)</p>
      </div>
    </main>
  );
}