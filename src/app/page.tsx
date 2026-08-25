import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "4rem 1.5rem", textAlign: "center" }}>
      <div style={{ marginBottom: "2rem" }}>
        <span className="badge tag-source" style={{ marginBottom: "1rem" }}>
          Psychology Knowledge Platform
        </span>
        <h1 style={{ fontSize: "2.8rem", lineHeight: 1.2, marginBottom: "1rem" }}>
          Preserve, Transcribe & Interrogate Clinical Lectures
        </h1>
        <p
          style={{
            fontSize: "1.2rem",
            color: "var(--color-text-muted)",
            maxWidth: 680,
            margin: "0 auto 2.5rem",
          }}
        >
          A dedicated archive for multilingual psychology lectures (Urdu, Punjabi, English). Verbatim speaker diarization,
          interconnected topic graph, student confusion analysis, and teacher-supervised AI review.
        </p>

        <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
          <Link href="/login">
            <button className="primary" style={{ padding: "0.8rem 1.8rem", fontSize: "1.05rem" }}>
              Sign In to Platform
            </button>
          </Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.5rem", marginTop: "4rem", textAlign: "left" }}>
        <div className="card">
          <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>🎙️</div>
          <h3>Continuous Multilingual Capture</h3>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
            Resilient chunked recording with no arbitrary duration limit. Real-time manual markers for live note-taking.
          </p>
        </div>

        <div className="card">
          <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>🧠</div>
          <h3>Cross-Lecture Topic Graph</h3>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
            Explore concepts like Narcissism, Defense Mechanisms, and Transference across multiple lectures with exact audio timestamp jump links.
          </p>
        </div>

        <div className="card">
          <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>🔒</div>
          <h3>Private Student Workspace</h3>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
            Isolated private notes, bookmarks, and confusion explanations that are strictly never visible to other students.
          </p>
        </div>
      </div>
    </main>
  );
}
