import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, requireTeacher, assertOwnsResource, ApiError, handleApiError } from "@/lib/rbac";

const actionSchema = z.object({
  action: z.enum(["submit_to_teacher", "answer"]),
  answerText: z.string().min(1).max(10000).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const question = await prisma.studentQuestion.findUnique({ where: { id: params.id } });
    if (!question) throw new ApiError(404, "Question not found");

    if (parsed.data.action === "submit_to_teacher") {
      const user = await requireUser();
      assertOwnsResource(question.studentId, user); // only the owning student can submit their own question

      const updated = await prisma.studentQuestion.update({
        where: { id: params.id },
        data: { submittedToTeacher: true, submittedAt: new Date() },
      });
      return NextResponse.json({ question: updated });
    }

    // action === "answer" — teacher only, and only on questions that were submitted.
    const teacher = await requireTeacher();
    if (!question.submittedToTeacher) {
      throw new ApiError(403, "This question has not been submitted by the student");
    }
    if (!parsed.data.answerText) {
      return NextResponse.json({ error: "answerText is required" }, { status: 400 });
    }

    const answer = await prisma.teacherAnswer.create({
      data: { studentQuestionId: params.id, teacherId: teacher.id, text: parsed.data.answerText },
    });

    return NextResponse.json({ answer }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const question = await prisma.studentQuestion.findUnique({
      where: { id: params.id },
      include: { answers: true },
    });
    if (!question) throw new ApiError(404, "Question not found");

    if (user.role === "STUDENT") {
      assertOwnsResource(question.studentId, user);
    } else if (user.role === "TEACHER" && !question.submittedToTeacher) {
      throw new ApiError(403, "Access denied: question has not been submitted");
    }

    return NextResponse.json({ question });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const question = await prisma.studentQuestion.findUnique({ where: { id: params.id } });
    if (!question) throw new ApiError(404, "Question not found");

    assertOwnsResource(question.studentId, user);
    await prisma.studentQuestion.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
