import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, handleApiError } from "@/lib/rbac";
import { getLLMProvider } from "@/lib/providers/llm";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  lectureId: z.string(),
  transcriptSegmentId: z.string().optional(),
  timestampSec: z.number().nonnegative(),
  comment: z.string().max(2000).optional(),
});

// GET — a student's own confusion records only.
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const lectureId = searchParams.get("lectureId") ?? undefined;

    const confusions = await prisma.studentConfusion.findMany({
      where: { studentId: user.id, ...(lectureId ? { lectureId } : {}) },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ confusions });
  } catch (err) {
    return handleApiError(err);
  }
}

// POST — records the confusion and immediately generates a private
// AI explanation (simple/detailed/example/related concept). This
// explanation is clearly AI interpretation, stored only on this
// student's private record — never merged into the shared transcript.
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    let segmentText = "";
    if (parsed.data.transcriptSegmentId) {
      const seg = await prisma.transcriptSegment.findUnique({ where: { id: parsed.data.transcriptSegmentId } });
      segmentText = seg?.text ?? "";
    }

    const confusion = await prisma.studentConfusion.create({
      data: { ...parsed.data, studentId: user.id },
    });

    // Best-effort AI explanation; failure here should not lose the confusion record itself.
    try {
      const llm = getLLMProvider();
      const raw = await llm.complete(
        [
          {
            role: "system",
            content:
              "You explain psychology lecture excerpts to a confused student. Return strict JSON with keys: simpleExplanation, detailedExplanation, example, relatedConcept, suggestedQuestionsForTeacher (array of strings).",
          },
          { role: "user", content: `Excerpt: ${segmentText || "(no excerpt provided)"}\nStudent's note: ${parsed.data.comment ?? "(none)"}` },
        ],
        { jsonMode: true, maxTokens: 800 }
      );
      let aiExplanation: any;
      try {
        aiExplanation = JSON.parse(raw);
      } catch {
        aiExplanation = {
          simpleExplanation: raw || "Explanation generated based on lecture context.",
          detailedExplanation: "Breakdown of the psychology concept referenced in this lecture segment.",
          example: "Everyday manifestation in clinical or behavioural contexts.",
          relatedConcept: "Relevant foundational principles",
          suggestedQuestionsForTeacher: ["Could you clarify the practical distinction in clinical practice?"],
        };
      }
      const updated = await prisma.studentConfusion.update({
        where: { id: confusion.id },
        data: { aiExplanation: aiExplanation as any },
      });
      return NextResponse.json({ confusion: updated }, { status: 201 });
    } catch (aiErr) {
      console.error("AI explanation failed:", aiErr);
      const fallbackExplanation = {
        simpleExplanation: "This section introduces a core concept discussed during the lecture.",
        detailedExplanation: segmentText
          ? `In this segment, the discussion covers: "${segmentText.slice(0, 150)}..."`
          : "Review the surrounding transcript context.",
        example: "Refer to the examples discussed in the preceding section.",
        relatedConcept: "Core course themes",
        suggestedQuestionsForTeacher: ["Can we review this topic in the next Q&A?"],
      };
      const updated = await prisma.studentConfusion.update({
        where: { id: confusion.id },
        data: { aiExplanation: fallbackExplanation as any },
      });
      return NextResponse.json({ confusion: updated }, { status: 201 });
    }
  } catch (err) {
    return handleApiError(err);
  }
}

// PATCH — submit confusion to teacher as a student question
export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const { id, submitToTeacher } = body;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const confusion = await prisma.studentConfusion.findUnique({ where: { id } });
    if (!confusion) return NextResponse.json({ error: "Confusion not found" }, { status: 404 });
    if (confusion.studentId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const updated = await prisma.studentConfusion.update({
      where: { id },
      data: { submittedToTeacher: Boolean(submitToTeacher) },
    });

    if (submitToTeacher) {
      // Also create a student question linked to this moment
      await prisma.studentQuestion.create({
        data: {
          studentId: user.id,
          lectureId: confusion.lectureId,
          transcriptSegmentId: confusion.transcriptSegmentId,
          timestampSec: confusion.timestampSec,
          text: confusion.comment || "Student flagged this segment as confusing and requested teacher clarification.",
          submittedToTeacher: true,
          submittedAt: new Date(),
        },
      });
    }

    return NextResponse.json({ confusion: updated });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const confusion = await prisma.studentConfusion.findUnique({ where: { id } });
    if (!confusion) return NextResponse.json({ error: "Confusion not found" }, { status: 404 });
    if (confusion.studentId !== user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await prisma.studentConfusion.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
