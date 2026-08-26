import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, requireTeacher, ApiError, handleApiError } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// GET /api/lectures/:id/transcript — structured, timestamped segments.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const lecture = await prisma.lecture.findUnique({ where: { id: params.id } });
    if (!lecture) throw new ApiError(404, "Lecture not found");

    try {
      const user = await requireUser();
      if (user.role === "STUDENT" && lecture.status !== "PUBLISHED") {
        throw new ApiError(403, "Lecture is not published yet");
      }
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 403) throw e;
    }

    const segments = await prisma.transcriptSegment.findMany({
      where: { lectureId: params.id },
      orderBy: { startTimeSec: "asc" },
      include: { speaker: true },
    });

    return NextResponse.json({ segments });
  } catch (err) {
    return handleApiError(err);
  }
}

// POST /api/lectures/:id/transcript — add segment or replace entire transcript text
const createSchema = z.object({
  text: z.string().min(1),
  replaceFull: z.boolean().optional(),
  startTimeSec: z.number().nonnegative().optional(),
  endTimeSec: z.number().nonnegative().optional(),
  segmentType: z.enum([
    "TEACHER_EXPLANATION",
    "STUDENT_QUESTION",
    "TEACHER_ANSWER",
    "DISCUSSION",
    "EXAMPLE",
    "IMPORTANT",
    "OTHER",
  ]).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireTeacher();
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const defaultSpeaker = await prisma.speaker.upsert({
      where: { lectureId_rawLabel: { lectureId: params.id, rawLabel: "SPEAKER_00" } },
      create: {
        lectureId: params.id,
        rawLabel: "SPEAKER_00",
        displayName: "Teacher",
        role: "TEACHER",
      },
      update: {},
    });

    if (parsed.data.replaceFull) {
      await prisma.transcriptSegment.deleteMany({ where: { lectureId: params.id } });
    }

    const segment = await prisma.transcriptSegment.create({
      data: {
        lectureId: params.id,
        speakerId: defaultSpeaker.id,
        speakerRole: "TEACHER",
        startTimeSec: parsed.data.startTimeSec ?? 0,
        endTimeSec: parsed.data.endTimeSec ?? 10,
        text: parsed.data.text.trim(),
        language: "MIXED_URDU_ENGLISH",
        confidence: 1.0,
        segmentType: parsed.data.segmentType ?? "TEACHER_EXPLANATION",
      },
      include: { speaker: true },
    });

    await logAudit({
      actorId: user.id,
      action: "transcript.create",
      entityType: "TranscriptSegment",
      entityId: segment.id,
      metadata: { replaceFull: parsed.data.replaceFull },
    });

    return NextResponse.json({ segment });
  } catch (err) {
    return handleApiError(err);
  }
}

// PATCH /api/lectures/:id/transcript — teacher corrections
const correctionSchema = z.object({
  segmentId: z.string(),
  text: z.string().min(1).optional(),
  speakerId: z.string().optional(),
  speakerRole: z.enum(["TEACHER", "STUDENT", "UNKNOWN"]).optional(),
  segmentType: z
    .enum([
      "TEACHER_EXPLANATION",
      "STUDENT_QUESTION",
      "TEACHER_ANSWER",
      "DISCUSSION",
      "EXAMPLE",
      "IMPORTANT",
      "OTHER",
    ])
    .optional(),
  startTimeSec: z.number().nonnegative().optional(),
  endTimeSec: z.number().nonnegative().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireTeacher();

    const body = await req.json();
    const parsed = correctionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const segment = await prisma.transcriptSegment.findFirst({
      where: { id: parsed.data.segmentId, lectureId: params.id },
    });
    if (!segment) throw new ApiError(404, "Transcript segment not found");

    const { segmentId, ...updates } = parsed.data;
    const updated = await prisma.transcriptSegment.update({
      where: { id: segmentId },
      data: { ...updates, isEdited: true, editedById: user.id },
      include: { speaker: true },
    });

    await logAudit({
      actorId: user.id,
      action: "transcript.correct",
      entityType: "TranscriptSegment",
      entityId: updated.id,
      metadata: updates,
    });

    return NextResponse.json({ segment: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
