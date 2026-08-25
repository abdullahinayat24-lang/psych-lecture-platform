"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type ManualMarkerItem = {
  timestampSec: number;
  markerType: string;
  text?: string;
};

export default function RecordStudioPage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  // Lecture metadata
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Clinical Psychology");
  const [language, setLanguage] = useState("MIXED_URDU_ENGLISH");
  const [plannedDurationMin, setPlannedDurationMin] = useState("60");

  // Recording lifecycle
  const [isStarted, setIsStarted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [lectureId, setLectureId] = useState<string | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [chunkCount, setChunkCount] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string>("Ready");
  const [markers, setMarkers] = useState<ManualMarkerItem[]>([]);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [micLevel, setMicLevel] = useState(0);

  // References
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const sequenceIndexRef = useRef(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const isTeacher = (session?.user as any)?.role === "TEACHER";

  // Prevent accidental navigation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isStarted && !isFinalizing) {
        e.preventDefault();
        e.returnValue = "A lecture recording is in progress. Are you sure you want to leave?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isStarted, isFinalizing]);

  // Audio level monitoring
  function setupAudioMeter(stream: MediaStream) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] ?? 0;
        }
        const avg = dataArray.length > 0 ? sum / dataArray.length : 0;
        setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
        animFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (err) {
      console.warn("AudioContext visualizer not supported:", err);
    }
  }

  async function startRecording() {
    if (!title.trim()) {
      alert("Please provide a lecture title.");
      return;
    }

    try {
      setUploadStatus("Requesting microphone permission...");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      audioStreamRef.current = stream;
      setupAudioMeter(stream);

      // 1. Create lecture in database
      setUploadStatus("Creating lecture entry...");
      const lecRes = await fetch("/api/lectures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || undefined,
          category: category || undefined,
          primaryLanguage: language,
          plannedDuration: parseInt(plannedDurationMin, 10) * 60,
        }),
      });

      if (!lecRes.ok) throw new Error("Failed to create lecture record");
      const { lecture } = await lecRes.json();
      setLectureId(lecture.id);

      // 2. Start recording session
      setUploadStatus("Initializing chunk pipeline...");
      const startRes = await fetch(`/api/recordings/${lecture.id}/start`, { method: "POST" });
      if (!startRes.ok) throw new Error("Failed to start recording session");
      const { recording } = await startRes.json();
      setRecordingId(recording.id);

      // 3. Initialize MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      sequenceIndexRef.current = 0;

      mediaRecorder.ondataavailable = async (e) => {
        if (e.data && e.data.size > 0) {
          const currentSeq = sequenceIndexRef.current++;
          const currentOffset = elapsedSec;
          setChunkCount((prev) => prev + 1);
          setUploadStatus(`Uploading chunk #${currentSeq + 1}...`);

          const formData = new FormData();
          formData.append("chunk", e.data, `chunk-${currentSeq}.webm`);
          formData.append("sequenceIndex", String(currentSeq));
          formData.append("startOffsetSec", String(currentOffset));

          try {
            const segRes = await fetch(`/api/recordings/${lecture.id}/segment`, {
              method: "POST",
              body: formData,
            });
            if (segRes.ok) {
              setUploadStatus(`Chunk #${currentSeq + 1} saved to storage`);
            } else {
              setUploadStatus(`Warning: Chunk #${currentSeq + 1} upload failed, retrying on stop`);
            }
          } catch (uploadErr) {
            console.error("Segment upload error:", uploadErr);
          }
        }
      };

      // Emit chunk every 5 seconds for safety against network disconnects
      mediaRecorder.start(5000);
      setIsStarted(true);
      setIsPaused(false);

      // Start elapsed timer
      timerRef.current = setInterval(() => {
        setElapsedSec((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error("Recording start error:", err);
      alert(err.message || "Failed to start recording");
      setUploadStatus("Error starting recording");
    }
  }

  function togglePause() {
    if (!mediaRecorderRef.current) return;

    if (isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = setInterval(() => setElapsedSec((p) => p + 1), 1000);
      setUploadStatus("Recording resumed");
    } else {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
      setUploadStatus("Recording paused");
    }
  }

  async function addMarker(type: string) {
    if (!lectureId) return;

    const currentSec = elapsedSec;
    const newMarker: ManualMarkerItem = { timestampSec: currentSec, markerType: type };
    setMarkers((prev) => [newMarker, ...prev]);

    try {
      await fetch("/api/markers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lectureId,
          timestampSec: currentSec,
          markerType: type,
        }),
      });
    } catch (err) {
      console.warn("Marker save error:", err);
    }
  }

  async function finalizeRecording() {
    if (!confirm("Are you ready to STOP & SAVE this lecture recording?")) return;

    setIsFinalizing(true);
    setUploadStatus("Finalizing audio chunks and stopping recording...");

    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (audioContextRef.current) audioContextRef.current.close().catch(() => {});

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
    }

    // Wait 1.5s for final dataavailable event to dispatch
    await new Promise((r) => setTimeout(r, 1500));

    try {
      const res = await fetch(`/api/recordings/${lectureId}/finalize`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to finalize recording on server");

      alert("Lecture recording successfully saved! Redirecting to review suite...");
      router.push(`/teacher/review/${lectureId}`);
    } catch (err: any) {
      console.error("Finalize error:", err);
      alert(err.message || "Failed to finalize recording");
      setIsFinalizing(false);
    }
  }

  function formatTime(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  if (status === "loading") {
    return <main style={{ maxWidth: 800, margin: "0 auto", padding: "2rem" }}>Loading Studio...</main>;
  }

  if (!isTeacher) {
    return (
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "3rem 1rem", textAlign: "center" }}>
        <h2>Instructor Access Only</h2>
        <p style={{ color: "var(--color-text-muted)" }}>
          You must be signed in with a Teacher account to record and publish lectures.
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1.25rem" }}>
      <h1 style={{ marginBottom: "0.25rem" }}>🎙️ Live Lecture Recording Studio</h1>
      <p style={{ color: "var(--color-text-muted)", marginTop: 0 }}>
        Continuous audio capture with automatic 5-second chunk persistence and live timestamped markers.
      </p>

      {!isStarted ? (
        /* Setup Form */
        <div className="card" style={{ display: "grid", gap: "1rem", marginTop: "1.5rem" }}>
          <label>
            <strong>Lecture Title *</strong>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Cognitive Psychology: Memory Models & Retrieval"
              required
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }} className="grid-2col">
            <label>
              <strong>Category / Module</strong>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Clinical Psychology"
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>

            <label>
              <strong>Primary Language</strong>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                style={{ width: "100%", marginTop: 4 }}
              >
                <option value="MIXED_URDU_ENGLISH">Mixed Urdu & English (Recommended)</option>
                <option value="ENGLISH">English</option>
                <option value="URDU">Urdu</option>
                <option value="PUNJABI">Punjabi</option>
                <option value="MIXED_PUNJABI_ENGLISH">Mixed Punjabi & English</option>
              </select>
            </label>
          </div>

          <label>
            <strong>Description / Lecture Notes</strong>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Key objectives, case studies to be discussed..."
              rows={3}
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem" }}>
            <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
              No hard duration limits — recording continues until you click STOP & SAVE.
            </span>
            <button className="primary" onClick={startRecording} style={{ padding: "0.75rem 1.5rem", fontSize: "1rem" }}>
              🔴 Start Live Recording
            </button>
          </div>
        </div>
      ) : (
        /* Active Recording Console */
        <div style={{ display: "grid", gap: "1.5rem", marginTop: "1.5rem" }}>
          {/* Live Timer & Visualizer */}
          <div
            className="card"
            style={{
              background: "var(--color-surface)",
              textAlign: "center",
              padding: "2rem 1rem",
              border: isPaused ? "2px dashed #f0ad4e" : "2px solid var(--color-danger)",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                color: isPaused ? "#f0ad4e" : "var(--color-danger)",
                fontWeight: 600,
                fontSize: "0.95rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: "0.5rem",
              }}
            >
              <span style={{ fontSize: "1.2rem" }}>{isPaused ? "⏸️ PAUSED" : "● ON AIR"}</span>
            </div>

            <div
              style={{
                fontFamily: "monospace",
                fontSize: "3.5rem",
                fontWeight: 700,
                color: "var(--color-text)",
                letterSpacing: "0.04em",
              }}
            >
              {formatTime(elapsedSec)}
            </div>

            {/* Microphone Volume Meter */}
            <div style={{ maxWidth: 300, margin: "1rem auto 0", textAlign: "left" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: 4 }}>
                Microphone Activity
              </div>
              <div
                style={{
                  height: 8,
                  background: "var(--color-border)",
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${micLevel}%`,
                    background: micLevel > 75 ? "#d9534f" : "var(--color-accent)",
                    transition: "width 0.05s ease",
                  }}
                />
              </div>
            </div>

            <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginTop: "1rem" }}>
              {uploadStatus} · <strong>{chunkCount} chunks saved</strong>
            </div>

            {/* Controls */}
            <div style={{ display: "flex", justifyContent: "center", gap: "1rem", marginTop: "1.5rem" }}>
              <button onClick={togglePause} style={{ padding: "0.6rem 1.25rem" }}>
                {isPaused ? "▶️ Resume" : "⏸️ Pause"}
              </button>
              <button
                className="danger"
                onClick={finalizeRecording}
                disabled={isFinalizing}
                style={{ padding: "0.6rem 1.5rem" }}
              >
                {isFinalizing ? "Finalizing..." : "🛑 STOP & SAVE LECTURE"}
              </button>
            </div>
          </div>

          {/* Live Manual Markers Panel */}
          <div className="card">
            <h3 style={{ marginBottom: "0.5rem" }}>📌 Live Timestamp Markers</h3>
            <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", margin: "0 0 1rem" }}>
              Click to tag significant moments during speech. These will be indexed into the transcript and topic graph.
            </p>

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
              <button onClick={() => addMarker("IMPORTANT")}>⚠️ Important Point</button>
              <button onClick={() => addMarker("QUESTION")}>❓ Student Question</button>
              <button onClick={() => addMarker("EXAMPLE")}>💡 Case Example</button>
              <button onClick={() => addMarker("CONFUSING")}>🤔 Needs Clarification</button>
              <button onClick={() => addMarker("RESEARCH_LATER")}>🔬 Research Reference</button>
              <button onClick={() => addMarker("NOTE")}>📝 General Note</button>
            </div>

            {/* Live Marker Feed */}
            <div style={{ display: "grid", gap: "0.5rem", maxHeight: 200, overflowY: "auto" }}>
              {markers.map((m, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.4rem 0.75rem",
                    background: "var(--color-surface-hover)",
                    borderRadius: "var(--radius)",
                    fontSize: "0.85rem",
                  }}
                >
                  <span>
                    <strong>{m.markerType}</strong>
                  </span>
                  <span style={{ fontFamily: "monospace", color: "var(--color-text-muted)" }}>
                    {formatTime(m.timestampSec)}
                  </span>
                </div>
              ))}
              {markers.length === 0 && (
                <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", textAlign: "center" }}>
                  No markers placed yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
