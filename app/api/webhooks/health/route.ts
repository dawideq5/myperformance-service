export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireAdminPanel } from "@/lib/admin-auth";
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
];

export async function GET() {
  const session = await getServerSession(authOptions);
  requireAdminPanel(session);
  const all = await Promise.all(SOURCES.map((s) => getWebhookHealth(s)));
  return NextResponse.json({ sources: all });
}
