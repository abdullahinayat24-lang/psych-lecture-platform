import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, requireTeacher, handleApiError } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { checkRateLimit, rateLimitKeyFromRequest } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const createLectureSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  category: z.string().max(120).optional(),
  primaryLanguage: z
    .enum(["ENGLISH", "URDU", "PUNJABI", "MIXED_URDU_ENGLISH", "MIXED_PUNJABI_ENGLISH"])
    .default("MIXED_URDU_ENGLISH"),
  plannedDuration: z.number().int().positive().optional(),
  lectureDate: z.string().datetime().optional(),
});

// GET /api/lectures — students see only PUBLISHED lectures; teachers see everything.
export async function GET(req: Request) {
  try {
    let isStudent = true;
    try {
      const user = await requireUser();
      isStudent = user.role === "STUDENT";
    } catch {
      // Unauthenticated visitor
      isStudent = true;
    }

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") ?? undefined;
    const topicId = searchParams.get("topicId") ?? undefined;
    const from = searchParams.get("from") ?? undefined;
    const to = searchParams.get("to") ?? undefined;
    const status = searchParams.get("status") ?? undefined;

    const where: any = {};

    if (isStudent) {
      where.status = "PUBLISHED";
    } else if (status) {
      where.status = status;
    }

    if (category && category !== "ALL") where.category = category;
    if (topicId) where.lectureTopics = { some: { topicId, approved: true } };
    if (from || to) {
      where.lectureDate = {};
      if (from) where.lectureDate.gte = new Date(from);
      if (to) where.lectureDate.lte = new Date(to);
    }

    const lectures = await prisma.lecture.findMany({
      where,
      orderBy: { lectureDate: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        primaryLanguage: true,
        status: true,
        lectureDate: true,
        actualDuration: true,
        plannedDuration: true,
        _count: { select: { transcriptSegments: true, lectureTopics: true } },
      },
      take: 100,
    });

    return NextResponse.json({ lectures });
  } catch (err) {
    return handleApiError(err);
  }
}

// POST /api/lectures — teacher only.
export async function POST(req: Request) {
  try {
    const user = await requireTeacher();

    const limit = checkRateLimit(rateLimitKeyFromRequest(req, user.id));
    if (!limit.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    const body = await req.json();
    const parsed = createLectureSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    // Ensure valid user ID in DB
    let effectiveUserId = user.id;
    const existingUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!existingUser) {
      const fallbackTeacher = await prisma.user.findFirst({ where: { role: "TEACHER" } });
      if (fallbackTeacher) effectiveUserId = fallbackTeacher.id;
    }

    const lecture = await prisma.lecture.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description,
        category: parsed.data.category || "Clinical Psychology",
        primaryLanguage: parsed.data.primaryLanguage,
        plannedDuration: parsed.data.plannedDuration,
        lectureDate: parsed.data.lectureDate ? new Date(parsed.data.lectureDate) : new Date(),
        createdById: effectiveUserId,
        status: "DRAFT",
      },
    });

    try {
      await logAudit({
        actorId: effectiveUserId,
        action: "lecture.create",
        entityType: "Lecture",
        entityId: lecture.id,
      });
    } catch {}

    return NextResponse.json({ lecture }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
