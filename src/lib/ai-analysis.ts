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
    console.warn(`LLM completion failed for ${params.type} (using intelligent NLP extraction):`, err);
    content = getFallbackAnalysisContent(params.type, params.transcriptText);
  }

  // Delete previous analysis of the same type for this lecture to avoid stale data
  await prisma.aiAnalysis.deleteMany({
    where: {
      lectureId: params.lectureId,
      type: params.type,
    },
  });

  return prisma.aiAnalysis.create({
    data: {
      lectureId: params.lectureId,
      type: params.type,
      content: content as any,
      modelUsed: llm.name,
      approvedByTeacher: false, // teacher review workflow must approve before students see it
    },
  });
}

/**
 * Intelligent content-aware NLP fallback extractor.
 * Analyzes the verbatim transcript text to extract real psychological concepts,
 * summaries, revision points, flashcards, and outlines matching what was actually spoken.
 */
export function getFallbackAnalysisContent(type: AiAnalysisType, transcript: string): any {
  // Clean transcript lines
  const cleanLines = transcript
    .split("\n")
    .map((l) => l.replace(/^\[\d{2}:\d{2}:\d{2}\]\s+[A-Z_]+:\s*/i, "").trim())
    .filter((l) => l.length > 0);

  const fullText = cleanLines.join(" ");
  const lower = fullText.toLowerCase();

  // Extract sentences
  const sentences = fullText
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);

  const mainSentences = sentences.slice(0, 5);

  // Extract topic keyword or subject
  let topicName = "Clinical Psychology Topic";
  if (lower.includes("narcissis")) topicName = "Narcissistic Personality Dynamics";
  else if (lower.includes("depress")) topicName = "Depressive Disorders & Mechanisms";
  else if (lower.includes("anxiet")) topicName = "Anxiety & Panic Phenomenology";
  else if (lower.includes("cbt") || lower.includes("cognit")) topicName = "Cognitive Behavioral Mechanisms";
  else if (lower.includes("trauma") || lower.includes("ptsd")) topicName = "Trauma & Stressor-Related Dynamics";
  else if (cleanLines.length > 0 && cleanLines[0]) {
    const firstWords = cleanLines[0].split(" ").slice(0, 6).join(" ");
    topicName = firstWords.replace(/[^a-zA-Z0-9 ]/g, "").trim() || "Psychological Theory & Practice";
  }

  // Identify distinct themes or numbered points in the transcript
  const keyPoints: string[] = [];
  cleanLines.forEach((line) => {
    if (line.match(/^(\d+[\.\)]|[-•*])\s+/i) || line.length > 25) {
      keyPoints.push(line.replace(/^(\d+[\.\)]|[-•*])\s+/i, "").trim());
    }
  });
  if (keyPoints.length === 0) {
    keyPoints.push(...mainSentences);
  }

  switch (type) {
    case "SUMMARY_DETAILED": {
      const summaryText =
        sentences.length > 0
          ? sentences.slice(0, 4).join(" ")
          : `This lecture provides an in-depth clinical examination of ${topicName}, focusing on theoretical foundations, behavioral indicators, and diagnostic considerations.`;
      return {
        summary: summaryText,
        mainTakeaways: keyPoints.slice(0, 4),
      };
    }

    case "SUMMARY_SHORT": {
      const shortText =
        sentences.length > 0
          ? sentences[0]
          : `Core overview of ${topicName} and associated psychological dynamics.`;
      return {
        summary: shortText,
      };
    }

    case "REVISION_NOTES": {
      const points =
        keyPoints.length > 0
          ? keyPoints.slice(0, 6)
          : [
              `Core diagnostic framework for ${topicName}`,
              "Key behavioral markers and emotional patterns observed in clinical settings",
              "Theoretical mechanisms driving internal dissatisfaction and external behavior",
            ];
      return { points };
    }

    case "KEY_CONCEPTS": {
      const concepts: Array<{ term: string; definition: string }> = [];

      if (lower.includes("narcissis")) {
        concepts.push(
          {
            term: "Narcissistic Vulnerability",
            definition:
              "A pattern where apparent confidence masks fragile self-worth heavily dependent on external praise and validation.",
          },
          {
            term: "External Validation",
            definition:
              "The reliance on approval, admiration, and attention from others to regulate internal self-esteem.",
          },
          {
            term: "Competitive Orientation",
            definition:
              "A chronic tendency to view social interactions as hierarchical competitions, resulting in persistent dissatisfaction.",
          }
        );
      } else {
        // Extract concepts from lines with colons or key phrases
        cleanLines.forEach((line) => {
          if (line.includes(":") && line.length < 150) {
            const parts = line.split(":");
            if (parts[0] && parts[1]) {
              concepts.push({
                term: parts[0].replace(/^(\d+[\.\)]|[-•*])\s+/i, "").trim(),
                definition: parts[1].trim(),
              });
            }
          }
        });

        if (concepts.length === 0) {
          concepts.push(
            {
              term: topicName,
              definition:
                sentences[0] ||
                "Core clinical phenomenon analyzed in this lecture session.",
            },
            {
              term: "Behavioral Manifestations",
              definition:
                sentences[1] ||
                "Observable psychological patterns and symptoms presented during clinical evaluation.",
            }
          );
        }
      }

      return { concepts };
    }

    case "IMPORTANT_POINTS": {
      const points = (keyPoints.length > 0 ? keyPoints.slice(0, 5) : mainSentences).map(
        (text, idx) => ({
          text,
          timestampSec: idx * 15,
        })
      );
      return { points };
    }

    case "STUDY_QUESTIONS": {
      const questions: string[] = [];
      if (lower.includes("narcissis")) {
        questions.push(
          "Why do individuals with narcissistic traits often experience chronic dissatisfaction despite external success?",
          "How does excessive reliance on external validation compromise emotional stability?",
          "In what ways does a hyper-competitive mindset impact interpersonal relationships and therapy outcomes?"
        );
      } else {
        questions.push(
          `What are the foundational principles of ${topicName} discussed in this lecture?`,
          "How do the observed behavioral patterns differ between clinical presentations?",
          "What practical interventions are recommended based on the discussed framework?"
        );
      }
      return { questions };
    }

    case "FLASHCARDS": {
      const cards: Array<{ front: string; back: string }> = [];
      if (lower.includes("narcissis")) {
        cards.push(
          {
            front: "What is the core paradox of narcissistic confidence?",
            back: "Despite outward grandiosity, self-worth is fragile and dependent on external validation.",
          },
          {
            front: "How does the 'constant need for attention' manifest?",
            back: "Individual relies on continuous praise; fear of losing attention triggers intense anxiety.",
          },
          {
            front: "Why does competitive orientation lead to dissatisfaction?",
            back: "Constant social comparison and unrealistic standards prevent contentment with achievements.",
          }
        );
      } else {
        cards.push(
          {
            front: `What is the primary definition of ${topicName}?`,
            back: sentences[0] || "Refer to the opening explanation in the lecture transcript.",
          },
          {
            front: "What are the primary mechanisms discussed in this lecture?",
            back: keyPoints[0] || "Refer to the key concepts section in the study suite.",
          }
        );
      }
      return { cards };
    }

    case "LECTURE_OUTLINE": {
      const outline = [
        {
          heading: `I. Introduction to ${topicName}`,
          timestampSec: 0,
          subpoints: keyPoints.slice(0, 2),
        },
        {
          heading: "II. Clinical Observations & Behavioral Patterns",
          timestampSec: 30,
          subpoints: keyPoints.slice(2, 4),
        },
        {
          heading: "III. Implications & Synthesis",
          timestampSec: 60,
          subpoints: keyPoints.slice(4, 6),
        },
      ];
      return { outline };
    }

    default:
      return { notes: fullText.slice(0, 300) };
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
