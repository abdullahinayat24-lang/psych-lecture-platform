import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTeacher, ApiError, handleApiError } from "@/lib/rbac";
import { getStorageProvider } from "@/lib/providers/storage";

/**
 * POST /api/recordings/:lectureId/segment
 * multipart/form-data: { chunk: File, sequenceIndex: number, startOffsetSec: number }
 *
 * Each chunk from the browser's MediaRecorder (typically emitted every
 * few seconds via `mediaRecorder.start(timeslice)`) is written to
 * storage and recorded in the DB as soon as it arrives — never held
 * only in memory. If the browser disconnects mid-lecture, only the
 * in-flight chunk is at risk, not the whole recording. On reconnect,
 * the client resumes posting chunks with the next sequenceIndex.
 */
export async function POST(req: Request, { params }: { params: { lectureId: string } }) {
  try {
    const user = await requireTeacher();

    const recording = await prisma.lectureRecording.findFirst({
      where: { lectureId: params.lectureId, isFinalized: false },
    });
    if (!recording) throw new ApiError(400, "No active recording session — call /start first");

    const form = await req.formData();
    const chunk = form.get("chunk") as File | null;
    const sequenceIndex = Number(form.get("sequenceIndex"));
    const startOffsetSec = Number(form.get("startOffsetSec"));

    if (!chunk || Number.isNaN(sequenceIndex) || Number.isNaN(startOffsetSec)) {
      return NextResponse.json({ error: "chunk, sequenceIndex, startOffsetSec are required" }, { status: 400 });
    }

    const storage = getStorageProvider();
    const key = `lectures/${params.lectureId}/recordings/${recording.id}/chunk-${String(sequenceIndex).padStart(6, "0")}.webm`;
    const buffer = Buffer.from(await chunk.arrayBuffer());

    await storage.put(key, buffer, chunk.type || "audio/webm");

    const segment = await prisma.recordingSegment.upsert({
      where: { recordingId_sequenceIndex: { recordingId: recording.id, sequenceIndex } },
      create: {
        recordingId: recording.id,
        sequenceIndex,
        storageKey: key,
        startOffsetSec,
        status: "uploaded",
      },
      update: { storageKey: key, startOffsetSec, status: "uploaded" },
    });

    return NextResponse.json({ segment }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
