export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireEmail } from "@/lib/admin-auth";
import { getBranding } from "@/lib/email/db";
import { propagateBranding } from "@/lib/email/branding";
import {
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

interface PropagatePayload {
  applyRedeploy?: boolean;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireEmail(session);
    const body = (await req.json().catch(() => ({}))) as PropagatePayload;
    const branding = await getBranding();
    const results = await propagateBranding(branding, {
      applyRedeploy: body.applyRedeploy === true,
    });
    return createSuccessResponse({ results });
  } catch (error) {
    return handleApiError(error);
  }
}
