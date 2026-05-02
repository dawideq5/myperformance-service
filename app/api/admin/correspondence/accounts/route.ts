export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireAdminPanel } from "@/lib/admin-auth";
import {
  isOvhConfigured,
  listVerifiedEmailAccounts,
} from "@/lib/ovh-email";
import {
  isPostalHistoryConfigured,
  listMessagesForAddress,
} from "@/lib/postal-history";
import {
  isChatwootDbConfigured,
  listConversationsForContact,
} from "@/lib/chatwoot/messages";
import { createSuccessResponse, handleApiError } from "@/lib/api-utils";

/**
 * GET /api/admin/correspondence/accounts
 *
 * Lewa kolumna w `/admin/correspondence`. Zwraca:
 *   accounts[]      → zweryfikowane skrzynki OVH (cache 10min)
 *   counters[email] → { mail: number, chat: number } — liczniki per skrzynka
 *
 * Counters fetchowane lazy (tylko first 25 emaili) żeby nie zalać Postal/CW
 * przy 100+ skrzynkach. Pozostałe wyświetlają "—".
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const [accounts, ovhConfigured] = await Promise.all([
      listVerifiedEmailAccounts(),
      isOvhConfigured(),
    ]);

    const postalConfigured = isPostalHistoryConfigured();
    const chatwootConfigured = isChatwootDbConfigured();

    // Counters tylko dla pierwszych 25 — UI dociągnie resztę przez per-row
    // request gdy będzie taka potrzeba.
    const sliced = accounts.slice(0, 25);
    const counters: Record<string, { mail: number; chat: number }> = {};
    await Promise.all(
      sliced.map(async (acc) => {
        const [mails, convs] = await Promise.all([
          postalConfigured
            ? listMessagesForAddress(acc.email, { limit: 50 }).catch(() => [])
            : Promise.resolve([]),
          chatwootConfigured
            ? listConversationsForContact(acc.email).catch(() => [])
            : Promise.resolve([]),
        ]);
        counters[acc.email] = { mail: mails.length, chat: convs.length };
      }),
    );

    return createSuccessResponse({
      accounts,
      counters,
      configured: {
        ovh: ovhConfigured,
        postal: postalConfigured,
        chatwoot: chatwootConfigured,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
