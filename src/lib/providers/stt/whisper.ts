import type { SpeechToTextProvider, TranscriptionResult } from "../types";
import { getStorageProvider } from "../storage";

/**
 * Calls a locally-hosted Whisper HTTP service (e.g. `whisper-asr-webservice`
 * or `faster-whisper-server`, both open-source, run via Docker). This keeps
 * transcription fully local/free — no proprietary API required.
 *
 * Expected service contract: POST {url}/transcribe with the audio file,
 * returns { segments: [{ text, start, end, language, confidence }] }.
 * Swap the URL/model via WHISPER_LOCAL_URL / WHISPER_LOCAL_MODEL.
 */
export class WhisperLocalProvider implements SpeechToTextProvider {
  readonly name = "whisper_local";

  async transcribe(audio: { storageKey: string }): Promise<TranscriptionResult> {
    const storage = getStorageProvider();
    const audioUrl = await storage.getSignedUrl(audio.storageKey);
    const serviceUrl = process.env.WHISPER_LOCAL_URL ?? "http://localhost:9000";

    const res = await fetch(`${serviceUrl}/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audio_url: audioUrl,
        model: process.env.WHISPER_LOCAL_MODEL ?? "medium",
        // Whisper handles code-switched Urdu/Punjabi/English reasonably
        // well when language is left null and auto-detected per segment.
        language: null,
        task: "transcribe",
      }),
    });

    if (!res.ok) {
      throw new Error(`Whisper local service error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const segments = (data.segments ?? []).map((s: any) => ({
      text: s.text as string,
      startSec: s.start as number,
      endSec: s.end as number,
      language: (s.language as string) ?? "unknown",
      confidence: s.confidence as number | undefined,
    }));

    const detectedLanguages = Array.from(new Set(segments.map((s: any) => s.language)));
    return { segments, detectedLanguages: detectedLanguages as string[] };
  }
}

/** OpenAI Whisper API fallback for teams without local GPU capacity. */
export class WhisperApiProvider implements SpeechToTextProvider {
  readonly name = "whisper_api";

  async transcribe(audio: { storageKey: string }): Promise<TranscriptionResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for whisper_api provider");

    const storage = getStorageProvider();
    const audioUrl = await storage.getSignedUrl(audio.storageKey);
    const fileRes = await fetch(audioUrl);
    const fileBlob = await fileRes.blob();

    const form = new FormData();
    form.append("file", fileBlob, "audio.webm");
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!res.ok) throw new Error(`OpenAI transcription error: ${res.status}`);
    const data = await res.json();

    const segments = (data.segments ?? []).map((s: any) => ({
      text: s.text as string,
      startSec: s.start as number,
      endSec: s.end as number,
      language: (data.language as string) ?? "unknown",
    }));

    return { segments, detectedLanguages: [data.language ?? "unknown"] };
  }
}
