export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireAdminPanel } from "@/lib/admin-auth";
import { getOvhConfig, updateOvhConfig } from "@/lib/email/db";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const config = await getOvhConfig();
    // Maskujemy sekrety dla bezpieczeństwa.
    return createSuccessResponse({
      config: {
        endpoint: config.endpoint,
        appKey: config.appKey,
        appSecret: config.appSecret ? "***" : null,
        consumerKey: config.consumerKey ? "***" : null,
        enabled: config.enabled,
        updatedAt: config.updatedAt,
        updatedBy: config.updatedBy,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

interface PutPayload {
  endpoint?: "ovh-eu" | "ovh-us" | "ovh-ca";
  appKey?: string | null;
  appSecret?: string | null;
  consumerKey?: string | null;
  enabled?: boolean;
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const body = (await req.json().catch(() => null)) as PutPayload | null;
    if (!body) throw ApiError.badRequest("body required");
    // "***" oznacza "nie zmieniaj" — nie zapisujemy do DB.
    const patch: PutPayload = {};
    if (body.endpoint) patch.endpoint = body.endpoint;
    if (body.appKey !== undefined && body.appKey !== "***") {
      patch.appKey = body.appKey;
    }
    if (body.appSecret !== undefined && body.appSecret !== "***") {
      patch.appSecret = body.appSecret;
    }
    if (body.consumerKey !== undefined && body.consumerKey !== "***") {
      patch.consumerKey = body.consumerKey;
    }
    if (body.enabled !== undefined) patch.enabled = body.enabled;
    const updated = await updateOvhConfig(patch, session.user?.email ?? "admin");
    return createSuccessResponse({
      config: {
        endpoint: updated.endpoint,
        appKey: updated.appKey,
        appSecret: updated.appSecret ? "***" : null,
        consumerKey: updated.consumerKey ? "***" : null,
        enabled: updated.enabled,
        updatedAt: updated.updatedAt,
        updatedBy: updated.updatedBy,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
