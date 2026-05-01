export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireEmail } from "@/lib/admin-auth";
import { updateServer, deleteServer } from "@/lib/email/postal";
import { appendPostalAudit } from "@/lib/email/db";
import { ExternalServiceUnavailableError } from "@/lib/db";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

function handlePostalError(error: unknown) {
  if (error instanceof ExternalServiceUnavailableError) {
    return handleApiError(
      ApiError.serviceUnavailable("Postal niedostępne w trybie deweloperskim"),
    );
  }
  return handleApiError(error);
}

interface Ctx {
  params: Promise<{ id: string }>;
}

interface PatchPayload {
  postmasterAddress?: string;
  sendLimit?: number | null;
  mode?: string;
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireEmail(session);
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as PatchPayload | null;
    if (!body) throw ApiError.badRequest("body required");
    await updateServer(Number(id), body);
    await appendPostalAudit({
      actor: session.user?.email ?? "admin",
      operation: "server.update",
      targetType: "server",
      targetId: id,
      status: "ok",
      details: body as Record<string, unknown>,
    });
    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handlePostalError(error);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireEmail(session);
    const { id } = await params;
    await deleteServer(Number(id));
    await appendPostalAudit({
      actor: session.user?.email ?? "admin",
      operation: "server.delete",
      targetType: "server",
      targetId: id,
      status: "ok",
    });
    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handlePostalError(error);
  }
}
