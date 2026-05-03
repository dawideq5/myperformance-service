export const dynamic = "force-dynamic";

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

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const all = await Promise.all(SOURCES.map((s) => getWebhookHealth(s)));
    return createSuccessResponse({ sources: all });
  } catch (err) {
    return handleApiError(err);
  }
}
