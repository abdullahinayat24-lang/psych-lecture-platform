"use client";

import { useEffect, useRef, useState, Suspense } from "react";
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

type BoardImageItem = {
  id: string;
  imageUrl: string;
  caption?: string | null;
  timestampSec?: number | null;
};

type Lecture = {
  id: string;
  title: string;
  description?: string;
  category?: string;
  seriesName?: string;
  partNumber?: number;
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
  const [boardImages, setBoardImages] = useState<BoardImageItem[]>([]);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [aiAnalyses, setAiAnalyses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tabs
  const [activeTab, setActiveTab] = useState<"transcript" | "board" | "ai" | "notes">("transcript");
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
        const lectureRes = await fetch(`/api/lectures/${id}`);
        if (!lectureRes.ok) {
          if (lectureRes.status === 404) {
            throw new Error("This lecture is currently unpublished or has been removed.");
          }
          const errData = await lectureRes.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to load lecture");
        }

        const lectureData = await lectureRes.json();
        setLecture(lectureData.lecture);

        const [transcriptRes, notesRes, aiRes, imgRes] = await Promise.all([
          fetch(`/api/lectures/${id}/transcript`).catch(() => null),
          fetch(`/api/notes?lectureId=${id}`).catch(() => null),
          fetch(`/api/ai?lectureId=${id}`).catch(() => null),
          fetch(`/api/images?lectureId=${id}`).catch(() => null),
        ]);

        if (transcriptRes && transcriptRes.ok) {
          const t = await transcriptRes.json().catch(() => ({}));
          setSegments(t.segments ?? []);
        }
        if (notesRes && notesRes.ok) {
          const n = await notesRes.json().catch(() => ({}));
          setNotes(n.notes ?? []);
        }
        if (aiRes && aiRes.ok) {
          const a = await aiRes.json().catch(() => ({}));
          setAiAnalyses(a.analyses ?? []);
        }
        if (imgRes && imgRes.ok) {
          const img = await imgRes.json().catch(() => ({}));
          setBoardImages(img.images ?? []);
        }

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

  // Sync active segment with audio time
  function handleTimeUpdate() {
    if (!audioRef.current) return;
    const time = audioRef.current.currentTime;
    const current = segments.find(
      (s) => time >= s.startTimeSec && time < s.endTimeSec
    );
    if (current && current.id !== activeSegmentId) {
      setActiveSegmentId(current.id);
    }
  }

  function jumpTo(seconds: number) {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      audioRef.current.play().catch(() => {});
    }
  }

  function changeSpeed(rate: number) {
    setPlaybackRate(rate);
    if (audioRef.current) audioRef.current.playbackRate = rate;
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
      setTargetSegment(null);
    }
  }

  async function handleConfusion(segment: TranscriptSegment) {
    setConfusionLoading(true);
    setConfusionModalOpen(true);
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
      if (confirm("Question saved! Submit to instructor for official answer?")) {
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
          <Link href="/lectures" style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
            ← All Lectures
          </Link>
          <span style={{ color: "var(--color-border)" }}>/</span>
          <span className="badge tag-source">{lecture.category || "General"}</span>
          <span className="badge tag-interpretation">{lecture.primaryLanguage}</span>
        </div>

        <h1 style={{ margin: "0 0 6px", fontSize: "1.85rem" }}>{lecture.title}</h1>
        <p style={{ color: "var(--color-text-muted)", margin: 0, fontSize: "0.92rem" }}>
          Recorded on {new Date(lecture.lectureDate).toLocaleDateString()}
        </p>

        {/* Teacher Draft Alert */}
        {lecture.status !== "PUBLISHED" && (
          <div
            className="card"
            style={{
              backgroundColor: "rgba(234, 179, 8, 0.12)",
              border: "1px solid #ca8a04",
              marginTop: "0.75rem",
              padding: "0.75rem 1rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <span style={{ fontSize: "0.9rem", color: "#a16207" }}>
              ⚠️ <strong>Teacher Preview Mode:</strong> This lecture is currently in <strong>{lecture.status}</strong> status and is invisible to students.
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <Link href={`/teacher/review/${lecture.id}`}>
                <button className="primary sm">✏️ Open Review & Publish</button>
              </Link>
            </div>
          </div>
        )}

        {/* Series Banner */}
        {lecture.seriesName && (
          <div style={{ marginTop: "0.5rem", padding: "0.5rem 0.85rem", background: "var(--color-surface-hover)", borderRadius: "var(--radius)", display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span>🔗 <strong>Series:</strong> {lecture.seriesName} {lecture.partNumber ? `(Part ${lecture.partNumber})` : ""}</span>
            <Link href={`/search?q=${encodeURIComponent(lecture.seriesName)}`} style={{ fontSize: "0.8rem", textDecoration: "underline" }}>
              View all parts in series →
            </Link>
          </div>
        )}

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ fontSize: "0.95rem" }}>Lecture Audio Stream</strong>
          <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
            {lecture.actualDuration ? `Duration: ${formatTime(lecture.actualDuration)}` : "Live Master Audio"}
          </span>
        </div>

        {audioSrc ? (
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <audio
              ref={audioRef}
              src={audioSrc}
              controls
              onTimeUpdate={handleTimeUpdate}
              style={{ flex: "1 1 300px", height: 40 }}
            />

            {/* Playback speed controls */}
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>Speed:</span>
              {[0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
                <button
                  key={rate}
                  className="sm"
                  onClick={() => changeSpeed(rate)}
                  style={{
                    background: playbackRate === rate ? "#000" : "transparent",
                    color: playbackRate === rate ? "#fff" : "var(--color-text)",
                  }}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
            🎙️ Audio is streaming from master recording storage.
          </div>
        )}
      </div>

      {/* Workspace Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--color-border)", marginBottom: "1.5rem" }}>
        <button
          onClick={() => setActiveTab("transcript")}
          style={{
            border: "none",
            borderBottom: activeTab === "transcript" ? "2px solid #000" : "none",
            borderRadius: 0,
            background: "transparent",
            fontWeight: activeTab === "transcript" ? 700 : 400,
            color: activeTab === "transcript" ? "#000" : "var(--color-text-muted)",
            padding: "0.6rem 1rem",
          }}
        >
          📜 Verbatim Transcript ({segments.length})
        </button>

        <button
          onClick={() => setActiveTab("board")}
          style={{
            border: "none",
            borderBottom: activeTab === "board" ? "2px solid #000" : "none",
            borderRadius: 0,
            background: "transparent",
            fontWeight: activeTab === "board" ? 700 : 400,
            color: activeTab === "board" ? "#000" : "var(--color-text-muted)",
            padding: "0.6rem 1rem",
          }}
        >
          🖼️ Whiteboard &amp; Diagrams ({boardImages.length})
        </button>

        <button
          onClick={() => setActiveTab("ai")}
          style={{
            border: "none",
            borderBottom: activeTab === "ai" ? "2px solid #000" : "none",
            borderRadius: 0,
            background: "transparent",
            fontWeight: activeTab === "ai" ? 700 : 400,
            color: activeTab === "ai" ? "#000" : "var(--color-text-muted)",
            padding: "0.6rem 1rem",
          }}
        >
          🤖 AI Study Suite ({aiAnalyses.length})
        </button>

        <button
          onClick={() => setActiveTab("notes")}
          style={{
            border: "none",
            borderBottom: activeTab === "notes" ? "2px solid #000" : "none",
            borderRadius: 0,
            background: "transparent",
            fontWeight: activeTab === "notes" ? 700 : 400,
            color: activeTab === "notes" ? "#000" : "var(--color-text-muted)",
            padding: "0.6rem 1rem",
          }}
        >
          📝 Private Notes ({notes.length})
        </button>
      </div>

      {/* Tab Contents: TRANSCRIPT */}
      {activeTab === "transcript" && (
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1.5rem" }} className="grid-2col">
          <section style={{ display: "grid", gap: "0.75rem" }}>
            {segments.map((seg) => {
              const isActive = activeSegmentId === seg.id;
              const hasShaheed = seg.text.toLowerCase().includes("shaheed");

              return (
                <div
                  key={seg.id}
                  ref={isActive ? activeSegmentRef : null}
                  className="card"
                  style={{
                    borderColor: isActive ? "#000" : "var(--color-border)",
                    boxShadow: isActive ? "0 0 0 2px #000" : "none",
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

                  {/* Code-Word Indicator */}
                  {hasShaheed && (
                    <div style={{ background: "#fef3c7", border: "1px solid #fde68a", padding: "0.4rem 0.6rem", borderRadius: "var(--radius)", fontSize: "0.82rem", marginTop: "0.4rem", display: "flex", gap: 6, alignItems: "center" }}>
                      <span>💡 <strong>Teacher Code-Word: &quot;Shaheed&quot;</strong> = Covert Narcissist / Martyr Complex</span>
                      <Link href="/lexicon" style={{ marginLeft: "auto", textDecoration: "underline" }}>
                        View Lexicon →
                      </Link>
                    </div>
                  )}

                  {/* Actions Bar */}
                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
                    <button
                      className="sm"
                      onClick={() => handleConfusion(seg)}
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
            {segments.length === 0 && <p className="card">No transcript segments available.</p>}
          </section>

          {/* Right Sidebar: Quick Controls */}
          <aside style={{ display: "grid", gap: "1rem", alignSelf: "start" }}>
            <div className="card">
              <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>💡 Study Controls</h3>
              <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                Click any timestamp in the transcript or board photo to jump audio directly to that moment.
              </p>
              <button
                className="primary sm"
                onClick={() => {
                  setTargetSegment(null);
                  setNoteModalOpen(true);
                }}
                style={{ width: "100%" }}
              >
                + Add General Note
              </button>
            </div>

            {/* Quick Board Photos Preview */}
            {boardImages.length > 0 && (
              <div className="card">
                <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>🖼️ Whiteboard Snapshots</h3>
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  {boardImages.slice(0, 3).map((img) => (
                    <div
                      key={img.id}
                      onClick={() => img.timestampSec !== null && img.timestampSec !== undefined && jumpTo(img.timestampSec)}
                      style={{ cursor: "pointer", display: "flex", gap: 8, alignItems: "center", border: "1px solid var(--color-border)", padding: 4, borderRadius: "var(--radius)" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.imageUrl} alt="Board" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4 }} />
                      <div style={{ fontSize: "0.8rem", overflow: "hidden" }}>
                        <div style={{ fontWeight: 600, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{img.caption || "Board drawing"}</div>
                        {img.timestampSec !== null && img.timestampSec !== undefined && (
                          <span style={{ color: "var(--color-text-muted)", fontFamily: "monospace" }}>▶ {formatTime(img.timestampSec)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Tab Contents: WHITEBOARD & DIAGRAMS */}
      {activeTab === "board" && (
        <div style={{ display: "grid", gap: "1.5rem" }}>
          {boardImages.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1.5rem" }}>
              {boardImages.map((img) => (
                <div key={img.id} className="card" style={{ padding: "0.75rem", display: "flex", flexDirection: "column" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.imageUrl}
                    alt={img.caption || "Whiteboard diagram"}
                    style={{ width: "100%", height: 220, objectFit: "contain", background: "#f8f9fa", borderRadius: "var(--radius)" }}
                  />
                  <div style={{ marginTop: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong>{img.caption || "Whiteboard drawing"}</strong>
                    {img.timestampSec !== null && img.timestampSec !== undefined && (
                      <button className="sm" onClick={() => jumpTo(img.timestampSec!)} style={{ fontFamily: "monospace" }}>
                        ▶ Jump to {formatTime(img.timestampSec)}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card" style={{ textAlign: "center", padding: "3rem", color: "var(--color-text-muted)" }}>
              No whiteboard photos or diagrams uploaded for this lecture yet.
            </div>
          )}
        </div>
      )}

      {/* Tab Contents: AI STUDY SUITE */}
      {activeTab === "ai" && (
        <div style={{ display: "grid", gap: "1.25rem" }}>
          {aiAnalyses.map((item) => {
            const content = item.content || {};
            return (
              <div key={item.id} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  <span className="badge tag-interpretation" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                    {item.type.replace("_", " ")}
                  </span>
                  <span className="badge tag-source">✓ Approved by Instructor</span>
                </div>

                <div style={{ fontSize: "0.95rem", lineHeight: "1.6" }}>
                  {content.summary && <p style={{ margin: "0 0 0.5rem" }}>{content.summary}</p>}

                  {Array.isArray(content.concepts) && (
                    <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.5rem" }}>
                      {content.concepts.map((c: any, i: number) => (
                        <div key={i} style={{ background: "var(--color-surface-hover)", padding: "0.5rem 0.75rem", borderRadius: "var(--radius)" }}>
                          <strong>{c.term}:</strong> {c.definition}
                        </div>
                      ))}
                    </div>
                  )}

                  {Array.isArray(content.points) && (
                    <ul style={{ margin: "0.5rem 0", paddingLeft: "1.25rem" }}>
                      {content.points.map((p: any, i: number) => (
                        <li key={i}>{typeof p === "string" ? p : p.text}</li>
                      ))}
                    </ul>
                  )}

                  {Array.isArray(content.questions) && (
                    <ol style={{ margin: "0.5rem 0", paddingLeft: "1.25rem" }}>
                      {content.questions.map((q: any, i: number) => (
                        <li key={i}>{typeof q === "string" ? q : q.text}</li>
                      ))}
                    </ol>
                  )}

                  {Array.isArray(content.cards) && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.75rem", marginTop: "0.5rem" }}>
                      {content.cards.map((card: any, i: number) => (
                        <div key={i} style={{ border: "1px solid var(--color-border)", padding: "0.75rem", borderRadius: "var(--radius)", background: "var(--color-surface-hover)" }}>
                          <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", textTransform: "uppercase" }}>Question</div>
                          <strong>{card.front}</strong>
                          <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", textTransform: "uppercase", marginTop: "0.5rem" }}>Answer</div>
                          <div>{card.back}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {Array.isArray(content.outline) && (
                    <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.5rem" }}>
                      {content.outline.map((o: any, i: number) => (
                        <div key={i}>
                          <strong>{o.heading}</strong>
                          {Array.isArray(o.subpoints) && (
                            <ul style={{ margin: "0.25rem 0 0.5rem", paddingLeft: "1.25rem", color: "var(--color-text-muted)" }}>
                              {o.subpoints.map((sp: string, spi: number) => (
                                <li key={spi}>{sp}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {aiAnalyses.length === 0 && (
            <div className="card" style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-muted)" }}>
              No AI study materials approved for this lecture yet.
            </div>
          )}
        </div>
      )}

      {/* Tab Contents: PRIVATE NOTES */}
      {activeTab === "notes" && (
        <div style={{ display: "grid", gap: "1rem" }}>
          {notes.map((n) => (
            <div key={n.id} className="card" style={{ borderLeft: "3px solid #000" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--color-text-muted)", marginBottom: 4 }}>
                <span>Private Student Note</span>
                {n.timestampSec !== null && (
                  <button className="sm" onClick={() => jumpTo(n.timestampSec)} style={{ fontFamily: "monospace" }}>
                    ▶ {formatTime(n.timestampSec)}
                  </button>
                )}
              </div>
              <p style={{ margin: 0, fontSize: "0.95rem" }}>{n.text}</p>
            </div>
          ))}
          {notes.length === 0 && (
            <div className="card" style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-muted)" }}>
              No personal notes saved yet. Click &quot;+ Note&quot; on any transcript segment to take private notes.
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {noteModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <form onSubmit={handleSaveNote} className="card" style={{ width: 440, display: "grid", gap: "1rem", background: "#fff" }}>
            <h3 style={{ margin: 0 }}>Add Private Note</h3>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Write your private note here (strictly isolated to your account)..."
              rows={4}
              required
              style={{ width: "100%", padding: "0.5rem" }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="sm" onClick={() => setNoteModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="primary sm">
                Save Note
              </button>
            </div>
          </form>
        </div>
      )}

      {confusionModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div className="card" style={{ width: 500, display: "grid", gap: "1rem", background: "#fff" }}>
            <h3 style={{ margin: 0 }}>🤔 Instant Clarification</h3>
            {confusionLoading ? (
              <p>Analyzing concept...</p>
            ) : (
              <div>
                <p style={{ fontSize: "0.95rem", lineHeight: "1.6" }}>
                  {activeConfusionData?.aiExplanation?.simplified || "This concept explores the core behavioral dynamics discussed in the lecture."}
                </p>
                <div style={{ marginTop: "1rem", display: "flex", justifyContent: "flex-end" }}>
                  <button className="primary sm" onClick={() => setConfusionModalOpen(false)}>
                    Got it, thanks!
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
