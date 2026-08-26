import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTeacher, ApiError, handleApiError } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// POST /api/recordings/:lectureId/start
export async function POST(_req: Request, { params }: { params: { lectureId: string } }) {
  try {
    const user = await requireTeacher();

    const lecture = await prisma.lecture.findUnique({ where: { id: params.lectureId } });
    if (!lecture) throw new ApiError(404, "Lecture not found");

    const existingActive = await prisma.lectureRecording.findFirst({
      where: { lectureId: params.lectureId, isFinalized: false },
    });
    if (existingActive) {
      return NextResponse.json({ recording: existingActive });
    }

    const recording = await prisma.lectureRecording.create({
      data: { lectureId: params.lectureId, storageKey: "", mimeType: "audio/webm" },
    });

    await prisma.lecture.update({ where: { id: params.lectureId }, data: { status: "RECORDING" } });

    try {
      await logAudit({
        actorId: user.id,
        action: "recording.start",
        entityType: "LectureRecording",
        entityId: recording.id,
      });
    } catch {
      // Non-blocking audit log
    }

    return NextResponse.json({ recording }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
