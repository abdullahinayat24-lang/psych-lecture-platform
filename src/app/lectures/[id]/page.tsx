"use client";

import { useEffect, useRef, useState, useTransition, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";

export const dynamic = "force-dynamic";

type TranscriptSegment = {
  id: string;
  startTimeSec: number;
  endTimeSec: number;
  text: string;
  translatedText?: string | null;
  language: string;
  speakerRole: string;
  segmentType: string;
  speaker?: { displayName: string } | null;
};

type Lecture = {
  id: string;
  title: string;
  description?: string;
  category?: string;
  lectureDate: string;
  status: string;
  primaryLanguage: string;
  actualDuration?: number;
  recordings: { storageKey: string }[];
  lectureTopics: { topic: { id: string; name: string; slug: string } }[];
};

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export default function LecturePage() {
  return (
    <Suspense fallback={<main style={{ maxWidth: 1150, margin: "0 auto", padding: "2rem" }}><p>Loading lecture player...</p></main>}>
      <LectureContent />
    </Suspense>
  );
}

function LectureContent() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  const audioRef = useRef<HTMLAudioElement>(null);
  const activeSegmentRef = useRef<HTMLDivElement>(null);

  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [aiAnalyses, setAiAnalyses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tabs
  const [activeTab, setActiveTab] = useState<"transcript" | "ai" | "notes" | "questions">("transcript");
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);

  // Note dialog
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [targetSegment, setTargetSegment] = useState<TranscriptSegment | null>(null);
  const [noteText, setNoteText] = useState("");

  // Confusion AI Modal
  const [confusionModalOpen, setConfusionModalOpen] = useState(false);
  const [activeConfusionData, setActiveConfusionData] = useState<any>(null);
  const [confusionLoading, setConfusionLoading] = useState(false);

  // Ask Question Modal
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [questionText, setQuestionText] = useState("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [lectureRes, transcriptRes, notesRes, aiRes] = await Promise.all([
          fetch(`/api/lectures/${id}`),
          fetch(`/api/lectures/${id}/transcript`),
          fetch(`/api/notes?lectureId=${id}`),
          fetch(`/api/ai?lectureId=${id}`),
        ]);

        if (!lectureRes.ok) throw new Error("Failed to load lecture");
        const lectureData = await lectureRes.json();
        const transcriptData = await transcriptRes.json();
        const notesData = await notesRes.json();
        const aiData = await aiRes.json();

        setLecture(lectureData.lecture);
        setSegments(transcriptData.segments ?? []);
        setNotes(notesData.notes ?? []);
        setAiAnalyses(aiData.analyses ?? []);

        // Check if query timestamp exists e.g. ?t=140
        const tParam = searchParams.get("t");
        if (tParam && audioRef.current) {
          const sec = parseFloat(tParam);
          if (!isNaN(sec)) {
            setTimeout(() => jumpTo(sec), 500);
          }
        }
      } catch (e: any) {
        setError(e.message ?? "Something went wrong loading this lecture.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, searchParams]);

  function jumpTo(sec: number) {
    if (audioRef.current) {
      audioRef.current.currentTime = sec;
      audioRef.current.play().catch(() => {});
    }
  }

  function handleTimeUpdate() {
    const t = audioRef.current?.currentTime ?? 0;
    const current = segments.find((s) => t >= s.startTimeSec && t < s.endTimeSec);
    if (current && current.id !== activeSegmentId) {
      setActiveSegmentId(current.id);
    }
  }

  function changeSpeed(rate: number) {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  }

  async function handleSaveNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;

    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lectureId: id,
        transcriptSegmentId: targetSegment?.id,
        timestampSec: targetSegment?.startTimeSec ?? audioRef.current?.currentTime ?? 0,
        text: noteText,
      }),
    });

    if (res.ok) {
      const { note } = await res.json();
      setNotes((prev) => [note, ...prev]);
      setNoteText("");
      setNoteModalOpen(false);
    }
  }

  async function handleConfusion(segment: TranscriptSegment) {
    setConfusionLoading(true);
    setConfusionModalOpen(true);
    setActiveConfusionData(null);

    try {
      const res = await fetch("/api/confusions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lectureId: id,
          transcriptSegmentId: segment.id,
          timestampSec: segment.startTimeSec,
        }),
      });

      if (res.ok) {
        const { confusion } = await res.json();
        setActiveConfusionData(confusion);
      }
    } catch (err) {
      console.error("Confusion error:", err);
    } finally {
      setConfusionLoading(false);
    }
  }

  async function handleAskQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!questionText.trim()) return;

    const res = await fetch("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lectureId: id,
        transcriptSegmentId: targetSegment?.id,
        timestampSec: targetSegment?.startTimeSec ?? audioRef.current?.currentTime ?? 0,
        text: questionText,
      }),
    });

    if (res.ok) {
      const { question } = await res.json();
      // Prompt if they'd like to submit to teacher immediately
      if (confirm("Question saved to your private notebook! Submit directly to instructor for official answer?")) {
        await fetch(`/api/questions/${question.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "submit_to_teacher" }),
        });
        alert("Question submitted to instructor!");
      }
      setQuestionText("");
      setQuestionModalOpen(false);
    }
  }

  if (loading) return <main style={{ padding: "3rem 1.5rem", maxWidth: 1100, margin: "0 auto" }}>Loading lecture...</main>;
  if (error || !lecture) {
    return (
      <main style={{ padding: "3rem 1.5rem", maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
        <h2>Lecture Unavailable</h2>
        <p style={{ color: "var(--color-text-muted)" }}>{error || "Lecture not found or unpublished."}</p>
        <Link href="/lectures">
          <button className="primary">Browse Available Lectures</button>
        </Link>
      </main>
    );
  }

  const audioSrc = lecture.recordings?.[0]?.storageKey
    ? `/api/recordings/stream?key=${encodeURIComponent(lecture.recordings[0].storageKey)}`
    : null;

  return (
    <main style={{ maxWidth: 1150, margin: "0 auto", padding: "1.5rem" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
          <Link href="/lectures" style={{ fontSize: "0.85rem" }}>
            ← All Lectures
          </Link>
          <span style={{ color: "var(--color-border)" }}>/</span>
          <span className="badge tag-source">{lecture.primaryLanguage}</span>
        </div>
        <h1 style={{ margin: "0 0 6px", fontSize: "1.85rem" }}>{lecture.title}</h1>
        <p style={{ color: "var(--color-text-muted)", margin: 0, fontSize: "0.92rem" }}>
          {new Date(lecture.lectureDate).toLocaleDateString()} · {lecture.category || "Clinical Lecture"}
        </p>

        {/* Topic Badges */}
        {lecture.lectureTopics?.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: "0.75rem" }}>
            {lecture.lectureTopics.map((lt) => (
              <Link key={lt.topic.id} href={`/topics/${lt.topic.id}`} className="badge tag-interpretation">
                🏷️ {lt.topic.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Audio Player Bar */}
      <div
        className="card"
        style={{
          marginBottom: "1.5rem",
          background: "var(--color-surface)",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        {audioSrc ? (
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <audio
              ref={audioRef}
              src={audioSrc}
              controls
              onTimeUpdate={handleTimeUpdate}
              style={{ flex: 1, minWidth: 260 }}
            />
            {/* Speed Selector */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>Speed:</span>
              {[0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
                <button
                  key={rate}
                  className="sm"
                  onClick={() => changeSpeed(rate)}
                  style={{
                    background: playbackRate === rate ? "var(--color-accent)" : "transparent",
                    color: playbackRate === rate ? "#ffffff" : "var(--color-text)",
                  }}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
            🎙️ Audio is currently being processed or synthesized.
          </div>
        )}
      </div>

      {/* Workspace Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--color-border)", marginBottom: "1.5rem" }}>
        <button
          onClick={() => setActiveTab("transcript")}
          style={{
            border: "none",
            borderBottom: activeTab === "transcript" ? "2px solid var(--color-accent)" : "none",
            borderRadius: 0,
            background: "transparent",
            fontWeight: activeTab === "transcript" ? 600 : 400,
            color: activeTab === "transcript" ? "var(--color-accent)" : "var(--color-text-muted)",
            padding: "0.6rem 1rem",
          }}
        >
          📜 Verbatim Transcript ({segments.length})
        </button>

        <button
          onClick={() => setActiveTab("ai")}
          style={{
            border: "none",
            borderBottom: activeTab === "ai" ? "2px solid var(--color-interpretation)" : "none",
            borderRadius: 0,
            background: "transparent",
            fontWeight: activeTab === "ai" ? 600 : 400,
            color: activeTab === "ai" ? "var(--color-interpretation)" : "var(--color-text-muted)",
            padding: "0.6rem 1rem",
          }}
        >
          🤖 AI Analyses & Study Suite ({aiAnalyses.length})
        </button>

        <button
          onClick={() => setActiveTab("notes")}
          style={{
            border: "none",
            borderBottom: activeTab === "notes" ? "2px solid var(--color-note)" : "none",
            borderRadius: 0,
            background: "transparent",
            fontWeight: activeTab === "notes" ? 600 : 400,
            color: activeTab === "notes" ? "var(--color-note)" : "var(--color-text-muted)",
            padding: "0.6rem 1rem",
          }}
        >
          📝 My Private Notes ({notes.length})
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === "transcript" && (
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1.5rem" }} className="grid-2col">
          {/* Transcript Feed */}
          <section style={{ display: "grid", gap: "0.75rem" }}>
            {segments.map((seg) => {
              const isActive = activeSegmentId === seg.id;
              return (
                <div
                  key={seg.id}
                  ref={isActive ? activeSegmentRef : null}
                  className="card"
                  style={{
                    borderColor: isActive ? "var(--color-accent)" : "var(--color-border)",
                    boxShadow: isActive ? "0 0 0 2px var(--color-accent-light)" : "none",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <strong>{seg.speaker?.displayName || seg.speakerRole}</strong>
                      <span className="badge tag-source">SOURCE</span>
                      {seg.segmentType !== "OTHER" && (
                        <span className="badge tag-interpretation">{seg.segmentType}</span>
                      )}
                    </div>
                    <button
                      className="sm"
                      onClick={() => jumpTo(seg.startTimeSec)}
                      style={{ fontFamily: "monospace", color: "var(--color-text-muted)" }}
                    >
                      ▶ {formatTime(seg.startTimeSec)}
                    </button>
                  </div>

                  <p style={{ margin: "0.4rem 0", fontSize: "0.95rem", lineHeight: 1.6 }}>{seg.text}</p>

                  {seg.translatedText && (
                    <div
                      style={{
                        fontSize: "0.85rem",
                        color: "var(--color-text-muted)",
                        background: "var(--color-surface-hover)",
                        padding: "0.4rem 0.6rem",
                        borderRadius: "var(--radius)",
                        marginTop: "0.4rem",
                      }}
                    >
                      <em>Translation:</em> {seg.translatedText}
                    </div>
                  )}

                  {/* Actions Bar */}
                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
                    <button
                      className="sm"
                      onClick={() => handleConfusion(seg)}
                      style={{ background: "var(--color-accent-light)", color: "var(--color-accent)" }}
                    >
                      🤔 I didn&apos;t understand
                    </button>
                    <button
                      className="sm"
                      onClick={() => {
                        setTargetSegment(seg);
                        setNoteModalOpen(true);
                      }}
                    >
                      + Note
                    </button>
                    <button
                      className="sm"
                      onClick={() => {
                        setTargetSegment(seg);
                        setQuestionModalOpen(true);
                      }}
                    >
                      ❓ Ask Question
                    </button>
                  </div>
                </div>
              );
            })}
            {segments.length === 0 && <p className="card">Transcript processing or pending.</p>}
          </section>

          {/* Quick Sidebar */}
          <aside style={{ display: "grid", gap: "1rem", alignSelf: "start" }}>
            <div className="card">
              <h3 style={{ fontSize: "1.05rem", marginBottom: "0.5rem" }}>💡 Study Controls</h3>
              <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", margin: "0 0 1rem" }}>
                Click any timestamp in the transcript to jump audio directly to that explanation.
              </p>
              <button
                className="primary sm"
                style={{ width: "100%" }}
                onClick={() => {
                  setTargetSegment(null);
                  setNoteModalOpen(true);
                }}
              >
                + Add General Note
              </button>
            </div>

            <div className="card">
              <h3 style={{ fontSize: "1.05rem", marginBottom: "0.5rem" }}>My Notes on this Lecture</h3>
              <div style={{ display: "grid", gap: "0.5rem" }}>
                {notes.map((n) => (
                  <div
                    key={n.id}
                    style={{
                      background: "var(--color-surface-hover)",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "var(--radius)",
                      fontSize: "0.85rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="badge tag-note">NOTE</span>
                      {n.timestampSec != null && (
                        <button
                          className="sm"
                          onClick={() => jumpTo(n.timestampSec)}
                          style={{ padding: "0 4px", fontSize: "0.75rem" }}
                        >
                          ▶ {formatTime(n.timestampSec)}
                        </button>
                      )}
                    </div>
                    <p style={{ margin: "0.3rem 0 0" }}>{n.text}</p>
                  </div>
                ))}
                {notes.length === 0 && (
                  <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                    No personal notes saved yet.
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* AI Analyses Tab */}
      {activeTab === "ai" && (
        <div style={{ display: "grid", gap: "1.25rem" }}>
          {aiAnalyses.map((ana) => (
            <div key={ana.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <span className="badge tag-interpretation">AI INTERPRETATION · {ana.type}</span>
                <span style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
                  Curated & Approved by Instructor
                </span>
              </div>

              <div style={{ fontSize: "0.92rem", lineHeight: 1.6 }}>
                {ana.type === "SUMMARY_DETAILED" || ana.type === "SUMMARY_SHORT" ? (
                  <p>{ana.content?.summary || JSON.stringify(ana.content)}</p>
                ) : ana.type === "KEY_CONCEPTS" && Array.isArray(ana.content?.concepts) ? (
                  <div style={{ display: "grid", gap: "0.75rem" }}>
                    {ana.content.concepts.map((c: any, i: number) => (
                      <div key={i} style={{ background: "var(--color-surface-hover)", padding: "0.6rem", borderRadius: "var(--radius)" }}>
                        <strong>{c.term}:</strong> {c.definition}
                      </div>
                    ))}
                  </div>
                ) : ana.type === "REVISION_NOTES" && Array.isArray(ana.content?.points) ? (
                  <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
                    {ana.content.points.map((p: string, i: number) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                ) : ana.type === "FLASHCARDS" && Array.isArray(ana.content?.cards) ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "1rem" }}>
                    {ana.content.cards.map((card: any, i: number) => (
                      <div key={i} style={{ border: "1px solid var(--color-border)", padding: "1rem", borderRadius: "var(--radius)" }}>
                        <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginBottom: 4 }}>Question</div>
                        <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>{card.front}</div>
                        <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginBottom: 4 }}>Answer</div>
                        <div>{card.back}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
                    {JSON.stringify(ana.content, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          ))}
          {aiAnalyses.length === 0 && (
            <div className="card" style={{ textAlign: "center", padding: "2.5rem 1rem" }}>
              <h3>No AI Analyses Approved Yet</h3>
              <p style={{ color: "var(--color-text-muted)" }}>
                The instructor has not released approved AI summaries for this lecture yet.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Notes Tab */}
      {activeTab === "notes" && (
        <div style={{ display: "grid", gap: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2>My Private Notes</h2>
            <button className="primary sm" onClick={() => setNoteModalOpen(true)}>
              + Add Note
            </button>
          </div>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {notes.map((n) => (
              <div key={n.id} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="badge tag-note">PRIVATE NOTE</span>
                  {n.timestampSec != null && (
                    <button className="sm" onClick={() => jumpTo(n.timestampSec)}>
                      ▶ Play at {formatTime(n.timestampSec)}
                    </button>
                  )}
                </div>
                <p style={{ margin: "0.5rem 0", fontSize: "0.95rem" }}>{n.text}</p>
                <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
                  Saved on {new Date(n.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
            {notes.length === 0 && (
              <p className="card" style={{ color: "var(--color-text-muted)" }}>
                You have not taken any notes for this lecture yet.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Add Note Modal */}
      {noteModalOpen && (
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
          <div className="card" style={{ maxWidth: 480, width: "100%", background: "var(--color-surface)" }}>
            <h3 style={{ marginTop: 0 }}>Add Private Note</h3>
            {targetSegment && (
              <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", background: "var(--color-surface-hover)", padding: "0.5rem", borderRadius: "var(--radius)" }}>
                Linked to {formatTime(targetSegment.startTimeSec)}: &quot;{targetSegment.text.slice(0, 80)}...&quot;
              </p>
            )}
            <form onSubmit={handleSaveNote} style={{ display: "grid", gap: "0.75rem" }}>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Write your private note or observation..."
                rows={4}
                required
                style={{ width: "100%" }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" onClick={() => setNoteModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary">
                  Save Note
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confusion Explanation Modal */}
      {confusionModalOpen && (
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
          <div className="card" style={{ maxWidth: 520, width: "100%", background: "var(--color-surface)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <span className="badge tag-interpretation">AI ASSISTANT EXPLANATION</span>
              <button className="sm" onClick={() => setConfusionModalOpen(false)}>
                ✕
              </button>
            </div>
            <h3 style={{ margin: "0.25rem 0 1rem" }}>Instant Concept Clarification</h3>

            {confusionLoading ? (
              <p>Analyzing lecture context and generating explanation...</p>
            ) : activeConfusionData?.aiExplanation ? (
              <div style={{ display: "grid", gap: "0.75rem", fontSize: "0.9rem" }}>
                <div>
                  <strong>Simple Explanation:</strong>
                  <p style={{ margin: "4px 0" }}>
                    {activeConfusionData.aiExplanation.simpleExplanation || "Core principle explained."}
                  </p>
                </div>
                {activeConfusionData.aiExplanation.detailedExplanation && (
                  <div>
                    <strong>Detailed Breakdown:</strong>
                    <p style={{ margin: "4px 0" }}>{activeConfusionData.aiExplanation.detailedExplanation}</p>
                  </div>
                )}
                {activeConfusionData.aiExplanation.example && (
                  <div style={{ background: "var(--color-surface-hover)", padding: "0.6rem", borderRadius: "var(--radius)" }}>
                    <strong>Example:</strong> {activeConfusionData.aiExplanation.example}
                  </div>
                )}
              </div>
            ) : (
              <p>Explanation saved to your study log.</p>
            )}

            <div style={{ marginTop: "1.25rem", textAlign: "right" }}>
              <button className="primary sm" onClick={() => setConfusionModalOpen(false)}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Question Modal */}
      {questionModalOpen && (
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
          <div className="card" style={{ maxWidth: 480, width: "100%", background: "var(--color-surface)" }}>
            <h3 style={{ marginTop: 0 }}>Ask a Question</h3>
            <form onSubmit={handleAskQuestion} style={{ display: "grid", gap: "0.75rem" }}>
              <textarea
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                placeholder="What would you like clarified about this moment in the lecture?"
                rows={4}
                required
                style={{ width: "100%" }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" onClick={() => setQuestionModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary">
                  Record Question
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
