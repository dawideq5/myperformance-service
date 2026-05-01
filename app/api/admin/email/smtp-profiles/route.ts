export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireEmail } from "@/lib/admin-auth";
import {
  listSmtpProfiles,
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

/** Maskuje pola wrażliwe — `passwordPlain` nigdy nie wraca do klienta. */
function mask(p: SmtpProfile): SmtpProfile & { hasPasswordPlain: boolean } {
  return {
    ...p,
    passwordPlain: null,
    hasPasswordPlain: !!p.passwordPlain,
  };
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireEmail(session);
    const profiles = await listSmtpProfiles();
    return createSuccessResponse({ profiles: profiles.map(mask) });
  } catch (error) {
    return handleApiError(error);
  }
}

interface PostPayload {
  slug: string;
  name: string;
  description?: string | null;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  passwordRef?: string | null;
  passwordPlain?: string | null;
  fromAddress: string;
  fromName: string;
  replyTo?: string | null;
  postalOrgName?: string | null;
  postalServerName?: string | null;
  isDefault?: boolean;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireEmail(session);
    const body = (await req.json().catch(() => null)) as PostPayload | null;
    if (
      !body?.slug ||
      !body?.name ||
      !body?.host ||
      !body?.username ||
      !body?.fromAddress ||
      !body?.fromName ||
      typeof body.port !== "number"
    ) {
      throw ApiError.badRequest(
        "slug + name + host + port + username + fromAddress + fromName required",
      );
    }
    const input: SmtpProfileInput = {
      slug: body.slug,
      name: body.name,
      description: body.description ?? null,
      host: body.host,
      port: body.port,
      secure: !!body.secure,
      username: body.username,
      passwordRef: body.passwordRef ?? null,
      passwordPlain: body.passwordPlain,
      fromAddress: body.fromAddress,
      fromName: body.fromName,
      replyTo: body.replyTo ?? null,
      postalOrgName: body.postalOrgName ?? null,
      postalServerName: body.postalServerName ?? null,
      isDefault: !!body.isDefault,
    };
    const actor = session.user?.email ?? "admin";
    const profile = await upsertSmtpProfile(input, actor);
    // Cache invalidation — następne sendMail zbuduje świeży transporter
    // z nowymi credentials. Inwaliduj wszystko (nie tylko ten slug) na wypadek
    // zmiany is_default — branding default mógł wskazywać inny profil.
    invalidateTransporterCache();
    return createSuccessResponse({ profile: mask(profile) });
  } catch (error) {
    return handleApiError(error);
  }
}
