import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, requireTeacher, ApiError, handleApiError } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const updateLectureSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).optional(),
  category: z.string().max(120).optional(),
  seriesName: z.string().max(300).nullable().optional(),
  partNumber: z.number().int().nullable().optional(),
  status: z
    .enum(["DRAFT", "RECORDING", "PROCESSING", "AI_ANALYZED", "IN_REVIEW", "PUBLISHED", "UNPUBLISHED"])
    .optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();

    const lecture = await prisma.lecture.findUnique({
      where: { id: params.id },
      include: {
        speakers: true,
        recordings: { where: { isFinalized: true }, orderBy: { createdAt: "desc" }, take: 1 },
        lectureTopics: { where: { approved: true }, include: { topic: true } },
      },
    });

    if (!lecture) throw new ApiError(404, "Lecture not found");

    if (user.role === "STUDENT" && lecture.status !== "PUBLISHED") {
      throw new ApiError(404, "Lecture not found");
    }

    return NextResponse.json({ lecture });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireTeacher();

    const existing = await prisma.lecture.findUnique({ where: { id: params.id } });
    if (!existing) throw new ApiError(404, "Lecture not found");

    const body = await req.json();
    const parsed = updateLectureSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const data: any = { ...parsed.data };
    if (parsed.data.status === "PUBLISHED" && existing.status !== "PUBLISHED") {
      data.publishedAt = new Date();
    }

    const lecture = await prisma.lecture.update({ where: { id: params.id }, data });

    await logAudit({
      actorId: user.id,
      action: parsed.data.status ? `lecture.status.${parsed.data.status.toLowerCase()}` : "lecture.update",
      entityType: "Lecture",
      entityId: lecture.id,
      metadata: parsed.data,
    });

    return NextResponse.json({ lecture });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireTeacher();

    const existing = await prisma.lecture.findUnique({ where: { id: params.id } });
    if (!existing) throw new ApiError(404, "Lecture not found");

    // Clean up all related child entities explicitly to prevent any FK constraint violations
    await prisma.$transaction([
      prisma.lectureImage.deleteMany({ where: { lectureId: params.id } }),
      prisma.topicOccurrence.deleteMany({ where: { lectureId: params.id } }),
      prisma.lectureTopic.deleteMany({ where: { lectureId: params.id } }),
      prisma.aiAnalysis.deleteMany({ where: { lectureId: params.id } }),
      prisma.lectureSummary.deleteMany({ where: { lectureId: params.id } }),
      prisma.manualMarker.deleteMany({ where: { lectureId: params.id } }),
      prisma.studentConfusion.deleteMany({ where: { lectureId: params.id } }),
      prisma.studentQuestion.deleteMany({ where: { lectureId: params.id } }),
      prisma.studentNote.deleteMany({ where: { lectureId: params.id } }),
      prisma.bookmark.deleteMany({ where: { lectureId: params.id } }),
      prisma.highlight.deleteMany({ where: { lectureId: params.id } }),
      prisma.transcriptSegment.deleteMany({ where: { lectureId: params.id } }),
      prisma.speaker.deleteMany({ where: { lectureId: params.id } }),
      prisma.recordingSegment.deleteMany({ where: { recording: { lectureId: params.id } } }),
      prisma.lectureRecording.deleteMany({ where: { lectureId: params.id } }),
      prisma.lecture.delete({ where: { id: params.id } }),
    ]);

    await logAudit({
      actorId: user.id,
      action: "lecture.delete",
      entityType: "Lecture",
      entityId: params.id,
      metadata: { title: existing.title },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete lecture error:", err);
    return handleApiError(err);
  }
}
