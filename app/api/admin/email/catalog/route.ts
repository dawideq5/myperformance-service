export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireEmail } from "@/lib/admin-auth";
import { EMAIL_CATALOG } from "@/lib/email/catalog";
import {
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireEmail(session);
    return createSuccessResponse({ entries: EMAIL_CATALOG });
  } catch (error) {
    return handleApiError(error);
  }
}
