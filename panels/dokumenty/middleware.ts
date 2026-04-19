import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    if (!token || !token.accessToken) {
      return NextResponse.redirect(new URL("/login", req.url));
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
