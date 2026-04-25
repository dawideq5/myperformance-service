export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireEmail } from "@/lib/admin-auth";
import {
  getTemplate,
  upsertTemplate,
  deleteTemplate,
} from "@/lib/email/db";
import {
  actionByKey,
} from "@/lib/email/templates-catalog";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

interface Ctx {
  params: Promise<{ key: string }>;
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireEmail(session);
    const { key } = await params;
    const action = actionByKey(key);
    if (!action) throw ApiError.notFound("Unknown action key");
    const stored = await getTemplate(key);
    return createSuccessResponse({
      action,
      template: {
        actionKey: key,
        enabled: stored?.enabled ?? true,
        subject: stored?.subject ?? action.defaultSubject,
        body: stored?.body ?? action.defaultBody,
        layoutId: stored?.layoutId ?? null,
        smtpConfigId: stored?.smtpConfigId ?? null,
        hasOverride: !!stored,
        updatedAt: stored?.updatedAt ?? null,
        updatedBy: stored?.updatedBy ?? null,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

interface PatchPayload {
  enabled?: boolean;
  subject?: string;
  body?: string;
  layoutId?: string | null;
  smtpConfigId?: string | null;
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireEmail(session);
    const { key } = await params;
    const action = actionByKey(key);
    if (!action) throw ApiError.notFound("Unknown action key");
    if (action.editability === "readonly" || action.editability === "external-link") {
      throw ApiError.badRequest(
        "Ten szablon nie jest edytowalny w naszym dashboardzie",
      );
    }
    const body = (await req.json().catch(() => null)) as PatchPayload | null;
    if (!body) throw ApiError.badRequest("body required");
    const existing = await getTemplate(key);
    const updated = await upsertTemplate({
      actionKey: key,
      enabled: body.enabled ?? existing?.enabled ?? true,
      subject: body.subject ?? existing?.subject ?? action.defaultSubject,
      body: body.body ?? existing?.body ?? action.defaultBody,
      layoutId: body.layoutId !== undefined ? body.layoutId : existing?.layoutId ?? null,
      smtpConfigId:
        body.smtpConfigId !== undefined ? body.smtpConfigId : existing?.smtpConfigId ?? null,
      actor: session.user?.email ?? "admin",
    });
    return createSuccessResponse({ template: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireEmail(session);
    const { key } = await params;
    await deleteTemplate(key);
    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
