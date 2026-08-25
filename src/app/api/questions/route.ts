import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, requireTeacher, handleApiError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const createQuestionSchema = z.object({
  lectureId: z.string(),
  topicId: z.string().optional(),
  transcriptSegmentId: z.string().optional(),
  timestampSec: z.number().nonnegative().optional(),
  text: z.string().min(1).max(5000),
});

/**
 * GET /api/questions
 * - Students: only their own questions (private by default, section 15).
 * - Teachers: only questions explicitly marked submittedToTeacher=true.
 *   A teacher can never list a student's un-submitted questions.
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const lectureId = searchParams.get("lectureId") ?? undefined;

    const where =
      user.role === "TEACHER"
        ? { submittedToTeacher: true, ...(lectureId ? { lectureId } : {}) }
        : { studentId: user.id, ...(lectureId ? { lectureId } : {}) };

    const questions = await prisma.studentQuestion.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { answers: true, ...(user.role === "TEACHER" ? { student: { select: { displayName: true } } } : {}) },
    });

    return NextResponse.json({ questions });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const parsed = createQuestionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const question = await prisma.studentQuestion.create({
      data: { ...parsed.data, studentId: user.id, submittedToTeacher: false },
    });

    return NextResponse.json({ question }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
