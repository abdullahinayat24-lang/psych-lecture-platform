# Psychology Lecture Knowledge Platform — Foundation

This is a real, running foundation for the platform described in the spec —
not a mockup. It's scoped honestly: a project of this size (recording
pipeline, multilingual ASR, diarization, LLM analysis, full RBAC, topic
graph, search, PWA) is realistically weeks of work, not one response. What's
here is architecturally complete and functionally real for the parts it
covers, so the remaining parts plug into it without a rewrite.

## Stack

- **Next.js 14 (App Router) + TypeScript** — single codebase for UI + API,
  deploys cleanly to Vercel or, with the Edge runtime, Cloudflare Pages.
- **PostgreSQL + Prisma** — full schema in `prisma/schema.prisma` covering
  every entity from the spec (users, lectures, recordings/segments,
  speakers, transcript segments, topics/occurrences/relations, AI analyses,
  questions/answers, private student notes/bookmarks/highlights/confusions,
  markers, notifications, audit logs).
- **NextAuth (credentials + JWT)** — swappable; every API route re-checks
  the session server-side via `src/lib/rbac.ts`, never trusting the client.
- **Provider abstractions** (`src/lib/providers/`) — `SpeechToTextProvider`,
  `SpeakerDiarizationProvider`, `LLMProvider`, `EmbeddingProvider`,
  `StorageProvider`. Local/open-source implementations (Whisper, pyannote,
  Ollama, local filesystem) plus swap-in cloud implementations (OpenAI,
  Anthropic, Cloudflare R2), selected purely by environment variable.

## What actually works right now

- Auth: login, session, password hashing, role-based middleware + per-route
  server-side checks.
- Full RBAC enforcement at the API layer, including strict ownership checks
  on every private-data route (`notes`, `questions`, `confusions`) so one
  student can never read another's data, and the teacher can only see
  questions a student explicitly submitted.
- Lecture CRUD, publish/unpublish workflow, audit logging.
- Chunked recording upload pipeline: `start` → repeated `segment` uploads
  (each persisted immediately, so a dropped connection loses at most one
  chunk) → `finalize` ("STOP & SAVE", no duration cap anywhere).
- Structured, timestamped transcript model with teacher-only correction
  endpoint; students are blocked from mutation at the API level, not just
  the UI.
- Speaker diarization → anonymous labels → teacher rename endpoint.
- AI analysis pipeline: teacher-triggered, produces `AiAnalysis` rows tagged
  by type, unapproved by default, with a separate approval endpoint — AI
  output never reaches students until a teacher approves it (section 21).
- Topic knowledge pages with real timestamped occurrences and a timeline
  built only from actual lecture dates (never invented).
- "I didn't understand" flow: private confusion record + AI explanation,
  isolated to the student.
- Basic keyword search across lectures/transcript/topics/own notes.
- Authenticated audio streaming route — no static file ever exposes a
  lecture recording; every byte is gated by session + publish status.
- The lecture page (audio + synced transcript + topics + private notes)
  as a working page, not a mock.

## What's stubbed or needs a decision before it's production-ready

- **ffmpeg concatenation**: `finalize/route.ts` has the exact integration
  point (`mergeAudioSegments`) but doesn't merge chunks into one file yet —
  wire in `fluent-ffmpeg` or shell out to ffmpeg in a Docker sidecar.
- **Background jobs**: transcription/diarization currently run inline
  after finalize. For real lecture lengths, move this to a queue
  (Cloudflare Queues, BullMQ, etc.) — the async function is already
  isolated (`processRecordingAsync`) so this is a wiring change, not a
  rewrite.
- **Whisper/pyannote services**: the app calls HTTP endpoints for these;
  you need to run `whisper-asr-webservice` and a pyannote sidecar (both
  open-source, Docker-friendly) and point `WHISPER_LOCAL_URL` /
  `PYANNOTE_SERVICE_URL` at them.
- **Ollama**: install Ollama locally and pull a model for free local LLM
  analysis, or set `LLM_PROVIDER=anthropic` with an API key.
- **Semantic/vector search**: search is keyword-only (`ILIKE`) right now;
  `EmbeddingProvider` exists and the README in `search/route.ts` documents
  exactly how to add pgvector similarity search on top.
- **Dashboards** (sections 19–20), **date-wise archive UI** (section 18),
  **topic evolution UI**, **flashcards/study UI**, **PWA service worker**,
  **dark mode toggle**, **mobile-specific layouts** — schema and APIs exist
  for all of these; the pages themselves aren't built yet.
- **Password reset flow**: `PasswordResetToken` model exists; the
  email-sending + reset pages aren't wired up.
- **Rate limiting** is in-memory (fine for one instance); swap for
  Redis/Cloudflare rate limiting before scaling to multiple instances.

## Setup

```bash
cp .env.example .env       # fill in DATABASE_URL at minimum
npm install
npm run prisma:migrate
npm run seed                # creates teacher/student1 demo accounts
npm run dev
```

## Recommended next step

Given the remaining scope, I'd suggest continuing this in **Claude Code**
(desktop, VS Code, or terminal) rather than this chat interface — it can
run `npm install`/migrations directly, iterate file-by-file without
response-length limits, and keep the whole codebase in context across a
multi-day build. This chat has laid the architecture; Claude Code is the
better tool for finishing it.
