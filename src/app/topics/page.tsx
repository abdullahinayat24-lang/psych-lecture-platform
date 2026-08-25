"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function TopicsPage() {
  const { data: session } = useSession();
  const [topics, setTopics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [newTopicOverview, setNewTopicOverview] = useState("");

  const isTeacher = (session?.user as any)?.role === "TEACHER";

  useEffect(() => {
    loadTopics();
  }, []);

  async function loadTopics() {
    try {
      const res = await fetch("/api/topics");
      if (res.ok) {
        const d = await res.json();
        setTopics(d.topics || []);
      }
    } catch (err) {
      console.error("Failed to load topics:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateTopic(e: React.FormEvent) {
    e.preventDefault();
    if (!newTopicName.trim()) return;

    const res = await fetch("/api/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newTopicName,
        overview: newTopicOverview || undefined,
      }),
    });

    if (res.ok) {
      setCreateModalOpen(false);
      setNewTopicName("");
      setNewTopicOverview("");
      loadTopics();
    } else {
      const err = await res.json();
      alert(err.error || "Failed to create topic");
    }
  }

  const filtered = topics.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.overview && t.overview.toLowerCase().includes(searchQuery.toLowerCase()))
  );

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
          <h1 style={{ margin: "0 0 4px" }}>🧠 Psychology Knowledge Graph</h1>
          <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
            Explore global psychological concepts and trace their development across all lectures.
          </p>
        </div>

        {isTeacher && (
          <button className="primary" onClick={() => setCreateModalOpen(true)}>
            + Create New Topic
          </button>
        )}
      </div>

      {/* Search Input */}
      <div style={{ marginBottom: "1.5rem" }}>
        <input
          placeholder="Search topics (e.g. Narcissism, Defense Mechanisms, Attachment Theory)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: "100%", maxWidth: 600 }}
        />
      </div>

      {loading ? (
        <p>Loading knowledge topics...</p>
      ) : (
        <div className="grid-cols-auto">
          {filtered.map((topic) => (
            <div
              key={topic.id}
              className="card"
              style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span className="badge tag-interpretation">TOPIC</span>
                  <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                    {topic._count?.occurrences || 0} occurrences
                  </span>
                </div>

                <h3 style={{ margin: "0.4rem 0 0.6rem", fontSize: "1.2rem" }}>
                  <Link href={`/topics/${topic.id}`}>{topic.name}</Link>
                </h3>

                {topic.overview && (
                  <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", margin: "0 0 1rem" }}>
                    {topic.overview.slice(0, 120)}...
                  </p>
                )}
              </div>

              <Link href={`/topics/${topic.id}`}>
                <button className="sm" style={{ width: "100%" }}>
                  Explore Concept Evolution →
                </button>
              </Link>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="card" style={{ gridColumn: "1 / -1", textAlign: "center", padding: "3rem 1rem" }}>
              <h3>No topics found</h3>
              <p style={{ color: "var(--color-text-muted)" }}>Try searching for a different psychological term.</p>
            </div>
          )}
        </div>
      )}

      {/* Create Topic Modal (Teacher Only) */}
      {createModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: "1rem",
          }}
        >
          <div className="card" style={{ maxWidth: 500, width: "100%", background: "var(--color-surface)" }}>
            <h3 style={{ marginTop: 0 }}>Create New Knowledge Topic</h3>
            <form onSubmit={handleCreateTopic} style={{ display: "grid", gap: "1rem" }}>
              <label>
                <strong>Topic Name *</strong>
                <input
                  value={newTopicName}
                  onChange={(e) => setNewTopicName(e.target.value)}
                  placeholder="e.g. Projective Identification"
                  required
                  style={{ width: "100%", marginTop: 4 }}
                />
              </label>

              <label>
                <strong>Curated Overview / Theoretical Summary</strong>
                <textarea
                  value={newTopicOverview}
                  onChange={(e) => setNewTopicOverview(e.target.value)}
                  placeholder="Theoretical definition, historical development, and diagnostic significance..."
                  rows={4}
                  style={{ width: "100%", marginTop: 4 }}
                />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" onClick={() => setCreateModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary">
                  Create Topic
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
