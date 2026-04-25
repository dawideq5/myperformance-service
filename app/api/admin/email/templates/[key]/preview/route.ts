export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireEmail } from "@/lib/admin-auth";
import {
  renderTemplate,
  exampleContextForAction,
} from "@/lib/email/render";
import { actionByKey } from "@/lib/email/templates-catalog";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

interface Ctx {
  params: Promise<{ key: string }>;
}

interface PreviewPayload {
  draftSubject?: string;
  draftBody?: string;
  layoutId?: string | null;
  customContext?: Record<string, unknown>;
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireEmail(session);
    const { key } = await params;
    const action = actionByKey(key);
    if (!action) throw ApiError.notFound("Unknown action key");
    const body = (await req.json().catch(() => ({}))) as PreviewPayload;
    const exampleCtx = exampleContextForAction(key);
    const ctx = { ...exampleCtx, ...(body.customContext ?? {}) };
    const result = await renderTemplate(key, {
      draftSubject: body.draftSubject,
      draftBody: body.draftBody,
      layoutId: body.layoutId,
      context: ctx,
    });
    if (!result) throw ApiError.notFound("Render failed");
    return createSuccessResponse(result);
  } catch (error) {
    return handleApiError(error);
  }
}
