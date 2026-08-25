// ============================================================
// Provider interfaces (section 29). Nothing in the application
// should import a concrete vendor SDK directly — always go
// through these interfaces so STT/diarization/LLM/storage can
// each be swapped independently.
// ============================================================

export interface TranscribedWord {
  word: string;
  startSec: number;
  endSec: number;
  confidence?: number;
}

export interface TranscribedSegment {
  text: string;
  startSec: number;
  endSec: number;
  language: string; // BCP-47-ish code, e.g. "en", "ur", "pa"
  confidence?: number;
  words?: TranscribedWord[];
}

export interface TranscriptionResult {
  segments: TranscribedSegment[];
  detectedLanguages: string[];
}

/** Speech-to-text abstraction. Implementations: Whisper (local), Whisper API, OpenAI, etc. */
export interface SpeechToTextProvider {
  readonly name: string;
  transcribe(audio: { storageKey: string }): Promise<TranscriptionResult>;
}

export interface DiarizedTurn {
  rawSpeakerLabel: string; // e.g. "SPEAKER_00"
  startSec: number;
  endSec: number;
}

export interface DiarizationResult {
  turns: DiarizedTurn[];
  speakerCount: number;
}

/** Speaker diarization abstraction. Implementations: pyannote (local), etc. */
export interface SpeakerDiarizationProvider {
  readonly name: string;
  diarize(audio: { storageKey: string }): Promise<DiarizationResult>;
}

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  /** Force strict JSON output for structured analysis tasks. */
  jsonMode?: boolean;
}

/** LLM abstraction. Implementations: local (Ollama), Anthropic, OpenAI. */
export interface LLMProvider {
  readonly name: string;
  complete(messages: LlmMessage[], options?: LlmCompletionOptions): Promise<string>;
}

/** Embedding abstraction for semantic search. */
export interface EmbeddingProvider {
  readonly name: string;
  embed(texts: string[]): Promise<number[][]>;
}

/** Storage abstraction: local filesystem, Cloudflare R2, S3, etc. */
export interface StorageProvider {
  readonly name: string;
  put(key: string, data: Buffer | Uint8Array, contentType: string): Promise<{ key: string }>;
  getSignedUrl(key: string, expiresInSec?: number): Promise<string>;
  delete(key: string): Promise<void>;
}
