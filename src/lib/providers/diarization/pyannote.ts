import type { SpeakerDiarizationProvider, DiarizationResult } from "../types";
import { getStorageProvider } from "../storage";

/**
 * Calls a locally-hosted pyannote.audio diarization service (open-source,
 * run via a small Python/Docker sidecar exposing a REST endpoint). Speaker
 * recognition is explicitly NOT treated as ground truth — labels come back
 * anonymous ("SPEAKER_00", "SPEAKER_01", ...) and the teacher renames them
 * after review (section 6).
 */
export class PyannoteLocalProvider implements SpeakerDiarizationProvider {
  readonly name = "pyannote_local";

  async diarize(audio: { storageKey: string }): Promise<DiarizationResult> {
    const storage = getStorageProvider();
    const audioUrl = await storage.getSignedUrl(audio.storageKey);
    const serviceUrl = process.env.PYANNOTE_SERVICE_URL ?? "http://localhost:9001";

    const res = await fetch(`${serviceUrl}/diarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio_url: audioUrl }),
    });

    if (!res.ok) {
      throw new Error(`Diarization service error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const turns = (data.turns ?? []).map((t: any) => ({
      rawSpeakerLabel: t.speaker as string,
      startSec: t.start as number,
      endSec: t.end as number,
    }));
    const speakerCount = new Set(turns.map((t: any) => t.rawSpeakerLabel)).size;

    return { turns, speakerCount };
  }
}

/** No-op provider: everything attributed to a single UNKNOWN speaker. Useful for dev/testing without the sidecar running. */
export class NoDiarizationProvider implements SpeakerDiarizationProvider {
  readonly name = "none";
  async diarize(): Promise<DiarizationResult> {
    return { turns: [], speakerCount: 0 };
  }
}
