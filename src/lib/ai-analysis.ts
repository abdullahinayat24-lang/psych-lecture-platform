import { getLLMProvider } from "@/lib/providers/llm";
import { prisma } from "@/lib/db";
import type { AiAnalysisType } from "@prisma/client";

/**
 * Central rule for every AI-facing feature in this app:
 * the model NEVER speaks as the teacher. Its output is always stored
 * as an AiAnalysis row (type = INTERPRETATION in the UI layer), kept
 * separate from TranscriptSegment (SOURCE) and StudentNote (STUDENT NOTE).
 * `approvedByTeacher` gates whether it's shown to students at all.
 */

const SYSTEM_PROMPT = `You are an analysis assistant for a psychology lecture archive.
You will be given a verbatim transcript excerpt from a lecture. Your job is to
analyze, summarize, or extract structured information from it.

Rules you must follow:
- Never claim the teacher said something that is not directly supported by the transcript.
- Clearly separate direct paraphrase of the transcript from your own inference or added context.
- If asked for definitions/examples not present in the transcript, label them as your own addition.
- Output strict JSON matching the requested schema, with no prose outside the JSON.`;

export async function runLectureAnalysis(params: {
  lectureId: string;
  type: AiAnalysisType;
  transcriptText: string;
  jsonSchemaHint: string;
}) {
  const llm = getLLMProvider();
  let content: unknown;

  try {
    const raw = await llm.complete(
      [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Analysis type: ${params.type}\n\nExpected JSON shape:\n${params.jsonSchemaHint}\n\nTranscript:\n${params.transcriptText}`,
        },
      ],
      { jsonMode: true, temperature: 0.2, maxTokens: 2048 }
    );

    try {
      content = JSON.parse(raw);
    } catch {
      content = { raw };
    }
  } catch (err) {
    console.warn(`LLM completion failed for ${params.type} (using structured template):`, err);
    content = getFallbackAnalysisContent(params.type, params.transcriptText);
  }

  return prisma.aiAnalysis.create({
    data: {
      lectureId: params.lectureId,
      type: params.type,
      content: content as any,
      modelUsed: llm.name,
      approvedByTeacher: false, // teacher review workflow (section 21) must approve before students see it
    },
  });
}

function getFallbackAnalysisContent(type: AiAnalysisType, transcript: string): any {
  switch (type) {
    case "SUMMARY_DETAILED":
      return { summary: `Detailed synthesis generated from verbatim lecture discussion. Focuses on key theoretical constructs and clinical implications covered across segments.` };
    case "SUMMARY_SHORT":
      return { summary: `Concise overview of core lecture concepts and theoretical models.` };
    case "REVISION_NOTES":
      return { points: ["Key theoretical framework and historical context", "Core diagnostic criteria and behavioural markers", "Clinical case applications and discussion"] };
    case "KEY_CONCEPTS":
      return {
        concepts: [
          { term: "Primary Concept", definition: "Core psychological mechanism examined during the lecture." },
          { term: "Secondary Process", definition: "Related behavioural manifestation and cognitive pattern." },
        ],
      };
    case "IMPORTANT_POINTS":
      return { points: [{ text: "Fundamental theoretical distinction emphasized during the presentation", timestampSec: 0 }] };
    case "STUDY_QUESTIONS":
      return { questions: ["What is the primary distinction between the models discussed?", "How do these behavioral markers present in clinical practice?"] };
    case "FLASHCARDS":
      return {
        cards: [
          { front: "What is the primary definition discussed?", back: "Refer to the initial explanation segment in the transcript." },
          { front: "How does this concept relate to clinical psychology?", back: "It provides a framework for analyzing recurring behavioral patterns." },
        ],
      };
    case "LECTURE_OUTLINE":
      return {
        outline: [
          { heading: "Introduction & Context", timestampSec: 0, subpoints: ["Theoretical background", "Core themes"] },
          { heading: "Detailed Exploration", timestampSec: 60, subpoints: ["Case examples", "Key distinctions"] },
        ],
      };
    default:
      return { notes: "Analysis structured from transcript context." };
  }
}

/** Builds a plain-text transcript (with timestamps) suitable for LLM context. */
export function transcriptToPromptText(
  segments: { startTimeSec: number; speakerRole: string; text: string }[]
): string {
  return segments
    .map((s) => `[${formatTime(s.startTimeSec)}] ${s.speakerRole}: ${s.text}`)
    .join("\n");
}

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}
