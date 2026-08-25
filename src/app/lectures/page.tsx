"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

export default function LecturesPage() {
  const { data: session } = useSession();
  const [lectures, setLectures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("ALL");
  const [selectedCategory, setSelectedCategory] = useState("ALL");

  const isTeacher = (session?.user as any)?.role === "TEACHER";

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/lectures");
        if (res.ok) {
          const d = await res.json();
          setLectures(d.lectures || []);
        }
      } catch (err) {
        console.error("Failed to load lectures:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const categories = Array.from(new Set(lectures.map((l) => l.category).filter(Boolean)));

  const filtered = lectures.filter((lec) => {
    const matchesSearch =
      lec.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (lec.description && lec.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesLang = selectedLanguage === "ALL" || lec.primaryLanguage === selectedLanguage;
    const matchesCat = selectedCategory === "ALL" || lec.category === selectedCategory;
    return matchesSearch && matchesLang && matchesCat;
  });

  function formatDuration(sec?: number) {
    if (!sec) return "In Progress";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m} mins`;
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1.25rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1 style={{ margin: "0 0 4px" }}>Psychology Lectures Archive</h1>
          <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
            Verbatim clinical lectures, searchable transcripts, and topic knowledge paths.
          </p>
        </div>

        {isTeacher && (
          <Link href="/teacher/record">
            <button className="primary">🎙️ Record New Lecture</button>
          </Link>
        )}
      </div>

      {/* Filters */}
      <div
        className="card grid-2col"
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr",
          gap: "1rem",
          marginBottom: "1.5rem",
          alignItems: "center",
        }}
      >
        <input
          placeholder="Search lectures by title or concept..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: "100%" }}
        />

        <select
          value={selectedLanguage}
          onChange={(e) => setSelectedLanguage(e.target.value)}
          style={{ width: "100%" }}
        >
          <option value="ALL">All Languages</option>
          <option value="MIXED_URDU_ENGLISH">Mixed Urdu & English</option>
          <option value="ENGLISH">English</option>
          <option value="URDU">Urdu</option>
          <option value="PUNJABI">Punjabi</option>
          <option value="MIXED_PUNJABI_ENGLISH">Mixed Punjabi & English</option>
        </select>

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          style={{ width: "100%" }}
        >
          <option value="ALL">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Lectures Grid */}
      {loading ? (
        <p>Loading lectures...</p>
      ) : (
        <div className="grid-cols-auto">
          {filtered.map((lec) => (
            <div
              key={lec.id}
              className="card"
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <span className="badge tag-source">{lec.primaryLanguage}</span>
                  {isTeacher ? (
                    <span className={`badge ${lec.status === "PUBLISHED" ? "badge-published" : "badge-draft"}`}>
                      {lec.status}
                    </span>
                  ) : (
                    <span style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
                      {new Date(lec.lectureDate).toLocaleDateString()}
                    </span>
                  )}
                </div>

                <h3 style={{ margin: "0.4rem 0", fontSize: "1.15rem" }}>
                  <Link href={`/lectures/${lec.id}`}>{lec.title}</Link>
                </h3>

                {lec.category && (
                  <div style={{ fontSize: "0.8rem", color: "var(--color-accent)", fontWeight: 600, marginBottom: 6 }}>
                    {lec.category}
                  </div>
                )}

                {lec.description && (
                  <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", margin: "0 0 1rem" }}>
                    {lec.description.slice(0, 130)}...
                  </p>
                )}

                <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginBottom: "1rem" }}>
                  ⏱️ {formatDuration(lec.actualDuration)} · {lec._count?.transcriptSegments || 0} transcript segments
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: "0.5rem" }}>
                <Link href={`/lectures/${lec.id}`} style={{ flex: 1 }}>
                  <button className="primary sm" style={{ width: "100%" }}>
                    🎧 Study & Listen
                  </button>
                </Link>
                {isTeacher && (
                  <Link href={`/teacher/review/${lec.id}`}>
                    <button className="sm">Review</button>
                  </Link>
                )}
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="card" style={{ gridColumn: "1 / -1", textAlign: "center", padding: "3rem 1rem" }}>
              <h3>No lectures match your filters</h3>
              <p style={{ color: "var(--color-text-muted)" }}>
                Try adjusting your search term or language filters.
              </p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
