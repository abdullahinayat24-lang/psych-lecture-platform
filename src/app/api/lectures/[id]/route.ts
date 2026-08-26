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
    const lecture = await prisma.lecture.findUnique({
      where: { id: params.id },
      include: {
        speakers: true,
        recordings: { orderBy: { createdAt: "desc" }, take: 1 },
        lectureTopics: { include: { topic: true } },
      },
    });

    if (!lecture) throw new ApiError(404, "Lecture not found");

    // Optional student check: only block if explicitly confirmed as a student and lecture is not published
    try {
      const user = await requireUser();
      if (user.role === "STUDENT" && lecture.status !== "PUBLISHED") {
        throw new ApiError(403, "This lecture is currently in draft review and has not been published to students yet.");
      }
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 403) throw e;
    }

    return NextResponse.json({ lecture });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireTeacher();

    const body = await req.json();
    const parsed = updateLectureSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const current = await prisma.lecture.findUnique({ where: { id: params.id } });
    if (!current) throw new ApiError(404, "Lecture not found");

    const updated = await prisma.lecture.update({
      where: { id: params.id },
      data: parsed.data,
      include: {
        speakers: true,
        recordings: { orderBy: { createdAt: "desc" }, take: 1 },
        lectureTopics: { include: { topic: true } },
      },
    });

    try {
      await logAudit({
        actorId: user.id,
        action: "lecture.update",
        entityType: "Lecture",
        entityId: updated.id,
        metadata: parsed.data,
      });
    } catch {}

    return NextResponse.json({ lecture: updated });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireTeacher();

    const lecture = await prisma.lecture.findUnique({ where: { id: params.id } });
    if (!lecture) throw new ApiError(404, "Lecture not found");

    await prisma.$transaction([
      prisma.lectureImage.deleteMany({ where: { lectureId: params.id } }),
      prisma.lectureTopic.deleteMany({ where: { lectureId: params.id } }),
      prisma.aiAnalysis.deleteMany({ where: { lectureId: params.id } }),
      prisma.manualMarker.deleteMany({ where: { lectureId: params.id } }),
      prisma.studentQuestion.deleteMany({ where: { lectureId: params.id } }),
      prisma.studentConfusion.deleteMany({ where: { lectureId: params.id } }),
      prisma.studentNote.deleteMany({ where: { lectureId: params.id } }),
      prisma.transcriptSegment.deleteMany({ where: { lectureId: params.id } }),
      prisma.recordingSegment.deleteMany({
        where: { recording: { lectureId: params.id } },
      }),
      prisma.lectureRecording.deleteMany({ where: { lectureId: params.id } }),
      prisma.speaker.deleteMany({ where: { lectureId: params.id } }),
      prisma.lecture.delete({ where: { id: params.id } }),
    ]);

    try {
      await logAudit({
        actorId: user.id,
        action: "lecture.delete",
        entityType: "Lecture",
        entityId: params.id,
        metadata: { title: lecture.title },
      });
    } catch {}

    return NextResponse.json({ success: true, message: "Lecture deleted cleanly" });
  } catch (err) {
    return handleApiError(err);
  }
}
