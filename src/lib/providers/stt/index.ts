import type { SpeechToTextProvider } from "../types";
import { WhisperLocalProvider, WhisperApiProvider } from "./whisper";

let cached: SpeechToTextProvider | null = null;

export function getSpeechToTextProvider(): SpeechToTextProvider {
  if (cached) return cached;
  const kind = process.env.STT_PROVIDER ?? "whisper_local";
  switch (kind) {
    case "whisper_api":
      cached = new WhisperApiProvider();
      break;
    case "whisper_local":
    default:
      cached = new WhisperLocalProvider();
  }
  return cached;
}
