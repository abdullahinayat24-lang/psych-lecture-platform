"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

type BoardImageItem = {
  id: string;
  imageUrl: string;
  caption?: string | null;
  timestampSec?: number | null;
  createdAt: string;
};

export default function TeacherReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [lecture, setLecture] = useState<any>(null);
  const [speakers, setSpeakers] = useState<any[]>([]);
  const [segments, setSegments] = useState<any[]>([]);
  const [analyses, setAnalyses] = useState<any[]>([]);
  const [boardImages, setBoardImages] = useState<BoardImageItem[]>([]);
  const [loading, setLoading] = useState(true);

  // AI run states
  const [selectedAiTypes, setSelectedAiTypes] = useState<string[]>([
    "SUMMARY_DETAILED",
    "KEY_CONCEPTS",
    "REVISION_NOTES",
    "STUDY_QUESTIONS",
    "FLASHCARDS",
    "LECTURE_OUTLINE",
  ]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Metadata Edit states
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [categoryDraft, setCategoryDraft] = useState("");
  const [seriesNameDraft, setSeriesNameDraft] = useState("");
  const [partNumberDraft, setPartNumberDraft] = useState<string>("");

  // Diarization Edit
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
  const [speakerNameDraft, setSpeakerNameDraft] = useState("");
  const [speakerRoleDraft, setSpeakerRoleDraft] = useState("TEACHER");

  // Transcript Edit
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
  const [segmentTextDraft, setSegmentTextDraft] = useState("");
  const [segmentTypeDraft, setSegmentTypeDraft] = useState("TEACHER_EXPLANATION");

  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pasteTranscriptText, setPasteTranscriptText] = useState("");
  const [isSavingTranscript, setIsSavingTranscript] = useState(false);

  // Image Upload states
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageCaption, setImageCaption] = useState("");
  const [imageTimestampSec, setImageTimestampSec] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  useEffect(() => {
    if (!id) return;
    loadData();
  }, [id]);

  async function loadData() {
    try {
      const [lecRes, transRes, aiRes, imgRes] = await Promise.all([
        fetch(`/api/lectures/${id}`),
        fetch(`/api/lectures/${id}/transcript`),
        fetch(`/api/ai?lectureId=${id}`),
        fetch(`/api/images?lectureId=${id}`),
      ]);

      if (lecRes.ok) {
        const d = await lecRes.json();
        setLecture(d.lecture);
        setTitleDraft(d.lecture?.title || "");
        setCategoryDraft(d.lecture?.category || "Clinical Psychology");
        setSeriesNameDraft(d.lecture?.seriesName || "");
        setPartNumberDraft(d.lecture?.partNumber ? String(d.lecture.partNumber) : "");
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
      if (imgRes.ok) {
        const d = await imgRes.json();
        setBoardImages(d.images || []);
      }
    } catch (err) {
      console.error("Load review data error:", err);
    } finally {
      setLoading(false);
    }
  }

  async function saveMetadata() {
    const res = await fetch(`/api/lectures/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: titleDraft.trim() || lecture.title,
        category: categoryDraft.trim() || undefined,
        seriesName: seriesNameDraft.trim() || null,
        partNumber: partNumberDraft ? parseInt(partNumberDraft, 10) : null,
      }),
    });

    if (res.ok) {
      setIsEditingTitle(false);
      loadData();
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

  async function handlePasteFullTranscript() {
    if (!pasteTranscriptText.trim()) {
      alert("Please paste some transcript text first.");
      return;
    }

    setIsSavingTranscript(true);
    try {
      const res = await fetch(`/api/lectures/${id}/transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: pasteTranscriptText.trim(),
          replaceFull: true,
        }),
      });

      if (res.ok) {
        setShowPasteBox(false);
        setPasteTranscriptText("");
        await loadData();
        alert("Transcript updated successfully! You can now run the AI Extraction Pipeline.");
      } else {
        alert("Failed to update transcript.");
      }
    } catch (err: any) {
      alert(err.message || "Failed to save transcript");
    } finally {
      setIsSavingTranscript(false);
    }
  }

  // Handle board image selection and upload
  function handleImageFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function uploadBoardImage(e: React.FormEvent) {
    e.preventDefault();
    if (!imagePreview) {
      alert("Please select an image first.");
      return;
    }

    setIsUploadingImage(true);
    try {
      let ts: number | undefined = undefined;
      if (imageTimestampSec.trim()) {
        if (imageTimestampSec.includes(":")) {
          const parts = imageTimestampSec.split(":");
          ts = parseInt(parts[0] || "0", 10) * 60 + parseInt(parts[1] || "0", 10);
        } else {
          ts = parseFloat(imageTimestampSec);
        }
      }

      const res = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lectureId: id,
          imageUrl: imagePreview,
          caption: imageCaption.trim() || "Whiteboard diagram",
          timestampSec: ts,
        }),
      });

      if (res.ok) {
        setImageFile(null);
        setImagePreview(null);
        setImageCaption("");
        setImageTimestampSec("");
        loadData();
      } else {
        alert("Failed to upload image.");
      }
    } catch (err: any) {
      alert(err.message || "Upload error");
    } finally {
      setIsUploadingImage(false);
    }
  }

  async function deleteBoardImage(imageId: string) {
    if (!confirm("Delete this whiteboard photo?")) return;
    const res = await fetch(`/api/images/${imageId}`, { method: "DELETE" });
    if (res.ok) {
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

  async function approveAllAi() {
    for (const item of analyses) {
      if (!item.approvedByTeacher) {
        await fetch(`/api/ai/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approved: true }),
        });
      }
    }
    loadData();
  }

  async function togglePublish() {
    if (!lecture) return;
    const nextStatus = lecture.status === "PUBLISHED" ? "IN_REVIEW" : "PUBLISHED";
    const confirmMsg =
      nextStatus === "PUBLISHED"
        ? "Publish this lecture to all students? Students will be able to stream audio, view board photos, and read approved materials."
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

  async function handleDeleteLecture() {
    if (!confirm(`Are you sure you want to permanently delete "${lecture?.title}"?`)) return;

    try {
      const res = await fetch(`/api/lectures/${id}`, { method: "DELETE" });
      if (res.ok) {
        alert("Lecture deleted successfully.");
        router.push("/dashboard");
      } else {
        alert("Failed to delete lecture.");
      }
    } catch (err: any) {
      alert(err.message || "Error deleting lecture");
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
      {/* Top Navigation */}
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
            <Link href="/dashboard" style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
              ← Dashboard
            </Link>
            <span style={{ color: "var(--color-border)" }}>/</span>
            <span className={`badge ${isPublished ? "badge-published" : "badge-draft"}`}>
              {lecture.status}
            </span>
          </div>

          {/* Editable Title & Metadata */}
          {isEditingTitle ? (
            <div className="card" style={{ display: "grid", gap: "0.75rem", margin: "0.75rem 0", padding: "1rem" }}>
              <label>
                <strong>Lecture Title:</strong>
                <input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  style={{ width: "100%", fontSize: "1.1rem", padding: "0.4rem 0.6rem", marginTop: 4 }}
                />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }} className="grid-3col">
                <label>
                  <strong>Category / Domain:</strong>
                  <input
                    value={categoryDraft}
                    onChange={(e) => setCategoryDraft(e.target.value)}
                    placeholder="e.g. Music, Psychology, CSS, History, Home Problems"
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
                <label>
                  <strong>Series / Course Name:</strong>
                  <input
                    value={seriesNameDraft}
                    onChange={(e) => setSeriesNameDraft(e.target.value)}
                    placeholder="e.g. Narcissism & Domestic Patterns"
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
                <label>
                  <strong>Part Number:</strong>
                  <input
                    type="number"
                    value={partNumberDraft}
                    onChange={(e) => setPartNumberDraft(e.target.value)}
                    placeholder="1"
                    style={{ width: "100%", marginTop: 4 }}
                  />
                </label>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button className="primary sm" onClick={saveMetadata}>
                  Save Lecture Details
                </button>
                <button className="sm" onClick={() => setIsEditingTitle(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <h1 style={{ margin: "0 0 4px" }}>{lecture.title}</h1>
                <button className="sm" onClick={() => setIsEditingTitle(true)} title="Edit title and series">
                  ✏️ Edit Details
                </button>
              </div>

              <p style={{ color: "var(--color-text-muted)", margin: 0, fontSize: "0.9rem" }}>
                Recorded on {new Date(lecture.lectureDate).toLocaleDateString()} · <strong>{lecture.category || "General"}</strong> · {lecture.primaryLanguage}
                {lecture.seriesName && (
                  <span style={{ marginLeft: 8, color: "#000", fontWeight: 600 }}>
                    | 🔗 Series: {lecture.seriesName} {lecture.partNumber ? `(Part ${lecture.partNumber})` : ""}
                  </span>
                )}
              </p>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link href={`/lectures/${lecture.id}`}>
            <button>🎧 Student View</button>
          </Link>
          <button className={isPublished ? "danger" : "primary"} onClick={togglePublish}>
            {isPublished ? "🔒 Unpublish Lecture" : "📢 Publish to Students"}
          </button>
          <button className="danger sm" onClick={handleDeleteLecture} title="Permanently delete lecture">
            🗑️ Delete
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: "2rem" }}>
        {/* 🖼️ Whiteboard & Board Photos Section */}
        <section className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <h2 style={{ fontSize: "1.2rem", margin: 0 }}>🖼️ Whiteboard, Board Photos & Diagram Attachments</h2>
            <span className="badge tag-source">{boardImages.length} Photo(s)</span>
          </div>

          <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", margin: "0 0 1rem" }}>
            Upload snapshots of the whiteboard, diagrams, or slides. Students can view them side-by-side with the audio transcript.
          </p>

          {/* Upload Form */}
          <form onSubmit={uploadBoardImage} style={{ background: "var(--color-surface-hover)", padding: "1rem", borderRadius: "var(--radius)", marginBottom: "1.25rem", border: "1px solid var(--color-border)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 120px auto", gap: "0.75rem", alignItems: "flex-end" }} className="grid-responsive">
              <label>
                <strong style={{ fontSize: "0.85rem" }}>Select Photo / Diagram:</strong>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileChange}
                  style={{ width: "100%", marginTop: 4, fontSize: "0.85rem" }}
                  required
                />
              </label>

              <label>
                <strong style={{ fontSize: "0.85rem" }}>Caption / Description:</strong>
                <input
                  value={imageCaption}
                  onChange={(e) => setImageCaption(e.target.value)}
                  placeholder="e.g. Board drawing: Trait hierarchy"
                  style={{ width: "100%", marginTop: 4 }}
                />
              </label>

              <label>
                <strong style={{ fontSize: "0.85rem" }}>Timestamp:</strong>
                <input
                  value={imageTimestampSec}
                  onChange={(e) => setImageTimestampSec(e.target.value)}
                  placeholder="04:30"
                  style={{ width: "100%", marginTop: 4 }}
                />
              </label>

              <button type="submit" className="primary sm" disabled={isUploadingImage || !imagePreview} style={{ height: 38 }}>
                {isUploadingImage ? "Uploading..." : "➕ Add to Lecture"}
              </button>
            </div>

            {imagePreview && (
              <div style={{ marginTop: "0.75rem", display: "flex", alignItems: "center", gap: "1rem" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview}
                  alt="Preview"
                  style={{ height: 80, width: "auto", borderRadius: "var(--radius)", objectFit: "cover", border: "1px solid var(--color-border)" }}
                />
                <span style={{ fontSize: "0.82rem", color: "var(--color-text-muted)" }}>Preview ready to attach.</span>
              </div>
            )}
          </form>

          {/* Board Images Grid */}
          {boardImages.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem" }}>
              {boardImages.map((img) => (
                <div key={img.id} style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius)", overflow: "hidden", background: "var(--color-surface)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.imageUrl}
                    alt={img.caption || "Board photo"}
                    style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }}
                  />
                  <div style={{ padding: "0.6rem" }}>
                    <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: 2 }}>{img.caption || "Whiteboard diagram"}</div>
                    {img.timestampSec !== null && img.timestampSec !== undefined && (
                      <span className="badge tag-source" style={{ fontSize: "0.75rem" }}>
                        ⏱️ {formatTime(img.timestampSec)}
                      </span>
                    )}
                    <div style={{ marginTop: "0.5rem", display: "flex", justifyContent: "flex-end" }}>
                      <button className="sm danger" onClick={() => deleteBoardImage(img.id)} style={{ fontSize: "0.75rem", padding: "0.2rem 0.4rem" }}>
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem", margin: 0 }}>
              No whiteboard photos attached yet. Use the upload box above to add board drawings.
            </p>
          )}
        </section>

        {/* Verbatim Transcript Segments Editor */}
        <section className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <h2 style={{ fontSize: "1.2rem", margin: 0 }}>📜 Transcript Editor & Verbatim Content</h2>
            <button className="sm" onClick={() => setShowPasteBox(!showPasteBox)}>
              {showPasteBox ? "Close Editor" : "➕ Edit / Paste Full Lecture Text"}
            </button>
          </div>

          <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", margin: "0 0 1rem" }}>
            The AI extraction pipeline generates summaries and flashcards directly from these transcript segments.
          </p>

          {/* Paste / Replace Full Transcript Modal Box */}
          {showPasteBox && (
            <div
              style={{
                background: "var(--color-surface-hover)",
                padding: "1rem",
                borderRadius: "var(--radius)",
                marginBottom: "1.5rem",
                border: "1px solid var(--color-border)",
              }}
            >
              <strong style={{ fontSize: "0.95rem" }}>Paste or Type Lecture Text:</strong>
              <p style={{ fontSize: "0.82rem", color: "var(--color-text-muted)", margin: "4px 0 8px" }}>
                Paste your verbatim notes or speech (e.g. your lecture on Narcissism, Music, CSS, or Family dynamics):
              </p>
              <textarea
                value={pasteTranscriptText}
                onChange={(e) => setPasteTranscriptText(e.target.value)}
                placeholder="Main Idea: Narcissists may appear confident and successful, but many experience chronic dissatisfaction because their self-worth depends heavily on external validation and maintaining an idealized self-image. 1. Constant Need for Attention... 2. Everything Becomes a Competition..."
                rows={6}
                style={{ width: "100%", padding: "0.75rem", fontSize: "0.92rem", marginBottom: "0.75rem" }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="primary sm"
                  onClick={handlePasteFullTranscript}
                  disabled={isSavingTranscript}
                >
                  {isSavingTranscript ? "Updating..." : "💾 Save as Lecture Transcript"}
                </button>
                <button className="sm" onClick={() => setShowPasteBox(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

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
                No transcript segments available. Click &quot;Edit / Paste Full Lecture Text&quot; above to add content.
              </p>
            )}
          </div>
        </section>

        {/* Speaker Diarization Manager */}
        <section className="card">
          <h2 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>👥 Speaker Identification & Roles</h2>
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
                      style={{ padding: "0.3rem 0.6rem", fontSize: "0.9rem" }}
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
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <strong>{spk.displayName}</strong>
                      <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                        ({spk.rawLabel})
                      </span>
                      <span className={`badge ${spk.role === "TEACHER" ? "tag-source" : "tag-interpretation"}`}>
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
          </div>
        </section>

        {/* AI Extraction & Teacher Supervision */}
        <section className="card">
          <h2 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>🤖 AI Extraction & Study Suite</h2>
          <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", margin: "0 0 1rem" }}>
            Generate structured analyses based on the lecture transcript. Approve them before students see them.
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

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button className="primary" onClick={runAiPipeline} disabled={isAnalyzing}>
                {isAnalyzing ? "🧠 Running AI Pipeline..." : "⚡ Run AI Extraction Pipeline"}
              </button>
              {analyses.length > 0 && (
                <button onClick={approveAllAi} style={{ fontSize: "0.88rem" }}>
                  ✓ Approve All for Students
                </button>
              )}
            </div>
          </div>

          {/* Generated Analyses List */}
          <div style={{ display: "grid", gap: "1rem" }}>
            {analyses.map((item) => {
              const content = item.content || {};
              return (
                <div
                  key={item.id}
                  style={{
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius)",
                    padding: "1.25rem",
                    background: item.approvedByTeacher ? "var(--color-surface)" : "var(--color-surface)",
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
                      <span className="badge tag-interpretation" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                        {item.type.replace("_", " ")}
                      </span>
                      {item.approvedByTeacher && (
                        <span className="badge tag-source" style={{ marginLeft: 8 }}>
                          ✓ Approved for Students
                        </span>
                      )}
                    </div>
                    <button
                      className={`sm ${item.approvedByTeacher ? "danger" : "primary"}`}
                      onClick={() => toggleAiApproval(item.id, item.approvedByTeacher)}
                    >
                      {item.approvedByTeacher ? "Revoke Approval" : "✓ Approve for Students"}
                    </button>
                  </div>

                  {/* Clean Formatted Output */}
                  <div style={{ fontSize: "0.95rem", lineHeight: "1.6" }}>
                    {/* Summary */}
                    {content.summary && <p style={{ margin: "0 0 0.5rem" }}>{content.summary}</p>}

                    {/* Key Concepts */}
                    {Array.isArray(content.concepts) && (
                      <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.5rem" }}>
                        {content.concepts.map((c: any, i: number) => (
                          <div key={i} style={{ background: "var(--color-surface-hover)", padding: "0.5rem 0.75rem", borderRadius: "var(--radius)" }}>
                            <strong>{c.term}:</strong> {c.definition}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Revision Points */}
                    {Array.isArray(content.points) && (
                      <ul style={{ margin: "0.5rem 0", paddingLeft: "1.25rem" }}>
                        {content.points.map((p: any, i: number) => (
                          <li key={i}>{typeof p === "string" ? p : p.text}</li>
                        ))}
                      </ul>
                    )}

                    {/* Study Questions */}
                    {Array.isArray(content.questions) && (
                      <ol style={{ margin: "0.5rem 0", paddingLeft: "1.25rem" }}>
                        {content.questions.map((q: any, i: number) => (
                          <li key={i}>{typeof q === "string" ? q : q.text}</li>
                        ))}
                      </ol>
                    )}

                    {/* Flashcards */}
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

                    {/* Outline */}
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
          </div>
        </section>
      </div>
    </main>
  );
}
