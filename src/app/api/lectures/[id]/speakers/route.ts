import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireTeacher, ApiError, handleApiError } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  speakerId: z.string(),
  displayName: z.string().min(1).max(100),
  role: z.enum(["TEACHER", "STUDENT", "UNKNOWN"]),
});

// PATCH /api/lectures/:id/speakers — rename "Speaker 1" -> "Teacher", etc.
// Also updates every TranscriptSegment's cached speakerRole so the
// transcript view doesn't need a join to render correctly.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireTeacher();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const speaker = await prisma.speaker.findFirst({
      where: { id: parsed.data.speakerId, lectureId: params.id },
    });
    if (!speaker) throw new ApiError(404, "Speaker not found");

    const [updatedSpeaker] = await prisma.$transaction([
      prisma.speaker.update({
        where: { id: speaker.id },
        data: { displayName: parsed.data.displayName, role: parsed.data.role },
      }),
      prisma.transcriptSegment.updateMany({
        where: { speakerId: speaker.id },
        data: { speakerRole: parsed.data.role },
      }),
    ]);

    await logAudit({
      actorId: user.id,
      action: "speaker.rename",
      entityType: "Speaker",
      entityId: speaker.id,
      metadata: parsed.data,
    });

    return NextResponse.json({ speaker: updatedSpeaker });
  } catch (err) {
    return handleApiError(err);
  }
}
