import { NextRequest, NextResponse } from "next/server";
import { getCanonicalAppUrl } from "@/lib/app-url";

export default function middleware(request: NextRequest) {
  const canonicalUrl = new URL(getCanonicalAppUrl());
  const requestUrl = request.nextUrl.clone();

  if (requestUrl.hostname === "www.myperformance.pl") {
    requestUrl.protocol = canonicalUrl.protocol;
    requestUrl.host = canonicalUrl.host;
    return NextResponse.redirect(requestUrl, 308);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
