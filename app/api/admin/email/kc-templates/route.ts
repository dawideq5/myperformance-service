export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireEmail } from "@/lib/admin-auth";
import {
  KC_EMAIL_KEYS,
  ensureLocaleEnabled,
  listLocaleMessages,
} from "@/lib/email/kc-localization";
import {
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireEmail(session);
    const url = new URL(req.url);
    const locale = url.searchParams.get("locale") || "pl";
    await ensureLocaleEnabled(locale);
    const messages = await listLocaleMessages(locale);
    const entries = KC_EMAIL_KEYS.map((k) => ({
      key: k.key,
      label: k.label,
      value: messages[k.key] ?? null,
      hasOverride: k.key in messages,
    }));
    return createSuccessResponse({ locale, entries });
  } catch (error) {
    return handleApiError(error);
  }
}
