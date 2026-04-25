export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireEmail } from "@/lib/admin-auth";
import { listTemplates } from "@/lib/email/db";
import { EMAIL_ACTIONS } from "@/lib/email/templates-catalog";
import { createSuccessResponse, handleApiError } from "@/lib/api-utils";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireEmail(session);
    const stored = await listTemplates();
    const storedMap = new Map(stored.map((t) => [t.actionKey, t]));
    // Merge: dla każdej akcji z katalogu, jeśli mamy override w DB → zwróć
    // override + catalog metadata; inaczej zwróć defaulty z catalog.
    const merged = EMAIL_ACTIONS.map((action) => {
      const t = storedMap.get(action.key);
      return {
        actionKey: action.key,
        category: action.category,
        app: action.app,
        appLabel: action.appLabel,
        name: action.name,
        description: action.description,
        editability: action.editability,
        externalEditorUrl: action.externalEditorUrl,
        externalEditorLabel: action.externalEditorLabel,
        trigger: action.trigger,
        variables: action.variables,
        subject: t?.subject ?? action.defaultSubject,
        body: t?.body ?? action.defaultBody,
        enabled: t?.enabled ?? true,
        layoutId: t?.layoutId ?? null,
        smtpConfigId: t?.smtpConfigId ?? null,
        hasOverride: !!t,
        updatedAt: t?.updatedAt ?? null,
        updatedBy: t?.updatedBy ?? null,
      };
    });
    return createSuccessResponse({ templates: merged });
  } catch (error) {
    return handleApiError(error);
  }
}
