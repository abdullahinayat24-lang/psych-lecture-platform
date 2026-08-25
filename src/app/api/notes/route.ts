import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, handleApiError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const createNoteSchema = z.object({
  lectureId: z.string().optional(),
  topicId: z.string().optional(),
  transcriptSegmentId: z.string().optional(),
  timestampSec: z.number().nonnegative().optional(),
  text: z.string().min(1).max(20000),
});

/**
 * GET /api/notes — returns ONLY the requesting user's own notes.
 * There is no code path here that accepts a studentId param and
 * queries by it: the where-clause is always `studentId: user.id`,
 * which is the enforcement point against IDOR and against a
 * teacher accidentally (or a compromised client) reading another
 * student's private notes (section 14/22 — never expose private
 * notes through public APIs, including to the teacher).
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const lectureId = searchParams.get("lectureId") ?? undefined;
    const topicId = searchParams.get("topicId") ?? undefined;

    const notes = await prisma.studentNote.findMany({
      where: { studentId: user.id, ...(lectureId ? { lectureId } : {}), ...(topicId ? { topicId } : {}) },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ notes });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const parsed = createNoteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const note = await prisma.studentNote.create({
      data: { ...parsed.data, studentId: user.id }, // ownerId is always derived from the session, never the request body
    });

    return NextResponse.json({ note }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
