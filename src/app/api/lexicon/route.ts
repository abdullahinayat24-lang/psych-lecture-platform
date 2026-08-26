import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, requireTeacher, handleApiError } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// GET /api/lexicon — list all teacher code-words & glossary terms
export async function GET(req: Request) {
  try {
    await requireUser();
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");

    const where = category ? { category } : {};
    let terms = await prisma.glossaryTerm.findMany({
      where,
      orderBy: [{ category: "asc" }, { term: "asc" }],
    });

    // Auto-seed default code words if database is brand new
    if (terms.length === 0) {
      const defaults = [
        {
          term: "Shaheed",
          definition:
            "Teacher code word for an individual with covert narcissistic traits who weaponizes victimization, guilt-tripping, and a martyr complex to manipulate interpersonal dynamics.",
          category: "Instructor Code Words",
        },
        {
          term: "Sur & Laya",
          definition:
            "Foundational pitch accuracy (Sur) and rhythmic tempo/meter (Laya) in North Indian & Punjabi classical and semi-classical music systems.",
          category: "Music Theory",
        },
        {
          term: "Hierarchy of Grievance",
          definition:
            "A behavioral pattern in domestic conflicts where family members compete over who has suffered more, preventing resolution.",
          category: "Home & Domestic Dynamics",
        },
        {
          term: "Administrative Discretion",
          definition:
            "Core CSS Governance concept: the latitude given to public administrators in applying statutory rules and public policies.",
          category: "CSS & Governance",
        },
        {
          term: "Nafs-e-Ammarah",
          definition:
            "In Islamic psychology/Tasawwuf: the primal, undisciplined self that commands base desires and impulsivity, contrasted with modern ego psychology.",
          category: "Religion & Tasawwuf",
        },
      ];

      for (const d of defaults) {
        await prisma.glossaryTerm.upsert({
          where: { term: d.term },
          update: {},
          create: d,
        });
      }

      terms = await prisma.glossaryTerm.findMany({
        where,
        orderBy: [{ category: "asc" }, { term: "asc" }],
      });
    }

    return NextResponse.json({ terms });
  } catch (err) {
    return handleApiError(err);
  }
}

const lexiconSchema = z.object({
  term: z.string().min(1),
  definition: z.string().min(1),
  category: z.string().optional(),
});

// POST /api/lexicon — add or update a code-word
export async function POST(req: Request) {
  try {
    const teacher = await requireTeacher();
    const body = await req.json();
    const parsed = lexiconSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const term = await prisma.glossaryTerm.upsert({
      where: { term: parsed.data.term.trim() },
      update: {
        definition: parsed.data.definition.trim(),
        category: parsed.data.category?.trim() || "Instructor Code Words",
      },
      create: {
        term: parsed.data.term.trim(),
        definition: parsed.data.definition.trim(),
        category: parsed.data.category?.trim() || "Instructor Code Words",
      },
    });

    await logAudit({
      actorId: teacher.id,
      action: "lexicon.upsert",
      entityType: "GlossaryTerm",
      entityId: term.id,
      metadata: { term: term.term, category: term.category },
    });

    return NextResponse.json({ term });
  } catch (err) {
    return handleApiError(err);
  }
}
