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
          🏛️ City College Sambrial
        </span>
        <h1 style={{ fontSize: "2.8rem", lineHeight: 1.2, marginBottom: "1rem" }}>
          Sir Amir&apos;s Multidisciplinary Lecture Archive
        </h1>
        <p
          style={{
            fontSize: "1.2rem",
            color: "var(--color-text-muted)",
            maxWidth: 680,
            margin: "0 auto 2.5rem",
          }}
        >
          Dedicated lecture and study platform for City College Sambrial. Explore verbatim multilingual lectures by Sir Amir
          covering Clinical Psychology, Punjabi Classical Music, CSS, Philosophy, History, and Family Dynamics.
        </p>

        <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
          <Link href="/login">
            <button className="primary" style={{ padding: "0.8rem 1.8rem", fontSize: "1.05rem" }}>
              Sign In to City College Sambrial
            </button>
          </Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.5rem", marginTop: "4rem", textAlign: "left" }}>
        <div className="card">
          <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>🎙️</div>
          <h3>10-Hour Fail-Safe Recording</h3>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
            Continuous multilingual speech capture in Urdu, Punjabi & English with local IndexedDB vault backup.
          </p>
        </div>

        <div className="card">
          <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>🧠</div>
          <h3>Cross-Lecture Knowledge Graph</h3>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
            Interconnect topics like Covert Narcissism, Sur & Laya, and Domestic Grievance with timestamped audio jump links.
          </p>
        </div>

        <div className="card">
          <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>🤖</div>
          <h3>Gemini AI Study Suite</h3>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
            Instant bulleted revision notes, flashcards, and student confusion resolution powered by Google Gemini.
          </p>
        </div>
      </div>
    </main>
  );
}
