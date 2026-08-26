import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { requireUser, ApiError, handleApiError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const BASE_DIR = process.env.STORAGE_LOCAL_PATH ?? "./storage/audio";

/**
 * GET /api/recordings/stream?key=...
 * Streams lecture audio with Range (206) support from database audioBase64 or local disk.
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");
    if (!key) throw new ApiError(400, "Missing key");

    // key format: lectures/{lectureId}/...
    const lectureId = key.split("/")[1];
    if (!lectureId) throw new ApiError(400, "Invalid key");

    const lecture = await prisma.lecture.findUnique({
      where: { id: lectureId },
      include: { recordings: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!lecture) throw new ApiError(404, "Not found");
    if (user.role === "STUDENT" && lecture.status !== "PUBLISHED") {
      throw new ApiError(404, "Not found");
    }

    const range = req.headers.get("range");

    // 1. Try streaming from database audioBase64 (persistent across serverless lambdas)
    const latestRec = lecture.recordings?.[0];
    if (latestRec?.audioBase64) {
      let base64Data = latestRec.audioBase64;
      if (base64Data.includes(",")) {
        base64Data = base64Data.split(",")[1] || base64Data;
      }
      const audioBuffer = Buffer.from(base64Data, "base64");
      const fileSize = audioBuffer.length;

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0] || "0", 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize || end >= fileSize) {
          return new NextResponse(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${fileSize}` },
          });
        }

        const chunk = audioBuffer.subarray(start, end + 1);
        return new NextResponse(chunk, {
          status: 206,
          headers: {
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Accept-Ranges": "bytes",
            "Content-Length": String(chunk.length),
            "Content-Type": "audio/webm",
            "Cache-Control": "public, max-age=3600",
            "Content-Disposition": "inline",
          },
        });
      }

      return new NextResponse(audioBuffer, {
        headers: {
          "Content-Type": "audio/webm",
          "Content-Length": String(fileSize),
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=3600",
          "Content-Disposition": "inline",
        },
      });
    }

    // 2. Try streaming from local disk
    try {
      const resolvedBase = path.resolve(BASE_DIR);
      const resolvedPath = path.resolve(BASE_DIR, key);
      if (resolvedPath.startsWith(resolvedBase)) {
        const stat = await fs.stat(resolvedPath);
        const fileSize = stat.size;

        if (range) {
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0] || "0", 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

          if (start >= fileSize || end >= fileSize) {
            return new NextResponse(null, {
              status: 416,
              headers: { "Content-Range": `bytes */${fileSize}` },
            });
          }

          const chunksize = end - start + 1;
          const handle = await fs.open(resolvedPath, "r");
          const buffer = Buffer.alloc(chunksize);
          await handle.read(buffer, 0, chunksize, start);
          await handle.close();

          return new NextResponse(buffer, {
            status: 206,
            headers: {
              "Content-Range": `bytes ${start}-${end}/${fileSize}`,
              "Accept-Ranges": "bytes",
              "Content-Length": String(chunksize),
              "Content-Type": "audio/webm",
              "Cache-Control": "private, no-store",
              "Content-Disposition": "inline",
            },
          });
        }

        const data = await fs.readFile(resolvedPath);
        return new NextResponse(data, {
          headers: {
            "Content-Type": "audio/webm",
            "Content-Length": String(fileSize),
            "Accept-Ranges": "bytes",
            "Cache-Control": "private, no-store",
            "Content-Disposition": "inline",
          },
        });
      }
    } catch {
      // Fall through to 404
    }

    throw new ApiError(404, "Audio file not found");
  } catch (err) {
    return handleApiError(err);
  }
}
