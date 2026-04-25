export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireAdminPanel } from "@/lib/admin-auth";
import { getBranding, updateBranding, type BrandingPatch } from "@/lib/email/db";
import {
  propagateBranding,
  listPropagationTargets,
} from "@/lib/email/branding";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const branding = await getBranding();
    const targets = listPropagationTargets();
    return createSuccessResponse({ branding, targets });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const body = (await req.json().catch(() => null)) as BrandingPatch | null;
    if (!body || typeof body !== "object") {
      throw ApiError.badRequest("Invalid body");
    }
    const actor = session.user?.email ?? "admin";
    const branding = await updateBranding(body, actor);
    return createSuccessResponse({ branding });
  } catch (error) {
    return handleApiError(error);
  }
}
