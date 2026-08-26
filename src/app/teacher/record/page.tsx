"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  saveVaultSession,
  getLatestUnsavedSession,
  deleteVaultSession,
  VaultSession,
} from "@/lib/indexeddb-vault";

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
  const [liveTranscript, setLiveTranscript] = useState<string>("");
  const [recognizedSegments, setRecognizedSegments] = useState<LiveTranscriptSegment[]>([]);
  const [isSpeechRecActive, setIsSpeechRecActive] = useState(false);
  const [recoverableSession, setRecoverableSession] = useState<VaultSession | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  // Check for unsaved 10-hour fail-safe sessions on mount
  useEffect(() => {
    getLatestUnsavedSession().then((s) => {
      if (s && s.chunks && s.chunks.length > 0) {
        setRecoverableSession(s);
      }
    });
  }, []);

  async function restoreAndFinalize(sessionToRestore: VaultSession) {
    setIsRestoring(true);
    try {
      let audioDataUrl: string | undefined = undefined;
      if (sessionToRestore.chunks.length > 0) {
        const fullBlob = new Blob(sessionToRestore.chunks, { type: "audio/webm" });
        audioDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(fullBlob);
        });
      }

      await fetch(`/api/recordings/${sessionToRestore.lectureId}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioDataUrl,
          manualText: sessionToRestore.transcript || undefined,
          durationSec: sessionToRestore.durationSec || 60,
        }),
      });

      await deleteVaultSession(sessionToRestore.lectureId);
      router.push(`/teacher/review/${sessionToRestore.lectureId}`);
    } catch (e: any) {
      alert("Error restoring session: " + e.message);
      setIsRestoring(false);
    }
  }

  async function discardUnsavedSession(lectureIdToDiscard: string) {
    await deleteVaultSession(lectureIdToDiscard);
    setRecoverableSession(null);
  }

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
  const recordedBlobsRef = useRef<Blob[]>([]);
  const lectureIdRef = useRef<string | null>(null);

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
      `City College Sambrial - Lecture (${new Date().toLocaleDateString("en-GB")} ${new Date().toLocaleTimeString([], {
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
      setUploadStatus("Initializing recording entry...");
      try {
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

        if (lecRes.ok) {
          const { lecture } = await lecRes.json();
          setLectureId(lecture.id);
          lectureIdRef.current = lecture.id;

          fetch(`/api/recordings/${lecture.id}/start`, { method: "POST" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
              if (d?.recording?.id) setRecordingId(d.recording.id);
            })
            .catch(() => {});
        }
      } catch (lecErr) {
        console.warn("Initial lecture creation notice:", lecErr);
      }

      // 3. Initialize MediaRecorder & buffer
      recordedBlobsRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      sequenceIndexRef.current = 0;

      mediaRecorder.ondataavailable = async (e) => {
        if (e.data && e.data.size > 0) {
          recordedBlobsRef.current.push(e.data);
          const currentSeq = sequenceIndexRef.current++;
          const currentOffset = elapsedSec;
          setChunkCount((prev) => prev + 1);
          setUploadStatus(`Recording live audio (${recordedBlobsRef.current.length} blocks)...`);

          if (lectureIdRef.current) {
            const formData = new FormData();
            formData.append("chunk", e.data, `chunk-${currentSeq}.webm`);
            formData.append("sequenceIndex", String(currentSeq));
            formData.append("startOffsetSec", String(currentOffset));

            fetch(`/api/recordings/${lectureIdRef.current}/segment`, {
              method: "POST",
              body: formData,
            }).catch(() => {});
          }
        }
      };

      mediaRecorder.start(3000);
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

      let audioDataUrl: string | undefined = undefined;
      if (recordedBlobsRef.current.length > 0) {
        try {
          const fullBlob = new Blob(recordedBlobsRef.current, { type: "audio/webm" });
          audioDataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(fullBlob);
          });
        } catch (audioErr) {
          console.warn("Audio blob serialization warning:", audioErr);
        }
      }

      let activeLectureId = lectureId;
      if (!activeLectureId) {
        const createRes = await fetch("/api/lectures", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title:
              title.trim() ||
              `City College Sambrial - Lecture (${new Date().toLocaleDateString("en-GB")})`,
            description: description || undefined,
            category: category || "Clinical Psychology",
            primaryLanguage: language,
            plannedDuration: parseInt(plannedDurationMin, 10) * 60,
          }),
        });
        if (createRes.ok) {
          const { lecture } = await createRes.json();
          activeLectureId = lecture.id;
          setLectureId(lecture.id);
        }
      }

      if (!activeLectureId) throw new Error("Could not create lecture record on server");

      const res = await fetch(`/api/recordings/${activeLectureId}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioDataUrl,
          clientSegments: clientSegmentsToSend,
          manualText: liveTranscript.trim() || undefined,
          durationSec: elapsedSec,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to finalize recording on server");
      }

      await deleteVaultSession(activeLectureId);
      router.push(`/teacher/review/${activeLectureId}`);
    } catch (err: any) {
      console.error("Finalize error:", err);
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

      <h1 style={{ marginBottom: "0.25rem" }}>🎙️ Amer Naseem&apos;s Recording Studio</h1>
      <p style={{ color: "var(--color-text-muted)", marginTop: 0 }}>
        1-Click live speech capture in Urdu, Punjabi &amp; English with 10-hour disk backup.
      </p>

      {recoverableSession && (
        <div
          className="card"
          style={{
            backgroundColor: "rgba(234, 179, 8, 0.1)",
            border: "2px solid #ca8a04",
            margin: "1rem 0 1.5rem",
            padding: "1.25rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <h3 style={{ margin: "0 0 4px", color: "#a16207" }}>
                🛡️ 10-Hour Fail-Safe: Unsaved Lecture Found on Disk
              </h3>
              <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--color-text-muted)" }}>
                Recovered {recoverableSession.chunks?.length || 0} audio blocks (~{Math.round((recoverableSession.durationSec || 60) / 60)} mins) from earlier.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="primary sm"
                disabled={isRestoring}
                onClick={() => restoreAndFinalize(recoverableSession)}
              >
                {isRestoring ? "Restoring..." : "⚡ 1-Click Restore & Save"}
              </button>
              <button
                className="sm danger"
                disabled={isRestoring}
                onClick={() => discardUnsavedSession(recoverableSession.lectureId)}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {!isStarted ? (
        /* Simple 1-Click Setup Form */
        <div className="card" style={{ display: "grid", gap: "1.25rem", marginTop: "1.5rem", padding: "1.75rem" }}>
          <label>
            <strong style={{ fontSize: "1rem" }}>Lecture Title (Optional)</strong>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Psychology, Music (Raags), CSS, or Family Dynamics by Amer Naseem..."
              style={{ width: "100%", marginTop: 6, fontSize: "1.05rem", padding: "0.6rem 0.8rem" }}
            />
            <span style={{ fontSize: "0.82rem", color: "var(--color-text-muted)", marginTop: 4, display: "block" }}>
              💡 Leave blank to automatically title from what you discuss during the lecture.
            </span>
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }} className="grid-2col">
            <label>
              <strong>Category / Subject</strong>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Psychology / Multidisciplinary"
                style={{ width: "100%", marginTop: 4 }}
              />
            </label>

            <label>
              <strong>Language Dialect</strong>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                style={{ width: "100%", marginTop: 4 }}
              >
                <option value="MIXED_URDU_ENGLISH">Mixed Urdu, Punjabi &amp; English (Recommended)</option>
                <option value="PUNJABI">Punjabi</option>
                <option value="URDU">Urdu</option>
                <option value="ENGLISH">English</option>
              </select>
            </label>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1rem",
              paddingTop: "0.75rem",
              borderTop: "1px solid var(--color-border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.88rem", color: "var(--color-text-muted)" }}>
              <span>🛡️ 10-Hour Fail-Safe Active</span>
              <span>·</span>
              <span>🎙️ Auto-Transcription Ready</span>
            </div>

            <button
              className="primary"
              onClick={startRecording}
              style={{
                padding: "0.85rem 2.2rem",
                fontSize: "1.1rem",
                fontWeight: 700,
                backgroundColor: "#dc2626",
                color: "#ffffff",
                border: "none",
                borderRadius: "var(--radius)",
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(220, 38, 38, 0.35)",
              }}
            >
              🔴 Start Recording (1-Click)
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
