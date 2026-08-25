import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, requireTeacher, ApiError, handleApiError } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { runLectureAnalysis, transcriptToPromptText } from "@/lib/ai-analysis";
import type { AiAnalysisType } from "@prisma/client";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  lectureId: z.string(),
  types: z
    .array(
      z.enum([
        "SUMMARY_DETAILED",
        "SUMMARY_SHORT",
        "REVISION_NOTES",
        "KEY_CONCEPTS",
        "IMPORTANT_POINTS",
        "QUESTIONS_EXTRACTED",
        "ANSWERS_EXTRACTED",
        "EXAMPLES_EXTRACTED",
        "DEFINITIONS_EXTRACTED",
        "TOPIC_EXTRACTION",
        "UNCLEAR_SECTIONS",
        "CONTRADICTIONS",
        "STUDY_QUESTIONS",
        "FLASHCARDS",
        "LECTURE_OUTLINE",
      ])
    )
    .min(1),
});

const SCHEMA_HINTS: Record<string, string> = {
  SUMMARY_DETAILED: '{ "summary": string }',
  SUMMARY_SHORT: '{ "summary": string }',
  REVISION_NOTES: '{ "points": string[] }',
  KEY_CONCEPTS: '{ "concepts": [{ "term": string, "definition": string }] }',
  IMPORTANT_POINTS: '{ "points": [{ "text": string, "timestampSec": number }] }',
  QUESTIONS_EXTRACTED: '{ "questions": [{ "text": string, "timestampSec": number }] }',
  ANSWERS_EXTRACTED: '{ "answers": [{ "text": string, "timestampSec": number }] }',
  EXAMPLES_EXTRACTED: '{ "examples": [{ "text": string, "timestampSec": number }] }',
  DEFINITIONS_EXTRACTED: '{ "definitions": [{ "term": string, "definition": string, "timestampSec": number }] }',
  TOPIC_EXTRACTION: '{ "topics": [{ "name": string, "occurrences": [{ "timestampSec": number, "label": string }] }] }',
  UNCLEAR_SECTIONS: '{ "sections": [{ "timestampSec": number, "reason": string }] }',
  CONTRADICTIONS: '{ "notes": [{ "description": string, "timestampSec": number }] }',
  STUDY_QUESTIONS: '{ "questions": string[] }',
  FLASHCARDS: '{ "cards": [{ "front": string, "back": string }] }',
  LECTURE_OUTLINE: '{ "outline": [{ "heading": string, "timestampSec": number, "subpoints": string[] }] }',
};

// POST /api/ai — teacher explicitly triggers AI analysis for a lecture.
// Never runs automatically on publish; stays a deliberate step in the
// review workflow (section 21).
export async function POST(req: Request) {
  try {
    const teacher = await requireTeacher();
    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const segments = await prisma.transcriptSegment.findMany({
      where: { lectureId: parsed.data.lectureId },
      orderBy: { startTimeSec: "asc" },
    });
    if (segments.length === 0) {
      throw new ApiError(400, "Lecture has no transcript yet — run transcription first");
    }

    const transcriptText = transcriptToPromptText(segments);

    await prisma.lecture.update({ where: { id: parsed.data.lectureId }, data: { status: "PROCESSING" } });

    const results = [];
    for (const type of parsed.data.types as AiAnalysisType[]) {
      const analysis = await runLectureAnalysis({
        lectureId: parsed.data.lectureId,
        type,
        transcriptText,
        jsonSchemaHint: SCHEMA_HINTS[type] ?? "{}",
      });
      results.push(analysis);
    }

    await prisma.lecture.update({ where: { id: parsed.data.lectureId }, data: { status: "AI_ANALYZED" } });

    await logAudit({
      actorId: teacher.id,
      action: "ai.analyze",
      entityType: "Lecture",
      entityId: parsed.data.lectureId,
      metadata: { types: parsed.data.types },
    });

    return NextResponse.json({ analyses: results });
  } catch (err) {
    return handleApiError(err);
  }
}

// GET /api/ai?lectureId=...
// Students: Only retrieve approvedByTeacher: true on published lectures.
// Teachers: Retrieve all analyses (approved & unapproved) for review.
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const lectureId = searchParams.get("lectureId");
    if (!lectureId) {
      return NextResponse.json({ error: "lectureId is required" }, { status: 400 });
    }

    const lecture = await prisma.lecture.findUnique({ where: { id: lectureId } });
    if (!lecture) throw new ApiError(404, "Lecture not found");
    if (user.role === "STUDENT" && lecture.status !== "PUBLISHED") {
      throw new ApiError(404, "Lecture not found");
    }

    const where: any = { lectureId };
    if (user.role === "STUDENT") {
      where.approvedByTeacher = true;
    }

    const analyses = await prisma.aiAnalysis.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ analyses });
  } catch (err) {
    return handleApiError(err);
  }
}
