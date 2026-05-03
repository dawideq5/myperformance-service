export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireAdminPanel } from "@/lib/admin-auth";
import { createSuccessResponse, handleApiError } from "@/lib/api-utils";
import {
  getWebhookHealth,
  type WebhookSource,
} from "@/lib/webhooks/health";

const SOURCES: readonly WebhookSource[] = [
  "chatwoot",
  "outline",
  "moodle",
  "documenso",
  "keycloak",
  "backup",
  "wazuh",
  "livekit",
];

interface Ctx {
  params: Promise<{ source: string }>;
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const { source } = await params;
    if (!SOURCES.includes(source as WebhookSource)) {
      return NextResponse.json({ error: "unknown source" }, { status: 404 });
    }
    const health = await getWebhookHealth(source as WebhookSource);
    return createSuccessResponse(health);
  } catch (err) {
    return handleApiError(err);
  }
}
