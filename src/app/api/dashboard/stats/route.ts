import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, handleApiError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/stats
 * Consolidates dashboard data into a single request to minimize serverless
 * connection churn against Supabase connection poolers.
 */
export async function GET() {
  try {
    const user = await requireUser();
    const isTeacher = user.role === "TEACHER";

    if (isTeacher) {
      const [lectures, topics, questions, confusions] = await Promise.all([
        prisma.lecture.findMany({
          orderBy: { lectureDate: "desc" },
          take: 50,
          select: {
            id: true,
            title: true,
            category: true,
            status: true,
            primaryLanguage: true,
            lectureDate: true,
            actualDuration: true,
            seriesName: true,
            partNumber: true,
          },
        }),
        prisma.topic.findMany({
          orderBy: { name: "asc" },
          take: 30,
          select: { id: true, name: true, slug: true, overview: true },
        }),
        prisma.studentQuestion.findMany({
          where: { submittedToTeacher: true },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            student: { select: { id: true, displayName: true, username: true, email: true } },
            lecture: { select: { id: true, title: true } },
            answers: true,
          },
        }),
        prisma.studentConfusion.findMany({
          where: { submittedToTeacher: true },
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            student: { select: { id: true, displayName: true, username: true } },
            lecture: { select: { id: true, title: true } },
          },
        }),
      ]);

      return NextResponse.json({
        lectures,
        topics,
        questions,
        confusions,
        notes: [],
      });
    }

    // Student Dashboard
    const [lectures, topics, notes, questions] = await Promise.all([
      prisma.lecture.findMany({
        where: { status: "PUBLISHED" },
        orderBy: { lectureDate: "desc" },
        take: 30,
        select: {
          id: true,
          title: true,
          category: true,
          status: true,
          primaryLanguage: true,
          lectureDate: true,
          actualDuration: true,
          seriesName: true,
          partNumber: true,
        },
      }),
      prisma.topic.findMany({
        orderBy: { name: "asc" },
        take: 30,
        select: { id: true, name: true, slug: true, overview: true },
      }),
      prisma.studentNote.findMany({
        where: { studentId: user.id },
        orderBy: { updatedAt: "desc" },
        take: 20,
        include: { lecture: { select: { id: true, title: true } } },
      }),
      prisma.studentQuestion.findMany({
        where: { studentId: user.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          lecture: { select: { id: true, title: true } },
          answers: true,
        },
      }),
    ]);

    return NextResponse.json({
      lectures,
      topics,
      notes,
      questions,
      confusions: [],
    });
  } catch (err) {
    return handleApiError(err);
  }
}
