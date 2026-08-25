"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type TopicData = {
  topic: {
    id: string;
    name: string;
    slug: string;
    overview?: string | null;
  };
  occurrences: {
    id: string;
    timestampSec: number;
    label: string;
    lecture: {
      id: string;
      title: string;
      lectureDate: string;
      status: string;
    };
  }[];
  timeline: {
    id: string;
    title: string;
    lectureDate: string;
  }[];
  relatedTopics: {
    id: string;
    name: string;
    slug: string;
  }[];
};

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export default function TopicDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<TopicData | null>(null);
  const [myNotes, setMyNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [topRes, noteRes] = await Promise.all([
          fetch(`/api/topics/${id}`),
          fetch(`/api/notes?topicId=${id}`),
        ]);

        if (!topRes.ok) throw new Error("Failed to load topic details");
        const topData = await topRes.json();
        const noteData = await noteRes.json();

        setData(topData);
        setMyNotes(noteData.notes || []);
      } catch (err: any) {
        setError(err.message || "Failed to load topic");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <main style={{ padding: "3rem 1.5rem", maxWidth: 1100, margin: "0 auto" }}>Loading topic...</main>;
  if (error || !data) {
    return (
      <main style={{ padding: "3rem 1.5rem", maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
        <h2>Topic Not Found</h2>
        <p style={{ color: "var(--color-text-muted)" }}>{error || "Could not find topic."}</p>
        <Link href="/topics">
          <button className="primary">Browse All Topics</button>
        </Link>
      </main>
    );
  }

  const { topic, occurrences, timeline, relatedTopics } = data;

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1.25rem" }}>
      {/* Navigation Breadcrumb */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: "1rem" }}>
        <Link href="/topics" style={{ fontSize: "0.85rem" }}>
          ← Knowledge Graph
        </Link>
        <span style={{ color: "var(--color-border)" }}>/</span>
        <span className="badge tag-interpretation">GLOBAL TOPIC</span>
      </div>

      {/* Topic Header */}
      <div className="card" style={{ marginBottom: "2rem", padding: "1.75rem" }}>
        <h1 style={{ margin: "0 0 0.75rem", fontSize: "2.2rem" }}>{topic.name}</h1>
        {topic.overview ? (
          <p style={{ fontSize: "1.05rem", lineHeight: 1.7, color: "var(--color-text)", margin: 0 }}>
            {topic.overview}
          </p>
        ) : (
          <p style={{ color: "var(--color-text-muted)", fontStyle: "italic", margin: 0 }}>
            Curated theoretical overview pending instructor notes.
          </p>
        )}

        {relatedTopics.length > 0 && (
          <div style={{ marginTop: "1.25rem", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>Related Concepts:</span>
            {relatedTopics.map((rt) => (
              <Link key={rt.id} href={`/topics/${rt.id}`} className="badge tag-source">
                {rt.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Main Grid: Occurrences & Evolution */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "2rem" }} className="grid-2col">
        {/* Occurrences Across Lectures */}
        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h2>Lecture Occurrences ({occurrences.length})</h2>
          </div>

          <div style={{ display: "grid", gap: "1rem" }}>
            {occurrences.map((occ) => (
              <div key={occ.id} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div>
                    <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                      {new Date(occ.lecture.lectureDate).toLocaleDateString()}
                    </span>
                    <h3 style={{ margin: "2px 0 6px", fontSize: "1.1rem" }}>
                      <Link href={`/lectures/${occ.lecture.id}?t=${occ.timestampSec}`}>{occ.lecture.title}</Link>
                    </h3>
                  </div>
                  <Link href={`/lectures/${occ.lecture.id}?t=${occ.timestampSec}`}>
                    <button className="primary sm">▶ Jump to {formatTime(occ.timestampSec)}</button>
                  </Link>
                </div>

                <p style={{ margin: 0, fontSize: "0.92rem", color: "var(--color-text)" }}>{occ.label}</p>
              </div>
            ))}

            {occurrences.length === 0 && (
              <p className="card" style={{ color: "var(--color-text-muted)" }}>
                No occurrences recorded for this topic in published lectures yet.
              </p>
            )}
          </div>
        </section>

        {/* Sidebar: Evolution Timeline & Notes */}
        <aside style={{ display: "grid", gap: "1.5rem", alignSelf: "start" }}>
          {/* Timeline of Evolution */}
          <div className="card">
            <h3 style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>📅 Concept Evolution Timeline</h3>
            <div style={{ display: "grid", gap: "0.75rem", borderLeft: "2px solid var(--color-accent)", paddingLeft: "1rem" }}>
              {timeline.map((lec, idx) => (
                <div key={lec.id} style={{ position: "relative" }}>
                  <div
                    style={{
                      position: "absolute",
                      left: "-1.35rem",
                      top: 4,
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: "var(--color-accent)",
                    }}
                  />
                  <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
                    Phase {idx + 1} · {new Date(lec.lectureDate).toLocaleDateString()}
                  </div>
                  <Link href={`/lectures/${lec.id}`} style={{ fontWeight: 600, fontSize: "0.92rem" }}>
                    {lec.title}
                  </Link>
                </div>
              ))}
              {timeline.length === 0 && (
                <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>No lecture timeline recorded.</div>
              )}
            </div>
          </div>

          {/* Student's Private Topic Notes */}
          <div className="card">
            <h3 style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>My Private Topic Notes</h3>
            <div style={{ display: "grid", gap: "0.5rem" }}>
              {myNotes.map((n) => (
                <div
                  key={n.id}
                  style={{
                    background: "var(--color-surface-hover)",
                    padding: "0.6rem 0.8rem",
                    borderRadius: "var(--radius)",
                    fontSize: "0.88rem",
                  }}
                >
                  <span className="badge tag-note">MY NOTE</span>
                  <p style={{ margin: "4px 0 0" }}>{n.text}</p>
                </div>
              ))}
              {myNotes.length === 0 && (
                <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", margin: 0 }}>
                  Take notes in any lecture referencing this topic to build your concept binder.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
