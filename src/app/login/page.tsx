"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await signIn("credentials", { username, password, redirect: false });

    setLoading(false);
    if (res?.error) {
      setError("Invalid username or password");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <main style={{ maxWidth: 380, margin: "10vh auto", padding: "0 1rem" }}>
      <h1 style={{ marginBottom: "0.25rem" }}>Lecture Archive</h1>
      <p style={{ color: "var(--color-text-muted)", marginTop: 0 }}>Sign in to continue</p>

      <form onSubmit={handleSubmit} className="card" style={{ display: "grid", gap: "0.75rem" }}>
        <label>
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            style={{ width: "100%", padding: "0.5rem", marginTop: 4 }}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: "100%", padding: "0.5rem", marginTop: 4 }}
          />
        </label>
        {error && <p style={{ color: "crimson", margin: 0 }}>{error}</p>}
        <button type="submit" className="primary" disabled={loading} style={{ padding: "0.6rem" }}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
