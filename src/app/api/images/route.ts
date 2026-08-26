import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, requireTeacher, ApiError, handleApiError } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// GET /api/images?lectureId=...
export async function GET(req: Request) {
  try {
    await requireUser();
    const { searchParams } = new URL(req.url);
    const lectureId = searchParams.get("lectureId");

    if (!lectureId) {
      return NextResponse.json({ error: "lectureId is required" }, { status: 400 });
    }

    const images = await prisma.lectureImage.findMany({
      where: { lectureId },
      orderBy: [
        { timestampSec: "asc" },
        { sequenceOrder: "asc" },
        { createdAt: "asc" },
      ],
    });

    return NextResponse.json({ images });
  } catch (err) {
    return handleApiError(err);
  }
}

const imageUploadSchema = z.object({
  lectureId: z.string().min(1),
  imageUrl: z.string().min(10), // Base64 data URL or external URL
  caption: z.string().optional(),
  timestampSec: z.number().nonnegative().optional(),
});

// POST /api/images — upload whiteboard image/diagram
export async function POST(req: Request) {
  try {
    const teacher = await requireTeacher();
    const body = await req.json();
    const parsed = imageUploadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const image = await prisma.lectureImage.create({
      data: {
        lectureId: parsed.data.lectureId,
        imageUrl: parsed.data.imageUrl,
        caption: parsed.data.caption || "Whiteboard diagram",
        timestampSec: parsed.data.timestampSec,
      },
    });

    await logAudit({
      actorId: teacher.id,
      action: "lecture.image_upload",
      entityType: "LectureImage",
      entityId: image.id,
      metadata: { lectureId: parsed.data.lectureId, caption: parsed.data.caption },
    });

    return NextResponse.json({ image });
  } catch (err) {
    return handleApiError(err);
  }
}
