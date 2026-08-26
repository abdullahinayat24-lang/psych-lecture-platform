import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTeacher, ApiError, handleApiError } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// DELETE /api/images/:id — remove a whiteboard image
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const teacher = await requireTeacher();

    const image = await prisma.lectureImage.findUnique({ where: { id: params.id } });
    if (!image) throw new ApiError(404, "Image not found");

    await prisma.lectureImage.delete({ where: { id: params.id } });

    await logAudit({
      actorId: teacher.id,
      action: "lecture.image_delete",
      entityType: "LectureImage",
      entityId: params.id,
      metadata: { lectureId: image.lectureId },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
