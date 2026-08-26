import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTeacher, ApiError, handleApiError } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// DELETE /api/lexicon/:id
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const teacher = await requireTeacher();

    const term = await prisma.glossaryTerm.findUnique({ where: { id: params.id } });
    if (!term) throw new ApiError(404, "Glossary term not found");

    await prisma.glossaryTerm.delete({ where: { id: params.id } });

    await logAudit({
      actorId: teacher.id,
      action: "lexicon.delete",
      entityType: "GlossaryTerm",
      entityId: params.id,
      metadata: { term: term.term },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
