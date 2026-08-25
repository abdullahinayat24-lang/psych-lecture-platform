import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, assertOwnsResource, ApiError, handleApiError } from "@/lib/rbac";

const updateSchema = z.object({ text: z.string().min(1).max(20000) });

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const note = await prisma.studentNote.findUnique({ where: { id: params.id } });
    if (!note) throw new ApiError(404, "Note not found");

    assertOwnsResource(note.studentId, user);
    return NextResponse.json({ note });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const note = await prisma.studentNote.findUnique({ where: { id: params.id } });
    if (!note) throw new ApiError(404, "Note not found");

    assertOwnsResource(note.studentId, user); // 403, not 404 leak — but content is still hidden either way

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const updated = await prisma.studentNote.update({ where: { id: params.id }, data: { text: parsed.data.text } });
    return NextResponse.json({ note: updated });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const note = await prisma.studentNote.findUnique({ where: { id: params.id } });
    if (!note) throw new ApiError(404, "Note not found");

    assertOwnsResource(note.studentId, user);

    await prisma.studentNote.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
