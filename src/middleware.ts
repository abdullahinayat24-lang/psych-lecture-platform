import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

/**
 * Page-level route protection. This is defense-in-depth only — every
 * API route independently re-validates the session and role via
 * src/lib/rbac.ts, since middleware alone must never be the sole
 * authorization boundary (per section 3: validate every protected
 * request server-side).
 */
export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    if (path.startsWith("/teacher") && token?.role !== "TEACHER") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: { signIn: "/login" },
  }
);

export const config = {
  matcher: ["/dashboard/:path*", "/teacher/:path*", "/lectures/:path*", "/topics/:path*", "/search"],
};
