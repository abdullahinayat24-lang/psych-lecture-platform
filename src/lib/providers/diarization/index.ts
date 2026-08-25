import type { SpeakerDiarizationProvider } from "../types";
import { PyannoteLocalProvider, NoDiarizationProvider } from "./pyannote";

let cached: SpeakerDiarizationProvider | null = null;

export function getDiarizationProvider(): SpeakerDiarizationProvider {
  if (cached) return cached;
  const kind = process.env.DIARIZATION_PROVIDER ?? "pyannote_local";
  cached = kind === "none" ? new NoDiarizationProvider() : new PyannoteLocalProvider();
  return cached;
}
