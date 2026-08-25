import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, requireTeacher, ApiError, handleApiError } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

// GET /api/lectures/:id/transcript — structured, timestamped segments (section 7).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();

    const lecture = await prisma.lecture.findUnique({ where: { id: params.id } });
    if (!lecture) throw new ApiError(404, "Lecture not found");
    if (user.role === "STUDENT" && lecture.status !== "PUBLISHED") {
      throw new ApiError(404, "Lecture not found");
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

// PATCH /api/lectures/:id/transcript — teacher corrections only (section 21).
// Students can never modify transcripts, enforced here regardless of frontend state.
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
