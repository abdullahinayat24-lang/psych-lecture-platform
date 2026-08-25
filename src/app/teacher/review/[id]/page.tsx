"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

export default function TeacherReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [lecture, setLecture] = useState<any>(null);
  const [speakers, setSpeakers] = useState<any[]>([]);
  const [segments, setSegments] = useState<any[]>([]);
  const [analyses, setAnalyses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // AI run states
  const [selectedAiTypes, setSelectedAiTypes] = useState<string[]>([
    "SUMMARY_DETAILED",
    "KEY_CONCEPTS",
    "REVISION_NOTES",
    "STUDY_QUESTIONS",
  ]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Edit states
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
  const [speakerNameDraft, setSpeakerNameDraft] = useState("");
  const [speakerRoleDraft, setSpeakerRoleDraft] = useState("TEACHER");

  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [segmentTextDraft, setSegmentTextDraft] = useState("");
  const [segmentTypeDraft, setSegmentTypeDraft] = useState("TEACHER_EXPLANATION");

  useEffect(() => {
    if (!id) return;
    loadData();
  }, [id]);

  async function loadData() {
    try {
      const [lecRes, transRes, aiRes] = await Promise.all([
        fetch(`/api/lectures/${id}`),
        fetch(`/api/lectures/${id}/transcript`),
        fetch(`/api/ai?lectureId=${id}`),
      ]);

      if (lecRes.ok) {
        const d = await lecRes.json();
        setLecture(d.lecture);
        setSpeakers(d.lecture?.speakers || []);
      }
      if (transRes.ok) {
        const d = await transRes.json();
        setSegments(d.segments || []);
      }
      if (aiRes.ok) {
        const d = await aiRes.json();
        setAnalyses(d.analyses || []);
      }
    } catch (err) {
      console.error("Load review data error:", err);
    } finally {
      setLoading(false);
    }
  }

  async function updateSpeaker(speakerId: string) {
    if (!speakerNameDraft.trim()) return;

    const res = await fetch(`/api/lectures/${id}/speakers`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        speakerId,
        displayName: speakerNameDraft,
        role: speakerRoleDraft,
      }),
    });

    if (res.ok) {
      setEditingSpeakerId(null);
      loadData();
    }
  }

  async function updateSegment(segmentId: string) {
    const res = await fetch(`/api/lectures/${id}/transcript`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        segmentId,
        text: segmentTextDraft,
        segmentType: segmentTypeDraft,
      }),
    });

    if (res.ok) {
      setEditingSegmentId(null);
      loadData();
    }
  }

  async function runAiPipeline() {
    if (selectedAiTypes.length === 0) {
      alert("Select at least one AI analysis type.");
      return;
    }

    setIsAnalyzing(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lectureId: id,
          types: selectedAiTypes,
        }),
      });

      if (res.ok) {
        alert("AI analysis generation complete! Review and approve items below.");
        loadData();
      } else {
        const err = await res.json();
        alert(err.error || "AI generation failed");
      }
    } catch (err: any) {
      alert(err.message || "Failed to trigger AI pipeline");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function toggleAiApproval(analysisId: string, currentApproved: boolean) {
    const res = await fetch(`/api/ai/${analysisId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved: !currentApproved }),
    });

    if (res.ok) {
      loadData();
    }
  }

  async function togglePublish() {
    if (!lecture) return;
    const nextStatus = lecture.status === "PUBLISHED" ? "IN_REVIEW" : "PUBLISHED";
    const confirmMsg =
      nextStatus === "PUBLISHED"
        ? "Publish this lecture to all students? Students will be able to stream audio and read approved materials."
        : "Unpublish this lecture? Students will no longer see it.";

    if (!confirm(confirmMsg)) return;

    const res = await fetch(`/api/lectures/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });

    if (res.ok) {
      loadData();
    }
  }

  function formatTime(sec: number) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  if (loading) return <main style={{ padding: "2rem" }}>Loading Lecture Review...</main>;
  if (!lecture) return <main style={{ padding: "2rem" }}>Lecture not found</main>;

  const isPublished = lecture.status === "PUBLISHED";

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1.25rem" }}>
      {/* Top Banner */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Link href="/dashboard" style={{ fontSize: "0.85rem" }}>
              ← Dashboard
            </Link>
            <span style={{ color: "var(--color-border)" }}>/</span>
            <span className={`badge ${isPublished ? "badge-published" : "badge-draft"}`}>
              {lecture.status}
            </span>
          </div>
          <h1 style={{ margin: "0 0 4px" }}>{lecture.title}</h1>
          <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
            Recorded on {new Date(lecture.lectureDate).toLocaleDateString()} · {lecture.primaryLanguage}
          </p>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Link href={`/lectures/${lecture.id}`}>
            <button>🎧 Student View</button>
          </Link>
          <button className={isPublished ? "danger" : "primary"} onClick={togglePublish}>
            {isPublished ? "🔒 Unpublish Lecture" : "📢 Publish to Students"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: "2rem" }}>
        {/* Speaker Diarization Manager */}
        <section className="card">
          <h2 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>👥 Speaker Identification & Roles</h2>
          <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", margin: "0 0 1rem" }}>
            Rename raw acoustic labels (e.g. SPEAKER_00) to actual names and designate Instructor vs Student roles.
          </p>

          <div style={{ display: "grid", gap: "0.75rem" }}>
            {speakers.map((spk) => (
              <div
                key={spk.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.6rem 0.9rem",
                  background: "var(--color-surface-hover)",
                  borderRadius: "var(--radius)",
                }}
              >
                {editingSpeakerId === spk.id ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", width: "100%" }}>
                    <input
                      value={speakerNameDraft}
                      onChange={(e) => setSpeakerNameDraft(e.target.value)}
                      style={{ padding: "0.3rem 0.6rem", fontSize: "0.9rem" }}
                    />
                    <select
                      value={speakerRoleDraft}
                      onChange={(e) => setSpeakerRoleDraft(e.target.value)}
                      style={{ padding: "0.3rem 0.6rem", fontSize: "0.85rem" }}
                    >
                      <option value="TEACHER">TEACHER</option>
                      <option value="STUDENT">STUDENT</option>
                      <option value="UNKNOWN">UNKNOWN</option>
                    </select>
                    <button className="primary sm" onClick={() => updateSpeaker(spk.id)}>
                      Save
                    </button>
                    <button className="sm" onClick={() => setEditingSpeakerId(null)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <div>
                      <strong>{spk.displayName}</strong>{" "}
                      <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>({spk.rawLabel})</span>
                      <span className="badge tag-source" style={{ marginLeft: 8 }}>
                        {spk.role}
                      </span>
                    </div>
                    <button
                      className="sm"
                      onClick={() => {
                        setEditingSpeakerId(spk.id);
                        setSpeakerNameDraft(spk.displayName);
                        setSpeakerRoleDraft(spk.role);
                      }}
                    >
                      ✏️ Rename
                    </button>
                  </>
                )}
              </div>
            ))}
            {speakers.length === 0 && (
              <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                No speakers identified yet. Diarization will populate speakers once transcription finishes.
              </p>
            )}
          </div>
        </section>

        {/* AI Analysis Suite */}
        <section className="card">
          <h2 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>🤖 AI Extraction & Teacher Supervision</h2>
          <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", margin: "0 0 1rem" }}>
            Generate structured analyses. AI outputs are marked as <strong>INTERPRETATION</strong> and are{" "}
            <strong>never visible to students until you explicitly approve them</strong>.
          </p>

          {/* Trigger Box */}
          <div
            style={{
              background: "var(--color-surface-hover)",
              padding: "1rem",
              borderRadius: "var(--radius)",
              marginBottom: "1.5rem",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.5rem" }}>
              Select Analyses to Generate:
            </div>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
              {[
                { key: "SUMMARY_DETAILED", label: "Detailed Summary" },
                { key: "KEY_CONCEPTS", label: "Key Concepts" },
                { key: "REVISION_NOTES", label: "Revision Notes" },
                { key: "STUDY_QUESTIONS", label: "Study Questions" },
                { key: "FLASHCARDS", label: "Flashcards" },
                { key: "LECTURE_OUTLINE", label: "Outline" },
              ].map((opt) => (
                <label key={opt.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.88rem" }}>
                  <input
                    type="checkbox"
                    checked={selectedAiTypes.includes(opt.key)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedAiTypes([...selectedAiTypes, opt.key]);
                      } else {
                        setSelectedAiTypes(selectedAiTypes.filter((k) => k !== opt.key));
                      }
                    }}
                  />
                  {opt.label}
                </label>
              ))}
            </div>

            <button className="primary" onClick={runAiPipeline} disabled={isAnalyzing}>
              {isAnalyzing ? "🧠 Running AI Pipeline..." : "⚡ Run AI Extraction Pipeline"}
            </button>
          </div>

          {/* Generated Analyses List */}
          <div style={{ display: "grid", gap: "1rem" }}>
            {analyses.map((item) => (
              <div
                key={item.id}
                style={{
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius)",
                  padding: "1rem",
                  background: item.approvedByTeacher ? "var(--color-success-bg)" : "var(--color-surface)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.75rem",
                  }}
                >
                  <div>
                    <span className="badge tag-interpretation">{item.type}</span>
                    <span style={{ fontSize: "0.78rem", color: "var(--color-text-muted)", marginLeft: 8 }}>
                      Model: {item.modelUsed}
                    </span>
                  </div>
                  <button
                    className={`sm ${item.approvedByTeacher ? "danger" : "primary"}`}
                    onClick={() => toggleAiApproval(item.id, item.approvedByTeacher)}
                  >
                    {item.approvedByTeacher ? "✓ Approved (Click to Revoke)" : "Approve for Students"}
                  </button>
                </div>

                <div
                  style={{
                    fontSize: "0.9rem",
                    background: "var(--color-surface)",
                    padding: "0.75rem",
                    borderRadius: "var(--radius)",
                    maxHeight: 250,
                    overflowY: "auto",
                  }}
                >
                  <pre
                    style={{
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      fontFamily: "inherit",
                      fontSize: "0.85rem",
                    }}
                  >
                    {JSON.stringify(item.content, null, 2)}
                  </pre>
                </div>
              </div>
            ))}
            {analyses.length === 0 && (
              <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                No AI analyses generated yet. Select analysis types above and run the pipeline.
              </p>
            )}
          </div>
        </section>

        {/* Verbatim Transcript Segments Editor */}
        <section className="card">
          <h2 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>📜 Transcript Editor & Timestamp Segments</h2>
          <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", margin: "0 0 1rem" }}>
            Review, edit, and classify transcript segments (Teacher Explanation, Student Question, Case Example).
          </p>

          <div style={{ display: "grid", gap: "0.75rem", maxHeight: 500, overflowY: "auto" }}>
            {segments.map((seg) => (
              <div
                key={seg.id}
                style={{
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius)",
                  padding: "0.75rem",
                  background: "var(--color-surface)",
                }}
              >
                {editingSegmentId === seg.id ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                        {formatTime(seg.startTimeSec)} - {formatTime(seg.endTimeSec)}
                      </span>
                      <select
                        value={segmentTypeDraft}
                        onChange={(e) => setSegmentTypeDraft(e.target.value)}
                        style={{ padding: "0.2rem 0.5rem", fontSize: "0.8rem" }}
                      >
                        <option value="TEACHER_EXPLANATION">TEACHER_EXPLANATION</option>
                        <option value="STUDENT_QUESTION">STUDENT_QUESTION</option>
                        <option value="TEACHER_ANSWER">TEACHER_ANSWER</option>
                        <option value="EXAMPLE">EXAMPLE</option>
                        <option value="IMPORTANT">IMPORTANT</option>
                        <option value="OTHER">OTHER</option>
                      </select>
                    </div>
                    <textarea
                      value={segmentTextDraft}
                      onChange={(e) => setSegmentTextDraft(e.target.value)}
                      rows={3}
                      style={{ width: "100%", fontSize: "0.9rem" }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="primary sm" onClick={() => updateSegment(seg.id)}>
                        Save Changes
                      </button>
                      <button className="sm" onClick={() => setEditingSegmentId(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "0.8rem",
                        marginBottom: 4,
                      }}
                    >
                      <span>
                        <strong>{seg.speaker?.displayName || seg.speakerRole}</strong>{" "}
                        <span className="badge tag-source">{seg.segmentType}</span>
                      </span>
                      <span style={{ color: "var(--color-text-muted)", fontFamily: "monospace" }}>
                        {formatTime(seg.startTimeSec)} - {formatTime(seg.endTimeSec)}
                      </span>
                    </div>
                    <p style={{ margin: "0.4rem 0", fontSize: "0.92rem" }}>{seg.text}</p>
                    <button
                      className="sm"
                      onClick={() => {
                        setEditingSegmentId(seg.id);
                        setSegmentTextDraft(seg.text);
                        setSegmentTypeDraft(seg.segmentType);
                      }}
                    >
                      ✏️ Edit Segment
                    </button>
                  </div>
                )}
              </div>
            ))}
            {segments.length === 0 && (
              <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                No transcript segments available.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
