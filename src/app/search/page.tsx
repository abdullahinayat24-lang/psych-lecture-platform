"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function SearchPage() {
  return (
    <Suspense fallback={<main style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1.25rem" }}><p>Loading search...</p></main>}>
      <SearchContent />
    </Suspense>
  );
}

function SearchContent() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<{
    topics: any[];
    lectures: any[];
    transcriptMatches: any[];
    myNotes: any[];
    myQuestions: any[];
    summaries: any[];
    answers: any[];
    bookmarks: any[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>("ALL");

  useEffect(() => {
    if (initialQuery.trim().length >= 2) {
      performSearch(initialQuery);
    }
  }, [initialQuery]);

  async function performSearch(q: string) {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
      }
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    performSearch(query);
  }

  const totalMatches = results
    ? (results.topics?.length || 0) +
      (results.lectures?.length || 0) +
      (results.transcriptMatches?.length || 0) +
      (results.myNotes?.length || 0) +
      (results.myQuestions?.length || 0) +
      (results.summaries?.length || 0) +
      (results.answers?.length || 0)
    : 0;

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1.25rem" }}>
      <h1 style={{ marginBottom: "0.25rem" }}>🔍 Universal Knowledge Search</h1>
      <p style={{ color: "var(--color-text-muted)", marginTop: 0, marginBottom: "1.5rem" }}>
        Search across lectures, timestamped verbatim transcripts, knowledge topics, official summaries, and your private notes.
      </p>

      {/* Search Input */}
      <form onSubmit={handleFormSubmit} style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search psychology concepts, verbatim quotes, or private notes..."
          style={{ flex: 1, padding: "0.75rem 1rem", fontSize: "1.05rem" }}
          autoFocus
        />
        <button type="submit" className="primary" style={{ padding: "0.75rem 1.5rem" }}>
          Search
        </button>
      </form>

      {/* Filter Tabs */}
      {results && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
          {[
            { key: "ALL", label: `All Results (${totalMatches})` },
            { key: "TOPICS", label: `Topics (${results.topics?.length || 0})` },
            { key: "LECTURES", label: `Lectures (${results.lectures?.length || 0})` },
            { key: "TRANSCRIPT", label: `Verbatim Transcripts (${results.transcriptMatches?.length || 0})` },
            { key: "SUMMARIES", label: `Summaries (${results.summaries?.length || 0})` },
            { key: "NOTES", label: `My Private Notes (${results.myNotes?.length || 0})` },
          ].map((f) => (
            <button
              key={f.key}
              className="sm"
              onClick={() => setActiveFilter(f.key)}
              style={{
                background: activeFilter === f.key ? "var(--color-accent)" : "var(--color-surface)",
                color: activeFilter === f.key ? "#ffffff" : "var(--color-text)",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {loading && <p>Searching knowledge archive...</p>}

      {/* Results Feed */}
      {results && !loading && (
        <div style={{ display: "grid", gap: "1rem" }}>
          {/* Topics */}
          {(activeFilter === "ALL" || activeFilter === "TOPICS") && results.topics?.length > 0 && (
            <section>
              <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>Topics</h2>
              <div style={{ display: "grid", gap: "0.75rem" }}>
                {results.topics.map((t) => (
                  <div key={t.id} className="card">
                    <span className="badge tag-interpretation">TOPIC</span>
                    <h3 style={{ margin: "0.3rem 0" }}>
                      <Link href={`/topics/${t.id}`}>{t.name}</Link>
                    </h3>
                    {t.overview && (
                      <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--color-text-muted)" }}>
                        {t.overview.slice(0, 150)}...
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Lectures */}
          {(activeFilter === "ALL" || activeFilter === "LECTURES") && results.lectures?.length > 0 && (
            <section>
              <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>Lectures</h2>
              <div style={{ display: "grid", gap: "0.75rem" }}>
                {results.lectures.map((l) => (
                  <div key={l.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span className="badge tag-source">{l.category || "LECTURE"}</span>
                      <h3 style={{ margin: "0.3rem 0" }}>
                        <Link href={`/lectures/${l.id}`}>{l.title}</Link>
                      </h3>
                      <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                        {new Date(l.lectureDate).toLocaleDateString()}
                      </span>
                    </div>
                    <Link href={`/lectures/${l.id}`}>
                      <button className="primary sm">Open Lecture →</button>
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Verbatim Transcripts */}
          {(activeFilter === "ALL" || activeFilter === "TRANSCRIPT") && results.transcriptMatches?.length > 0 && (
            <section>
              <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>Verbatim Transcript Passages</h2>
              <div style={{ display: "grid", gap: "0.75rem" }}>
                {results.transcriptMatches.map((tm) => (
                  <div key={tm.id} className="card">
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: 4 }}>
                      <div>
                        <strong>{tm.lecture?.title}</strong> · <span className="badge tag-source">SOURCE</span>
                      </div>
                      <Link href={`/lectures/${tm.lectureId}?t=${tm.startTimeSec}`}>
                        <button className="sm">▶ Jump to {formatTime(tm.startTimeSec)}</button>
                      </Link>
                    </div>
                    <p style={{ margin: 0, fontSize: "0.95rem" }}>&quot;{tm.text}&quot;</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Summaries */}
          {(activeFilter === "ALL" || activeFilter === "SUMMARIES") && results.summaries?.length > 0 && (
            <section>
              <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>Approved Lecture Summaries</h2>
              <div style={{ display: "grid", gap: "0.75rem" }}>
                {results.summaries.map((s) => (
                  <div key={s.id} className="card">
                    <span className="badge tag-interpretation">OFFICIAL SUMMARY</span>
                    <h4 style={{ margin: "0.3rem 0" }}>{s.lecture?.title}</h4>
                    <p style={{ margin: 0, fontSize: "0.9rem" }}>{s.content}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* My Private Notes */}
          {(activeFilter === "ALL" || activeFilter === "NOTES") && results.myNotes?.length > 0 && (
            <section>
              <h2 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>My Private Notes</h2>
              <div style={{ display: "grid", gap: "0.75rem" }}>
                {results.myNotes.map((n) => (
                  <div key={n.id} className="card">
                    <span className="badge tag-note">MY PRIVATE NOTE</span>
                    <p style={{ margin: "0.4rem 0 0", fontSize: "0.92rem" }}>{n.text}</p>
                    {n.lecture && (
                      <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: 4 }}>
                        Lecture: <Link href={`/lectures/${n.lecture.id}`}>{n.lecture.title}</Link>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {totalMatches === 0 && (
            <div className="card" style={{ textAlign: "center", padding: "3rem 1rem" }}>
              <h3>No matching results found</h3>
              <p style={{ color: "var(--color-text-muted)" }}>
                Try broader keywords or search for general psychological terms.
              </p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
