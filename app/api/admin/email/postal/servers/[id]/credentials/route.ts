export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireEmail } from "@/lib/admin-auth";
import {
  listCredentials,
  createCredential,
  deleteCredential,
} from "@/lib/email/postal";
import { appendPostalAudit } from "@/lib/email/db";
import { ExternalServiceUnavailableError } from "@/lib/db";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

interface Ctx {
  params: Promise<{ id: string }>;
}

function handlePostalError(error: unknown) {
  if (error instanceof ExternalServiceUnavailableError) {
    return handleApiError(
      ApiError.serviceUnavailable("Postal niedostępne w trybie deweloperskim"),
    );
  }
  return handleApiError(error);
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireEmail(session);
    const { id } = await params;
    const credentials = await listCredentials(Number(id));
    return createSuccessResponse({ credentials });
  } catch (error) {
    if (error instanceof ExternalServiceUnavailableError) {
      return createSuccessResponse({ credentials: [], degraded: true });
    }
    return handleApiError(error);
  }
}

interface PostPayload {
  type: "SMTP" | "API";
  name: string;
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireEmail(session);
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as PostPayload | null;
    if (!body?.type || !body?.name) {
      throw ApiError.badRequest("type + name required");
    }
    const cred = await createCredential({
      serverId: Number(id),
      type: body.type,
      name: body.name,
    });
    await appendPostalAudit({
      actor: session.user?.email ?? "admin",
      operation: "credential.create",
      targetType: "credential",
      targetId: String(cred.id),
      status: "ok",
      details: { serverId: id, name: cred.name, type: cred.type },
    });
    return createSuccessResponse({ credential: cred });
  } catch (error) {
    return handlePostalError(error);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireEmail(session);
    await params;
    const url = new URL(req.url);
    const credId = url.searchParams.get("credId");
    if (!credId) throw ApiError.badRequest("credId required");
    await deleteCredential(Number(credId));
    await appendPostalAudit({
      actor: session.user?.email ?? "admin",
      operation: "credential.delete",
      targetType: "credential",
      targetId: credId,
      status: "ok",
    });
    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handlePostalError(error);
  }
}
