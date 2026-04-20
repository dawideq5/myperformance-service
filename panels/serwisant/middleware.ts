import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

const REQUIRED_ROLE = "serwisant";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token as { accessToken?: string; roles?: string[] } | null;
    if (!token?.accessToken) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    const roles = token.roles ?? [];
    if (!roles.includes(REQUIRED_ROLE) && !roles.includes("admin")) {
      return NextResponse.redirect(new URL("/forbidden", req.url));
    }
    return NextResponse.next();
  },
  {
    callbacks: { authorized: () => true },
    pages: { signIn: "/login" },
  }
);

export const config = {
  matcher: ["/((?!login|forbidden|api/auth|api/health|_next|favicon.ico).*)"],
};
