import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, requireTeacher, handleApiError } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// GET /api/topics — list all topics with lecture counts (public knowledge index for logged-in users).
export async function GET() {
  try {
    await requireUser();
    const topics = await prisma.topic.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        overview: true,
        _count: { select: { occurrences: { where: { approved: true } } } },
      },
    });
    return NextResponse.json({ topics });
  } catch (err) {
    return handleApiError(err);
  }
}

const createTopicSchema = z.object({
  name: z.string().min(1).max(200),
  overview: z.string().max(10000).optional(),
});

// POST /api/topics — teacher only; students never create shared topic pages directly.
export async function POST(req: Request) {
  try {
    const user = await requireTeacher();
    const body = await req.json();
    const parsed = createTopicSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const topic = await prisma.topic.create({
      data: { name: parsed.data.name, slug: slugify(parsed.data.name), overview: parsed.data.overview },
    });

    await logAudit({ actorId: user.id, action: "topic.create", entityType: "Topic", entityId: topic.id });

    return NextResponse.json({ topic }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
