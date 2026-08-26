import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";

export type SessionUser = {
  id: string;
  role: "TEACHER" | "STUDENT";
  username: string;
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Every protected route MUST call this — never trust a role or user id
 * that arrives in the request body/query. This is the single source of
 * truth for "who is calling this endpoint", resolved server-side from
 * the signed session cookie/JWT.
 */
export async function requireUser(): Promise<SessionUser> {
  const session = await getServerSession(authOptions);
  const user = session?.user as unknown as SessionUser | undefined;
  if (!user?.id) {
    throw new ApiError(401, "Authentication required");
  }
  return user;
}

export async function requireTeacher(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "TEACHER") {
    throw new ApiError(403, "Teacher/admin access required");
  }
  return user;
}

/**
 * Guard for any resource scoped to a single student (notes, questions,
 * confusions, bookmarks, highlights). Prevents IDOR: a student can only
 * ever act on rows where `ownerId === session.user.id`, regardless of
 * what id is in the URL/body. Teachers do NOT get a bypass here —
 * private student content stays private unless explicitly submitted.
 */
export function assertOwnsResource(ownerId: string, sessionUser: SessionUser) {
  if (ownerId !== sessionUser.id) {
    throw new ApiError(403, "You do not have access to this resource");
  }
}

export function handleApiError(err: unknown) {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("API Error:", err);
  const message = err instanceof Error ? err.message : "Internal server error";
  return NextResponse.json({ error: message }, { status: 500 });
}
