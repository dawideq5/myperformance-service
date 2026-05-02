export const dynamic = "force-dynamic";

import { createHmac } from "crypto";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { createSuccessResponse, handleApiError, requireSession } from "@/lib/api-utils";

/**
 * Zwraca dane potrzebne do Chatwoot widget user verification:
 *   - identifier (KC sub)
 *   - identifier_hash (HMAC-SHA256 z CHATWOOT_HMAC_IDENTIFIER_KEY)
 *   - email, name (firstName + lastName z KC ID token)
 *
 * Endpoint dostępny dla każdego zalogowanego usera — widget chatu jest
 * uniwersalnym kanałem kontaktu z wewnętrznymi działami, nie tylko dla
 * userów z rolą chatwoot_*.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);

    const identifier = session.user.id ?? session.user.email ?? "";
    const email = session.user.email ?? "";
    const firstName = session.user.firstName ?? "";
    const lastName = session.user.lastName ?? "";
    const fullName =
      [firstName, lastName].filter(Boolean).join(" ").trim() ||
      session.user.name ||
      email;

    const hmacKey = process.env.CHATWOOT_HMAC_IDENTIFIER_KEY?.trim() ?? "";
    const identifierHash = hmacKey
      ? createHmac("sha256", hmacKey).update(identifier).digest("hex")
      : null;

    return createSuccessResponse({
      identifier,
      identifier_hash: identifierHash,
      email,
      name: fullName,
      websiteToken: process.env.NEXT_PUBLIC_CHATWOOT_WEBSITE_TOKEN ?? null,
      baseUrl: process.env.NEXT_PUBLIC_CHATWOOT_BASE_URL ?? "https://chat.myperformance.pl",
    });
  } catch (err) {
    return handleApiError(err);
  }
}
