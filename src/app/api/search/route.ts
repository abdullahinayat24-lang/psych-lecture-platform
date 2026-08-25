import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, handleApiError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/**
 * GET /api/search?q=narcissism
 *
 * Uses Postgres ILIKE for now (works everywhere with zero setup).
 * For production scale, replace the raw queries below with:
 *   - Postgres full-text search (tsvector/tsquery + GIN index), and/or
 *   - pgvector similarity search over EmbeddingProvider output for
 *     semantic search ("emotional numbness" matching a passage about
 *     "detachment" even without the exact word).
 * The route's response shape stays the same either way.
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();

    if (q.length < 2) {
      return NextResponse.json({ topics: [], lectures: [], transcriptMatches: [], myNotes: [], myQuestions: [] });
    }

    const lectureVisibility = user.role === "STUDENT" ? { status: "PUBLISHED" as const } : {};

    const [topics, lectures, transcriptMatches, myNotes, myQuestions, summaries, answers, bookmarks] = await Promise.all([
      prisma.topic.findMany({
        where: { name: { contains: q, mode: "insensitive" } },
        take: 10,
        select: { id: true, name: true, slug: true, overview: true },
      }),
      prisma.lecture.findMany({
        where: { ...lectureVisibility, title: { contains: q, mode: "insensitive" } },
        take: 10,
        select: { id: true, title: true, lectureDate: true, category: true, status: true },
      }),
      prisma.transcriptSegment.findMany({
        where: {
          text: { contains: q, mode: "insensitive" },
          lecture: lectureVisibility,
        },
        take: 25,
        select: {
          id: true,
          lectureId: true,
          startTimeSec: true,
          endTimeSec: true,
          text: true,
          speakerRole: true,
          lecture: { select: { id: true, title: true } },
        },
      }),
      prisma.studentNote.findMany({
        where: { studentId: user.id, text: { contains: q, mode: "insensitive" } },
        take: 15,
        include: { lecture: { select: { id: true, title: true } }, topic: { select: { id: true, name: true } } },
      }),
      prisma.studentQuestion.findMany({
        where: { studentId: user.id, text: { contains: q, mode: "insensitive" } },
        take: 15,
        include: { answers: true, lecture: { select: { id: true, title: true } } },
      }),
      prisma.lectureSummary.findMany({
        where: {
          content: { contains: q, mode: "insensitive" },
          lecture: lectureVisibility,
          ...(user.role === "STUDENT" ? { isApproved: true } : {}),
        },
        take: 10,
        include: { lecture: { select: { id: true, title: true } } },
      }),
      prisma.teacherAnswer.findMany({
        where: {
          text: { contains: q, mode: "insensitive" },
          studentQuestion: {
            lecture: lectureVisibility,
            ...(user.role === "STUDENT" ? { studentId: user.id } : {}),
          },
        },
        take: 10,
        include: { studentQuestion: { select: { id: true, text: true, lectureId: true } } },
      }),
      prisma.bookmark.findMany({
        where: {
          studentId: user.id,
          label: { contains: q, mode: "insensitive" },
        },
        take: 10,
        include: { lecture: { select: { id: true, title: true } }, topic: { select: { id: true, name: true } } },
      }),
    ]);

    return NextResponse.json({
      topics,
      lectures,
      transcriptMatches,
      myNotes,
      myQuestions,
      summaries,
      answers,
      bookmarks,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
