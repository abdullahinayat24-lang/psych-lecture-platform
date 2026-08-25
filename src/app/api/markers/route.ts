import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, requireTeacher, handleApiError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  lectureId: z.string(),
  timestampSec: z.number().nonnegative(),
  markerType: z.enum(["IMPORTANT", "QUESTION", "EXAMPLE", "CONFUSING", "RESEARCH_LATER", "NOTE"]),
  text: z.string().max(2000).optional(),
});

// Only the teacher (recording owner) adds live markers during a lecture —
// this is a recording-time control, not a general student action.
export async function POST(req: Request) {
  try {
    const user = await requireTeacher();
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const marker = await prisma.manualMarker.create({ data: { ...parsed.data, userId: user.id } });
    return NextResponse.json({ marker }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET(req: Request) {
  try {
    await requireUser();
    const { searchParams } = new URL(req.url);
    const lectureId = searchParams.get("lectureId");
    if (!lectureId) return NextResponse.json({ error: "lectureId required" }, { status: 400 });

    const markers = await prisma.manualMarker.findMany({
      where: { lectureId },
      orderBy: { timestampSec: "asc" },
    });
    return NextResponse.json({ markers });
  } catch (err) {
    return handleApiError(err);
  }
}
