"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";

export const dynamic = "force-dynamic";

type ManualMarkerItem = {
  timestampSec: number;
  markerType: string;
  text?: string;
};

type LiveTranscriptSegment = {
  text: string;
  startTimeSec: number;
  endTimeSec: number;
  language?: string;
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

  // Live Speech Recognition & Transcripts
  const [liveTranscript, setLiveTranscript] = useState<string>("");
  const [recognizedSegments, setRecognizedSegments] = useState<LiveTranscriptSegment[]>([]);
  const [isSpeechRecActive, setIsSpeechRecActive] = useState(false);

  // References
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const sequenceIndexRef = useRef(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const segmentsRef = useRef<LiveTranscriptSegment[]>([]);
  const liveTextRef = useRef<string>("");

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

  // Setup Browser Web Speech API for real-time speech transcription
  function setupLiveSpeechRecognition() {
    try {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        console.warn("Web Speech API not supported in this browser");
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang =
        language === "URDU" ? "ur-PK" : language === "PUNJABI" ? "pa-PK" : "en-US";

      let segmentStartSec = 0;

      recognition.onstart = () => {
        setIsSpeechRecActive(true);
        segmentStartSec = 0;
      };

      recognition.onresult = (event: any) => {
        let interimText = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            const currentSec = elapsedSec;
            const newSeg: LiveTranscriptSegment = {
              text: transcript.trim(),
              startTimeSec: segmentStartSec,
              endTimeSec: Math.max(currentSec, segmentStartSec + 3),
              language: language === "URDU" ? "URDU" : "ENGLISH",
            };
            segmentStartSec = currentSec;

            segmentsRef.current.push(newSeg);
            setRecognizedSegments([...segmentsRef.current]);

            liveTextRef.current = (liveTextRef.current + " " + transcript.trim()).trim();
            setLiveTranscript(liveTextRef.current);
          } else {
            interimText += transcript;
          }
        }
      };

      recognition.onerror = (err: any) => {
        console.warn("Speech recognition error:", err.error);
      };

      recognition.onend = () => {
        // Auto-restart if still recording
        if (isStarted && !isPaused && !isFinalizing) {
          try {
            recognition.start();
          } catch {}
        } else {
          setIsSpeechRecActive(false);
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      console.warn("Live speech recognition initialization failed:", e);
    }
  }

  async function startRecording() {
    const effectiveTitle =
      title.trim() ||
      `Psychology Lecture (${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })})`;

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
          title: effectiveTitle,
          description: description || undefined,
          category: category || "Clinical Psychology",
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
              setUploadStatus(`Chunk #${currentSeq + 1} saved`);
            }
          } catch (uploadErr) {
            console.error("Segment upload error:", uploadErr);
          }
        }
      };

      mediaRecorder.start(5000);
      setIsStarted(true);
      setIsPaused(false);

      // Start elapsed timer
      timerRef.current = setInterval(() => {
        setElapsedSec((prev) => prev + 1);
      }, 1000);

      // Start live speech transcription
      setupLiveSpeechRecognition();
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
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch {}
      }
      setIsPaused(false);
      timerRef.current = setInterval(() => setElapsedSec((p) => p + 1), 1000);
      setUploadStatus("Recording resumed");
    } else {
      mediaRecorderRef.current.pause();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
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
    setUploadStatus("Saving transcript and finalizing recording...");

    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
    }

    // Wait 1s for final events
    await new Promise((r) => setTimeout(r, 1000));

    try {
      const clientSegmentsToSend =
        segmentsRef.current.length > 0
          ? segmentsRef.current
          : liveTranscript.trim()
          ? [
              {
                text: liveTranscript.trim(),
                startTimeSec: 0,
                endTimeSec: Math.max(elapsedSec, 10),
                language: language === "URDU" ? "URDU" : "ENGLISH",
              },
            ]
          : undefined;

      const res = await fetch(`/api/recordings/${lectureId}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientSegments: clientSegmentsToSend,
          manualText: liveTranscript.trim() || undefined,
          durationSec: elapsedSec,
        }),
      });

      if (!res.ok) throw new Error("Failed to finalize recording on server");

      router.push(`/teacher/review/${lectureId}`);
    } catch (err: any) {
      console.error("Finalize error:", err);
      // Still redirect to review if lecture exists
      if (lectureId) {
        router.push(`/teacher/review/${lectureId}`);
      } else {
        alert(err.message || "Failed to finalize recording");
        setIsFinalizing(false);
      }
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
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginBottom: "0.75rem", fontSize: "0.85rem" }}>
        <Link href="/dashboard" style={{ color: "var(--color-text-muted)" }}>
          ← Dashboard
        </Link>
        <span style={{ color: "var(--color-border)" }}>/</span>
        <span style={{ fontWeight: 600 }}>Recording Studio</span>
      </div>

      <h1 style={{ marginBottom: "0.25rem" }}>🎙️ Live Lecture Recording Studio</h1>
      <p style={{ color: "var(--color-text-muted)", marginTop: 0 }}>
        Continuous audio capture with real-time speech recognition and automatic clinical topic indexing.
      </p>

      {!isStarted ? (
        /* Setup Form */
        <div className="card" style={{ display: "grid", gap: "1rem", marginTop: "1.5rem" }}>
          <label>
            <strong>Lecture Title (Optional)</strong>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Leave blank to auto-generate from lecture speech content..."
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
            <strong>Optional Lecture Notes / Outline (or paste text directly)</strong>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Key concepts to discuss (e.g. Narcissism, Depression, Cognitive Schemas)..."
              rows={3}
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem" }}>
            <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
              No hard duration limits — speak freely until you click STOP & SAVE.
            </span>
            <button className="primary" onClick={startRecording} style={{ padding: "0.75rem 1.5rem", fontSize: "1rem" }}>
              🔴 Start Live Recording
            </button>
          </div>
        </div>
      ) : (
        /* Active Recording Console */
        <div style={{ display: "grid", gap: "1.5rem", marginTop: "1.5rem" }}>
          {/* Main Control Banner */}
          <div
            className="card"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1rem",
              background: isPaused ? "var(--color-surface-hover)" : "var(--color-surface)",
              border: isPaused ? "1px solid #f59e0b" : "1px solid var(--color-border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  backgroundColor: isPaused ? "#f59e0b" : "#ef4444",
                  boxShadow: isPaused ? "none" : "0 0 10px #ef4444",
                  animation: isPaused ? "none" : "pulse 1.5s infinite",
                }}
              />
              <div>
                <div style={{ fontSize: "2rem", fontWeight: 700, fontFamily: "monospace" }}>
                  {formatTime(elapsedSec)}
                </div>
                <div style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                  {isPaused ? "RECORDING PAUSED" : "RECORDING LIVE AUDIO"}
                </div>
              </div>
            </div>

            {/* Audio Meter */}
            <div style={{ width: 140 }}>
              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: 4 }}>
                Mic Activity
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
                    backgroundColor: micLevel > 70 ? "#ef4444" : "#10b981",
                    transition: "width 0.1s ease",
                  }}
                />
              </div>
            </div>

            {/* Main Action Buttons */}
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button onClick={togglePause} style={{ padding: "0.6rem 1.2rem" }}>
                {isPaused ? "▶️ Resume" : "⏸️ Pause"}
              </button>
              <button
                className="primary"
                onClick={finalizeRecording}
                disabled={isFinalizing}
                style={{ padding: "0.6rem 1.25rem", backgroundColor: "#000", color: "#fff" }}
              >
                {isFinalizing ? "Saving..." : "⏹️ STOP & SAVE LECTURE"}
              </button>
            </div>
          </div>

          {/* Live Real-time Speech Transcription Ticker */}
          <div className="card" style={{ display: "grid", gap: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: "0.95rem" }}>
                🗣️ Real-time Speech Recognition {isSpeechRecActive && <span style={{ color: "#10b981", fontSize: "0.8rem" }}>● Listening</span>}
              </strong>
              <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                Auto-transcribing your speech in real-time
              </span>
            </div>

            <textarea
              value={liveTranscript}
              onChange={(e) => {
                setLiveTranscript(e.target.value);
                liveTextRef.current = e.target.value;
              }}
              placeholder="Your spoken words will appear here in real-time as you speak... You can also type or paste lecture notes here."
              rows={5}
              style={{
                width: "100%",
                padding: "0.75rem",
                fontSize: "0.95rem",
                lineHeight: "1.5",
                fontFamily: "inherit",
              }}
            />

            {recognizedSegments.length > 0 && (
              <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                Captured {recognizedSegments.length} timestamped speech segment(s)
              </div>
            )}
          </div>

          {/* Clinical Markers */}
          <div className="card" style={{ display: "grid", gap: "0.75rem" }}>
            <strong style={{ fontSize: "0.95rem" }}>📌 Live Clinical Markers</strong>
            <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", margin: 0 }}>
              Tag key moments during the lecture with zero typing required:
            </p>

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button className="sm" onClick={() => addMarker("CORE_CONCEPT")}>
                💡 Core Concept
              </button>
              <button className="sm" onClick={() => addMarker("CASE_EXAMPLE")}>
                🧠 Clinical Case Study
              </button>
              <button className="sm" onClick={() => addMarker("EXAM_IMPORTANT")}>
                ⭐ Exam Highlight
              </button>
              <button className="sm" onClick={() => addMarker("STUDENT_QUESTION")}>
                ❓ Student Question
              </button>
            </div>

            {markers.length > 0 && (
              <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {markers.slice(0, 5).map((m, idx) => (
                  <span key={idx} className="badge tag-source">
                    {formatTime(m.timestampSec)} - {m.markerType}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
