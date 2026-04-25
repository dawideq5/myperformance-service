export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireAdminPanel } from "@/lib/admin-auth";
import {
  ensureDefaultLayout,
  listLayouts,
  upsertLayout,
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
    await ensureDefaultLayout();
    const layouts = await listLayouts();
    return createSuccessResponse({ layouts });
  } catch (error) {
    return handleApiError(error);
  }
}

interface PostPayload {
  slug: string;
  name: string;
  description?: string | null;
  html: string;
  isDefault?: boolean;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const body = (await req.json().catch(() => null)) as PostPayload | null;
    if (!body?.slug || !body?.name || !body?.html) {
      throw ApiError.badRequest("slug + name + html required");
    }
    const layout = await upsertLayout({
      ...body,
      actor: session.user?.email ?? "admin",
    });
    return createSuccessResponse({ layout });
  } catch (error) {
    return handleApiError(error);
  }
}
