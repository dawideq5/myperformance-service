export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireAdminPanel } from "@/lib/admin-auth";
import {
  listSmtpConfigs,
  upsertSmtpConfig,
  deleteSmtpConfig,
} from "@/lib/email/db";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const configs = await listSmtpConfigs();
    // Maskujemy hasło SMTP dla bezpieczeństwa.
    const masked = configs.map((c) => ({
      ...c,
      smtpPassword: c.smtpPassword ? "***" : null,
    }));
    return createSuccessResponse({ configs: masked });
  } catch (error) {
    return handleApiError(error);
  }
}

interface PostPayload {
  alias: string;
  label: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser?: string | null;
  smtpPassword?: string | null;
  useTls?: boolean;
  fromEmail: string;
  fromDisplay?: string | null;
  replyTo?: string | null;
  postalServerId?: number | null;
  isDefault?: boolean;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const body = (await req.json().catch(() => null)) as PostPayload | null;
    if (!body?.alias || !body?.label || !body?.smtpHost || !body?.fromEmail) {
      throw ApiError.badRequest("alias + label + smtpHost + fromEmail required");
    }
    const config = await upsertSmtpConfig({
      ...body,
      actor: session.user?.email ?? "admin",
    });
    return createSuccessResponse({
      config: { ...config, smtpPassword: config.smtpPassword ? "***" : null },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) throw ApiError.badRequest("id required");
    await deleteSmtpConfig(id);
    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
