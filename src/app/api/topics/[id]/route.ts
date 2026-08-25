import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, ApiError, handleApiError } from "@/lib/rbac";

// GET /api/topics/:id — the shared knowledge page (section 12).
// Contains ONLY teacher-owned + approved content. Student's private
// notes/questions/highlights for this topic are fetched separately
// from /api/notes, /api/questions (scoped to the requesting student).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();

    const topic = await prisma.topic.findUnique({
      where: { id: params.id },
      include: {
        occurrences: {
          where: { approved: true },
          orderBy: { timestampSec: "asc" },
          include: { lecture: { select: { id: true, title: true, lectureDate: true, status: true } } },
        },
        relatedFrom: { include: { toTopic: { select: { id: true, name: true, slug: true } } } },
      },
    });

    if (!topic) throw new ApiError(404, "Topic not found");

    // Filter out occurrences from lectures a student shouldn't see (unpublished).
    const occurrences =
      user.role === "STUDENT"
        ? topic.occurrences.filter((o) => o.lecture.status === "PUBLISHED")
        : topic.occurrences;

    // Build the "topic evolution" timeline (section 13) from real lecture
    // dates — never invented, only derived from actual occurrences.
    const timeline = Array.from(
      new Map(occurrences.map((o) => [o.lecture.id, o.lecture])).values()
    ).sort((a, b) => a.lectureDate.getTime() - b.lectureDate.getTime());

    return NextResponse.json({
      topic: { id: topic.id, name: topic.name, slug: topic.slug, overview: topic.overview },
      occurrences,
      timeline,
      relatedTopics: topic.relatedFrom.map((r) => r.toTopic),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
