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
  createPricelistItem,
  listPricelist,
  type PricelistInput,
} from "@/lib/pricelist";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);
    const items = await listPricelist();
    return createSuccessResponse({ items });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);
    if (!canAccessConfigHub(session)) {
      throw ApiError.forbidden("Wymagane uprawnienia config_admin");
    }
    const body = (await req.json().catch(() => null)) as PricelistInput | null;
    if (!body) throw ApiError.badRequest("Invalid JSON");
    try {
      const item = await createPricelistItem(body);
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
