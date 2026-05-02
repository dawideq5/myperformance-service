export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService } from "@/lib/services";
import { findCustomerConversations } from "@/lib/chatwoot-customer";
import { listMessagesForRecipient, isPostalConfigured } from "@/lib/postal";
import { getOptionalEnv } from "@/lib/env";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PANEL_CORS_HEADERS });
}

function userOwns(
  service: { locationId: string | null; serviceLocationId: string | null },
  locationIds: string[],
): boolean {
  if (locationIds.length === 0) return false;
  if (service.locationId && locationIds.includes(service.locationId)) return true;
  if (
    service.serviceLocationId &&
    locationIds.includes(service.serviceLocationId)
  )
    return true;
  return false;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const { id } = await params;
  const service = await getService(id);
  if (!service) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }
  if (!userOwns(service, user.locationIds)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: PANEL_CORS_HEADERS },
    );
  }

  const chatwootBase =
    getOptionalEnv("CHATWOOT_PUBLIC_URL").trim() ||
    getOptionalEnv("CHATWOOT_URL").trim() ||
    "https://chat.myperformance.pl";
  const accountId = getOptionalEnv("CHATWOOT_ACCOUNT_ID", "1").trim() || "1";

  const [conversations, emails] = await Promise.all([
    findCustomerConversations({
      customerEmail: service.contactEmail,
      customerPhone: service.contactPhone,
      limit: 20,
    }),
    service.contactEmail && isPostalConfigured()
      ? listMessagesForRecipient(service.contactEmail, 20)
      : Promise.resolve([]),
  ]);

  const chatwoot = conversations.map((c) => ({
    id: c.id,
    status: c.status,
    unreadCount: c.unreadCount,
    lastMessageAt: c.lastMessageAt,
    lastMessagePreview: c.lastMessagePreview,
    deepLink: `${chatwootBase.replace(/\/$/, "")}/app/accounts/${accountId}/conversations/${c.id}`,
  }));

  return NextResponse.json(
    {
      chatwoot,
      email: emails,
      meta: {
        chatwootEnabled: chatwoot.length > 0,
        postalEnabled: isPostalConfigured(),
        customerEmail: service.contactEmail,
        customerPhone: service.contactPhone,
      },
    },
    { headers: PANEL_CORS_HEADERS },
  );
}
