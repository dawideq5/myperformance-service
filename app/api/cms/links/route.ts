export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
  requireSession,
} from "@/lib/api-utils";
import { hasArea } from "@/lib/admin-auth";
import { getLinks, type CmsLink } from "@/lib/directus-cms";

const ALLOWED_CATEGORIES: ReadonlySet<CmsLink["category"]> = new Set([
  "footer",
  "help",
  "social",
  "email-footer",
]);

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);

    const { searchParams } = new URL(request.url);
    const rawCategory = searchParams.get("category");
    let category: CmsLink["category"] | undefined;
    if (rawCategory) {
      if (!ALLOWED_CATEGORIES.has(rawCategory as CmsLink["category"])) {
        throw ApiError.badRequest("Invalid category");
      }
      category = rawCategory as CmsLink["category"];
    }

    const all = await getLinks(category);
    const visible = all.filter(
      (l) => !l.requiresArea || hasArea(session, l.requiresArea),
    );

    return createSuccessResponse({ links: visible });
  } catch (error) {
    return handleApiError(error);
  }
}
