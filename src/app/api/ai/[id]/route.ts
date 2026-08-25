import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireTeacher, ApiError, handleApiError } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  approved: z.boolean(),
  editedContent: z.any().optional(), // teacher can correct AI output before approving (section 21)
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const teacher = await requireTeacher();
    const analysis = await prisma.aiAnalysis.findUnique({ where: { id: params.id } });
    if (!analysis) throw new ApiError(404, "Analysis not found");

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const updated = await prisma.aiAnalysis.update({
      where: { id: params.id },
      data: {
        approvedByTeacher: parsed.data.approved,
        reviewedById: teacher.id,
        ...(parsed.data.editedContent ? { content: parsed.data.editedContent } : {}),
      },
    });

    await logAudit({
      actorId: teacher.id,
      action: parsed.data.approved ? "ai.approve" : "ai.reject",
      entityType: "AiAnalysis",
      entityId: updated.id,
    });

    return NextResponse.json({ analysis: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
