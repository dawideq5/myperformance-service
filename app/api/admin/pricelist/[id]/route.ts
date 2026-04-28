export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
  requireSession,
} from "@/lib/api-utils";
import { canAccessConfigHub } from "@/lib/admin-auth";
import {
  deletePricelistItem,
  updatePricelistItem,
  type PricelistInput,
} from "@/lib/pricelist";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);
    if (!canAccessConfigHub(session)) {
      throw ApiError.forbidden("Wymagane uprawnienia config_admin");
    }
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as
      | Partial<PricelistInput>
      | null;
    if (!body) throw ApiError.badRequest("Invalid JSON");
    try {
      const item = await updatePricelistItem(id, body);
      return createSuccessResponse({ item });
    } catch (err) {
      throw ApiError.badRequest(
        err instanceof Error ? err.message : String(err),
      );
    }
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);
    if (!canAccessConfigHub(session)) {
      throw ApiError.forbidden("Wymagane uprawnienia config_admin");
    }
    const { id } = await params;
    await deletePricelistItem(id);
    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
