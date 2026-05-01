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

interface Ctx {
  params: Promise<{ source: string }>;
}

export async function GET(_req: Request, { params }: Ctx) {
  const session = await getServerSession(authOptions);
  requireAdminPanel(session);
  const { source } = await params;
  if (!SOURCES.includes(source as WebhookSource)) {
    return NextResponse.json({ error: "unknown source" }, { status: 404 });
  }
  const health = await getWebhookHealth(source as WebhookSource);
  return NextResponse.json(health);
}
