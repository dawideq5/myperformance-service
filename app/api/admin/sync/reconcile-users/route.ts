export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireAdminPanel } from "@/lib/admin-auth";
import { reconcileUsers } from "@/lib/permissions/sync";
import {
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

/**
 * Drift reconciliation: znajdź użytkowników w aplikacjach natywnych
 * (Moodle/Chatwoot/Outline/Documenso/Directus/Postal) których nie ma
 * w Keycloak i usuń ich.
 *
 * GET  → dry-run (lista kandydatów do usunięcia, bez zmian)
 * POST → apply (usuwa drift)
 *
 * Defense-in-depth wobec `enqueueUserDeprovision` — gdy normalny KC delete
 * z jakiegokolwiek powodu nie wywołał providera, ten endpoint posprząta.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const results = await reconcileUsers({ apply: false });
    return createSuccessResponse({ dryRun: true, results });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const results = await reconcileUsers({ apply: true });
    return createSuccessResponse({ dryRun: false, results });
  } catch (error) {
    return handleApiError(error);
  }
}
