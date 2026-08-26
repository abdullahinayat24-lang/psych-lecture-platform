"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [lectures, setLectures] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [myNotes, setMyNotes] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [confusions, setConfusions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyDraft, setReplyDraft] = useState<{ [key: string]: string }>({});

  const isTeacher = (session?.user as any)?.role === "TEACHER";

  useEffect(() => {
    if (status !== "authenticated") return;

    (async () => {
      try {
        const [lecRes, topRes, noteRes, qRes, confRes] = await Promise.all([
          fetch("/api/lectures"),
          fetch("/api/topics"),
          fetch("/api/notes"),
          fetch("/api/questions"),
          fetch("/api/confusions"),
        ]);

        if (lecRes.ok) {
          const d = await lecRes.json();
          setLectures(d.lectures || []);
        }
        if (topRes.ok) {
          const d = await topRes.json();
          setTopics(d.topics || []);
        }
        if (noteRes.ok) {
          const d = await noteRes.json();
          setMyNotes(d.notes || []);
        }
        if (qRes.ok) {
          const d = await qRes.json();
          setQuestions(d.questions || []);
        }
        if (confRes.ok) {
          const d = await confRes.json();
          setConfusions(d.confusions || []);
        }
      } catch (err) {
        console.error("Dashboard data load error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [status]);

  async function handleTeacherAnswer(questionId: string) {
    const text = replyDraft[questionId];
    if (!text?.trim()) return;

    const res = await fetch(`/api/questions/${questionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "answer", answerText: text }),
    });

    if (res.ok) {
      alert("Answer published to student!");
      setReplyDraft((prev) => ({ ...prev, [questionId]: "" }));
      // Refresh questions
      const qRes = await fetch("/api/questions");
      if (qRes.ok) {
        const d = await qRes.json();
        setQuestions(d.questions || []);
      }
    }
  }

  async function handleDeleteLecture(lectureId: string, title: string) {
    if (!confirm(`Are you sure you want to permanently delete "${title}"?`)) return;

    try {
      const res = await fetch(`/api/lectures/${lectureId}`, { method: "DELETE" });
      if (res.ok) {
        setLectures((prev) => prev.filter((l) => l.id !== lectureId));
      } else {
        alert("Failed to delete lecture.");
      }
    } catch (err: any) {
      alert(err.message || "Error deleting lecture");
    }
  }

  if (status === "loading" || loading) {
    return (
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "2.5rem 1.25rem" }}>
        <p>Loading your dashboard...</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "2rem 1.25rem" }}>
      {/* Header */}
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginBottom: "1rem", fontSize: "0.85rem" }}>
        <Link href="/" style={{ color: "var(--color-text-muted)" }}>
          Home
        </Link>
        <span style={{ color: "var(--color-border)" }}>/</span>
        <span style={{ fontWeight: 600 }}>Dashboard</span>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "2rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1 style={{ marginBottom: "0.25rem" }}>
            Welcome back, {session?.user?.name || (session?.user as any)?.username}
          </h1>
          <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
            {isTeacher ? "Instructor Studio & Knowledge Archive" : "Student Study & Research Dashboard"}
          </p>
        </div>

        {isTeacher && (
          <Link href="/teacher/record">
            <button className="primary" style={{ padding: "0.65rem 1.25rem" }}>
              🎙️ Start Live Recording Studio
            </button>
          </Link>
        )}
      </div>

      {isTeacher ? (
        /* TEACHER DASHBOARD */
        <div style={{ display: "grid", gap: "2rem" }}>
          {/* Quick Metrics */}
          <div className="grid-cols-auto">
            <div className="card">
              <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                Total Lectures
              </div>
              <div style={{ fontSize: "2rem", fontWeight: 700, marginTop: 4 }}>{lectures.length}</div>
            </div>
            <div className="card">
              <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                Published Lectures
              </div>
              <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--color-success)", marginTop: 4 }}>
                {lectures.filter((l) => l.status === "PUBLISHED").length}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                Pending Review / Draft
              </div>
              <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--color-interpretation)", marginTop: 4 }}>
                {lectures.filter((l) => l.status !== "PUBLISHED").length}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", textTransform: "uppercase" }}>
                Student Questions Inbox
              </div>
              <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--color-source)", marginTop: 4 }}>
                {questions.filter((q) => !q.answers || q.answers.length === 0).length}
              </div>
            </div>
          </div>

          {/* Main 2-column layout */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1.5rem" }} className="grid-2col">
            {/* Lectures Management */}
            <section>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h2>Lectures Library</h2>
                <Link href="/lectures" style={{ fontSize: "0.9rem" }}>
                  View All →
                </Link>
              </div>

              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Date</th>
                      <th>Language</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lectures.slice(0, 8).map((lec) => (
                      <tr key={lec.id}>
                        <td>
                          <strong>
                            <Link href={`/lectures/${lec.id}`}>{lec.title}</Link>
                          </strong>
                          {lec.category && (
                            <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", display: "block" }}>
                              {lec.category}
                            </span>
                          )}
                        </td>
                        <td>{new Date(lec.lectureDate).toLocaleDateString()}</td>
                        <td>
                          <span style={{ fontSize: "0.8rem" }}>{lec.primaryLanguage}</span>
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              lec.status === "PUBLISHED" ? "badge-published" : "badge-draft"
                            }`}
                          >
                            {lec.status}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 6 }}>
                            <Link href={`/teacher/review/${lec.id}`}>
                              <button className="sm">Review & AI</button>
                            </Link>
                            <Link href={`/lectures/${lec.id}`}>
                              <button className="sm">Play</button>
                            </Link>
                            <button
                              className="sm danger"
                              onClick={() => handleDeleteLecture(lec.id, lec.title)}
                              title="Delete this lecture"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {lectures.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-muted)" }}>
                          No lectures recorded yet. Click &quot;Start Live Recording Studio&quot; above to capture your first lecture.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Student Questions Inbox */}
            <aside>
              <h2 style={{ marginBottom: "1rem" }}>Submitted Student Questions</h2>
              <div style={{ display: "grid", gap: "1rem" }}>
                {questions.map((q) => (
                  <div key={q.id} className="card">
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem" }}>
                      <span style={{ fontWeight: 600 }}>{q.student?.displayName || "Student"}</span>
                      <span style={{ color: "var(--color-text-muted)" }}>
                        {new Date(q.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p style={{ margin: "0.5rem 0", fontSize: "0.92rem" }}>{q.text}</p>

                    {q.answers && q.answers.length > 0 ? (
                      <div
                        style={{
                          background: "var(--color-accent-light)",
                          padding: "0.5rem 0.75rem",
                          borderRadius: "var(--radius)",
                          fontSize: "0.85rem",
                          marginTop: "0.5rem",
                        }}
                      >
                        <strong>Your Answer:</strong> {q.answers[0].text}
                      </div>
                    ) : (
                      <div style={{ marginTop: "0.75rem", display: "grid", gap: 6 }}>
                        <textarea
                          placeholder="Type your official answer..."
                          rows={2}
                          value={replyDraft[q.id] || ""}
                          onChange={(e) => setReplyDraft({ ...replyDraft, [q.id]: e.target.value })}
                          style={{ width: "100%", fontSize: "0.85rem" }}
                        />
                        <button className="primary sm" onClick={() => handleTeacherAnswer(q.id)}>
                          Send Answer
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {questions.length === 0 && (
                  <p className="card" style={{ color: "var(--color-text-muted)" }}>
                    No student questions pending.
                  </p>
                )}
              </div>
            </aside>
          </div>
        </div>
      ) : (
        /* STUDENT DASHBOARD */
        <div style={{ display: "grid", gap: "2rem" }}>
          {/* Recent Lectures */}
          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2>Available Lectures</h2>
              <Link href="/lectures" style={{ fontSize: "0.9rem" }}>
                Browse All ({lectures.length}) →
              </Link>
            </div>

            <div className="grid-cols-auto">
              {lectures.slice(0, 6).map((lec) => (
                <div key={lec.id} className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <span className="badge tag-source">{lec.primaryLanguage}</span>
                      <span style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
                        {new Date(lec.lectureDate).toLocaleDateString()}
                      </span>
                    </div>
                    <h3 style={{ margin: "0.4rem 0", fontSize: "1.1rem" }}>
                      <Link href={`/lectures/${lec.id}`}>{lec.title}</Link>
                    </h3>
                    {lec.description && (
                      <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", margin: "0 0 1rem" }}>
                        {lec.description.slice(0, 110)}...
                      </p>
                    )}
                  </div>
                  <Link href={`/lectures/${lec.id}`}>
                    <button className="primary sm" style={{ width: "100%" }}>
                      🎧 Listen & Read Transcript
                    </button>
                  </Link>
                </div>
              ))}
              {lectures.length === 0 && (
                <div className="card" style={{ gridColumn: "1 / -1", textAlign: "center", padding: "2rem" }}>
                  No published lectures available at this moment.
                </div>
              )}
            </div>
          </section>

          {/* Student Notes & Confusions 2-column layout */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }} className="grid-2col">
            {/* Private Notes */}
            <section>
              <h2 style={{ marginBottom: "1rem" }}>My Private Notes</h2>
              <div style={{ display: "grid", gap: "0.75rem" }}>
                {myNotes.slice(0, 5).map((note) => (
                  <div key={note.id} className="card">
                    <span className="badge tag-note">STUDENT NOTE</span>
                    <p style={{ margin: "0.5rem 0", fontSize: "0.92rem" }}>{note.text}</p>
                    {note.lecture && (
                      <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
                        From: <Link href={`/lectures/${note.lecture.id}`}>{note.lecture.title}</Link>
                      </div>
                    )}
                  </div>
                ))}
                {myNotes.length === 0 && (
                  <p className="card" style={{ color: "var(--color-text-muted)" }}>
                    You haven&apos;t added any private notes yet. You can highlight and save notes while listening to any lecture.
                  </p>
                )}
              </div>
            </section>

            {/* Confusion & AI Explanations */}
            <section>
              <h2 style={{ marginBottom: "1rem" }}>My Confusions & AI Help</h2>
              <div style={{ display: "grid", gap: "0.75rem" }}>
                {confusions.slice(0, 5).map((conf) => (
                  <div key={conf.id} className="card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="badge tag-interpretation">AI EXPLANATION</span>
                      <span style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
                        {new Date(conf.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {conf.comment && (
                      <p style={{ fontStyle: "italic", fontSize: "0.85rem", margin: "0.4rem 0" }}>
                        &quot;{conf.comment}&quot;
                      </p>
                    )}
                    {conf.aiExplanation ? (
                      <div
                        style={{
                          background: "var(--color-surface-hover)",
                          padding: "0.6rem",
                          borderRadius: "var(--radius)",
                          fontSize: "0.85rem",
                        }}
                      >
                        <p style={{ margin: "0 0 4px" }}>
                          <strong>Explanation:</strong>{" "}
                          {(conf.aiExplanation as any).simpleExplanation || (conf.aiExplanation as any).detailedExplanation}
                        </p>
                        {(conf.aiExplanation as any).example && (
                          <p style={{ margin: 0, color: "var(--color-text-muted)" }}>
                            <strong>Example:</strong> {(conf.aiExplanation as any).example}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>Explanation generating...</p>
                    )}
                  </div>
                ))}
                {confusions.length === 0 && (
                  <p className="card" style={{ color: "var(--color-text-muted)" }}>
                    Whenever a concept is difficult during a lecture, click &quot;I didn&apos;t understand&quot; to get an instant AI breakdown.
                  </p>
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
