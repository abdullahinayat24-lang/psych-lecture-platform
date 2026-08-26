"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

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

    try {
      const res = await signIn("credentials", { username, password, redirect: false });

      setLoading(false);
      if (res?.error) {
        setError("Invalid username or password. Please verify credentials.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      setLoading(false);
      setError(err.message || "Failed to sign in. Please try again.");
    }
  }

  function fillCredentials(user: string, pass: string) {
    setUsername(user);
    setPassword(pass);
    setError(null);
  }

  return (
    <main style={{ maxWidth: 420, margin: "6vh auto", padding: "0 1.25rem" }}>
      {/* Back button */}
      <div style={{ marginBottom: "1.5rem" }}>
        <Link href="/" style={{ fontSize: "0.88rem", color: "var(--color-text-muted)", display: "inline-flex", alignItems: "center", gap: 4 }}>
          ← Back to Home
        </Link>
      </div>

      <div style={{ marginBottom: "1.25rem" }}>
        <h1 style={{ margin: "0 0 4px", fontSize: "1.6rem" }}>🏛️ City College Sambrial</h1>
        <p style={{ color: "var(--color-text-muted)", margin: 0, fontSize: "0.92rem" }}>
          Sign in to access Sir Amir&apos;s lectures, transcripts & AI study notes.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card" style={{ display: "grid", gap: "1rem" }}>
        <label>
          <strong style={{ fontSize: "0.85rem" }}>Username</strong>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. teacher or student1"
            required
            autoFocus
            style={{ width: "100%", marginTop: 4 }}
          />
        </label>

        <label>
          <strong style={{ fontSize: "0.85rem" }}>Password</strong>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            required
            style={{ width: "100%", marginTop: 4 }}
          />
        </label>

        {error && (
          <div
            style={{
              padding: "0.6rem 0.8rem",
              background: "var(--color-danger-bg)",
              color: "var(--color-danger-text)",
              borderRadius: "var(--radius)",
              fontSize: "0.85rem",
            }}
          >
            {error}
          </div>
        )}

        <button type="submit" className="primary" disabled={loading} style={{ padding: "0.65rem" }}>
          {loading ? "Signing in..." : "Sign in to City College Sambrial"}
        </button>

        {/* Quick 1-Click Demo Logins */}
        <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "1rem", marginTop: "0.5rem" }}>
          <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.6rem" }}>
            1-Click Demo Logins:
          </div>

          <div style={{ display: "grid", gap: "0.5rem" }}>
            <button
              type="button"
              className="sm"
              onClick={() => fillCredentials("teacher", "ChangeMe123!")}
              style={{ justifyContent: "space-between", textAlign: "left" }}
            >
              <span>👨‍🏫 <strong>Instructor</strong> (Sir Amir)</span>
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Fill</span>
            </button>

            <button
              type="button"
              className="sm"
              onClick={() => fillCredentials("student1", "ChangeMe123!")}
              style={{ justifyContent: "space-between", textAlign: "left" }}
            >
              <span>🎓 <strong>Student 1</strong> (Zainab Khan)</span>
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Fill</span>
            </button>

            <button
              type="button"
              className="sm"
              onClick={() => fillCredentials("student2", "ChangeMe123!")}
              style={{ justifyContent: "space-between", textAlign: "left" }}
            >
              <span>🎓 <strong>Student 2</strong> (Bilal Tariq)</span>
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Fill</span>
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}
