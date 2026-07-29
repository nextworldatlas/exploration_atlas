"use client";

// Claim-a-username / sign-in panel for /me. The account adopts the browser's
// anonymous id at signup, so everything already marked carries over.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export default function AccountPanel() {
  const qc = useQueryClient();
  const { data } = useQuery<{ username: string | null }>({
    queryKey: ["auth-me"],
    queryFn: async () => (await fetch("/api/auth/me")).json(),
  });
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!data) return null;

  const refresh = () => {
    qc.invalidateQueries(); // identity changed: every per-user query is stale
    window.location.reload(); // server components re-render with new identity
  };

  if (data.username) {
    return (
      <div className="stat" style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <div>
          <div className="n" style={{ fontSize: "1.1rem" }}>@{data.username}</div>
          <div className="l">your progress is saved to this username</div>
        </div>
        <button
          className="btn secondary"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            refresh();
          }}
        >
          Sign out
        </button>
      </div>
    );
  }

  const submit = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Something went wrong");
      return;
    }
    refresh();
  };

  return (
    <div className="stat" style={{ minWidth: 320 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>
        {mode === "signup" ? "Claim a username" : "Sign in"}
      </div>
      <div className="l" style={{ marginBottom: 8 }}>
        {mode === "signup"
          ? "Keeps your progress across devices. Everything you've marked in this browser carries over."
          : "Pick up your atlas from any device."}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <input
          type="text"
          placeholder="username"
          value={username}
          autoComplete="username"
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="password"
          placeholder="password (8+ characters)"
          value={password}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        {error && (
          <div className="small" style={{ color: "#f87171" }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={submit} disabled={busy}>
            {mode === "signup" ? "Claim" : "Sign in"}
          </button>
          <button
            className="btn secondary"
            onClick={() => {
              setMode(mode === "signup" ? "login" : "signup");
              setError(null);
            }}
          >
            {mode === "signup" ? "I have an account" : "New here?"}
          </button>
        </div>
      </div>
    </div>
  );
}
