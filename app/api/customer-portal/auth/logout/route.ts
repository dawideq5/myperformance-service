import { NextResponse } from "next/server";
import {
  buildClearSessionCookie,
} from "@/lib/customer-portal/session";
import { corsHeaders, preflightResponse } from "@/lib/customer-portal/cors";

export const dynamic = "force-dynamic";

export function OPTIONS(req: Request) {
  return preflightResponse(req);
}

export async function POST(req: Request) {
  const cors = corsHeaders(req);
  return NextResponse.json(
    { ok: true },
    {
      status: 200,
      headers: {
        ...cors,
        "Set-Cookie": buildClearSessionCookie(),
      },
    },
  );
}
