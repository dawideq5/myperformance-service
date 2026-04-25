export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireAdminPanel } from "@/lib/admin-auth";
import {
  setLocaleMessage,
  deleteLocaleMessage,
  ensureLocaleEnabled,
} from "@/lib/email/kc-localization";
import {
  upsertKcLocalization,
  deleteKcLocalization,
} from "@/lib/email/db";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

interface Ctx {
  params: Promise<{ key: string }>;
}

interface PutPayload {
  value: string;
  locale?: string;
}

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const { key } = await params;
    const body = (await req.json().catch(() => null)) as PutPayload | null;
    if (!body || typeof body.value !== "string") {
      throw ApiError.badRequest("value required");
    }
    const locale = body.locale ?? "pl";
    await ensureLocaleEnabled(locale);
    await setLocaleMessage(locale, key, body.value);
    await upsertKcLocalization(
      locale,
      key,
      body.value,
      session.user?.email ?? "admin",
    );
    return createSuccessResponse({ ok: true, locale, key });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const { key } = await params;
    const url = new URL(req.url);
    const locale = url.searchParams.get("locale") || "pl";
    await deleteLocaleMessage(locale, key);
    await deleteKcLocalization(locale, key);
    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
