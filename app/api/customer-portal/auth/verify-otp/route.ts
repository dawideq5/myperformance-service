import { NextResponse } from "next/server";
import { verifyOtp } from "@/lib/customer-portal/otp";
import { signOtpSession, buildSessionCookie } from "@/lib/customer-portal/session";
import { corsHeaders, preflightResponse } from "@/lib/customer-portal/cors";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

const logger = log.child({ module: "customer-portal-verify-otp" });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function OPTIONS(req: Request) {
  return preflightResponse(req);
}

export async function POST(req: Request) {
  const cors = corsHeaders(req);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400, headers: cors },
    );
  }
  const email = String((body as { email?: unknown })?.email ?? "")
    .trim()
    .toLowerCase();
  const code = String((body as { code?: unknown })?.code ?? "").trim();
  if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { error: "invalid_input" },
      { status: 400, headers: cors },
    );
  }

  // Per-IP brute-force throttle.
  const ip = getClientIp(req);
  const limit = rateLimit(`customer-portal-verify:${ip}`, {
    capacity: 10,
    refillPerSec: 0.2,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "too_many_requests", retryAfterMs: limit.retryAfterMs },
      { status: 429, headers: cors },
    );
  }

  let result;
  try {
    result = await verifyOtp(email, code);
  } catch (err) {
    logger.error("verifyOtp threw", { err: String(err) });
    return NextResponse.json(
      { error: "internal" },
      { status: 500, headers: cors },
    );
  }
  if (!result.ok || !result.email) {
    return NextResponse.json(
      { error: "invalid_code", reason: result.reason ?? "invalid" },
      { status: 401, headers: cors },
    );
  }

  const token = signOtpSession(result.email, 24 * 3600);
  const cookie = buildSessionCookie(token, 24 * 3600);

  return NextResponse.json(
    { ok: true, email: result.email },
    {
      status: 200,
      headers: {
        ...cors,
        "Set-Cookie": cookie,
      },
    },
  );
}
