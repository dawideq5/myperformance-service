export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { verifyUploadToken } from "@/lib/upload-bridge";
import { listServicePhotos } from "@/lib/service-photos";
import { log } from "@/lib/logger";

const logger = log.child({ module: "upload-bridge-status" });

const PUBLIC_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PUBLIC_CORS_HEADERS });
}

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function GET(_req: Request, ctx: RouteContext) {
  const { token } = await ctx.params;
  const verify = verifyUploadToken(token);
  if (!verify.valid) {
    return NextResponse.json(
      { valid: false, reason: verify.reason },
      { status: 200, headers: PUBLIC_CORS_HEADERS },
    );
  }
  const { payload } = verify;
  let photosUploaded = 0;
  try {
    const photos = await listServicePhotos(payload.serviceId, {
      stage: payload.stage,
    });
    // Count only photos uploaded since this token was issued — gives the
    // mobile UI a session-scoped counter rather than a global one.
    photosUploaded = photos.filter(
      (p) => new Date(p.uploadedAt).getTime() >= payload.iat,
    ).length;
  } catch (err) {
    logger.warn("status photos count failed", {
      serviceId: payload.serviceId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
  return NextResponse.json(
    {
      valid: true,
      expiresAt: new Date(payload.exp).toISOString(),
      serviceId: payload.serviceId,
      ticketNumber: payload.ticketNumber ?? null,
      stage: payload.stage,
      photosUploaded,
    },
    { status: 200, headers: PUBLIC_CORS_HEADERS },
  );
}
