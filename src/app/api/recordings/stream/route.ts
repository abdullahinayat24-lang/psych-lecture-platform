import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { requireUser, ApiError, handleApiError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const BASE_DIR = process.env.STORAGE_LOCAL_PATH ?? "./storage/audio";

/**
 * GET /api/recordings/stream?key=...
 * Every request is authenticated and checked against the lecture's
 * publish status before any bytes are streamed — audio is never
 * reachable via a bare static file URL (section 22: protection
 * against unauthorized lecture downloads).
 */
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");
    if (!key) throw new ApiError(400, "Missing key");

    // key format: lectures/{lectureId}/recordings/...
    const lectureId = key.split("/")[1];
    if (!lectureId) throw new ApiError(400, "Invalid key");

    const lecture = await prisma.lecture.findUnique({ where: { id: lectureId } });
    if (!lecture) throw new ApiError(404, "Not found");
    if (user.role === "STUDENT" && lecture.status !== "PUBLISHED") {
      throw new ApiError(404, "Not found");
    }

    const resolvedBase = path.resolve(BASE_DIR);
    const resolvedPath = path.resolve(BASE_DIR, key);
    if (!resolvedPath.startsWith(resolvedBase)) {
      throw new ApiError(403, "Access denied: invalid storage path");
    }

    try {
      const stat = await fs.stat(resolvedPath);
      const fileSize = stat.size;
      const range = req.headers.get("range");

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
    } catch {
      throw new ApiError(404, "Audio file not found on disk");
    }
  } catch (err) {
    return handleApiError(err);
  }
}
