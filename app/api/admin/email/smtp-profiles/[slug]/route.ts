export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireEmail } from "@/lib/admin-auth";
import {
  deleteSmtpProfile,
  getSmtpProfile,
  upsertSmtpProfile,
  type SmtpProfile,
  type SmtpProfileInput,
} from "@/lib/email/db/smtp-profiles";
import { invalidateTransporterCache } from "@/lib/smtp";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

interface Ctx {
  params: Promise<{ slug: string }>;
}

function mask(p: SmtpProfile): SmtpProfile & { hasPasswordPlain: boolean } {
  return {
    ...p,
    passwordPlain: null,
    hasPasswordPlain: !!p.passwordPlain,
  };
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireEmail(session);
    const { slug } = await params;
    const profile = await getSmtpProfile(slug);
    if (!profile) throw ApiError.notFound("SMTP profile not found");
    return createSuccessResponse({ profile: mask(profile) });
  } catch (error) {
    return handleApiError(error);
  }
}

interface PatchPayload {
  name?: string;
  description?: string | null;
  host?: string;
  port?: number;
  secure?: boolean;
  username?: string;
  passwordRef?: string | null;
  passwordPlain?: string | null;
  fromAddress?: string;
  fromName?: string;
  replyTo?: string | null;
  postalOrgName?: string | null;
  postalServerName?: string | null;
  isDefault?: boolean;
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireEmail(session);
    const { slug } = await params;
    const existing = await getSmtpProfile(slug);
    if (!existing) throw ApiError.notFound("SMTP profile not found");
    const body = (await req.json().catch(() => null)) as PatchPayload | null;
    if (!body) throw ApiError.badRequest("body required");
    // Merge — PATCH zachowuje pola których admin nie wysłał. passwordPlain
    // ma 3-stanową semantykę — undefined/"" = keep, null = clear, "x" = set.
    const input: SmtpProfileInput = {
      slug,
      name: body.name ?? existing.name,
      description: body.description !== undefined ? body.description : existing.description,
      host: body.host ?? existing.host,
      port: typeof body.port === "number" ? body.port : existing.port,
      secure: typeof body.secure === "boolean" ? body.secure : existing.secure,
      username: body.username ?? existing.username,
      passwordRef:
        body.passwordRef !== undefined ? body.passwordRef : existing.passwordRef,
      passwordPlain: body.passwordPlain,
      fromAddress: body.fromAddress ?? existing.fromAddress,
      fromName: body.fromName ?? existing.fromName,
      replyTo: body.replyTo !== undefined ? body.replyTo : existing.replyTo,
      postalOrgName:
        body.postalOrgName !== undefined ? body.postalOrgName : existing.postalOrgName,
      postalServerName:
        body.postalServerName !== undefined
          ? body.postalServerName
          : existing.postalServerName,
      isDefault:
        typeof body.isDefault === "boolean" ? body.isDefault : existing.isDefault,
    };
    const actor = session.user?.email ?? "admin";
    const profile = await upsertSmtpProfile(input, actor);
    invalidateTransporterCache();
    return createSuccessResponse({ profile: mask(profile) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireEmail(session);
    const { slug } = await params;
    const existing = await getSmtpProfile(slug);
    if (!existing) throw ApiError.notFound("SMTP profile not found");
    if (existing.isDefault) {
      throw ApiError.badRequest("Cannot delete default profile");
    }
    const actor = session.user?.email ?? "admin";
    await deleteSmtpProfile(slug, actor);
    invalidateTransporterCache(slug);
    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
