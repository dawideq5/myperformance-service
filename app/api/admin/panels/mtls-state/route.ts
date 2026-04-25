export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { canManageCertificates } from "@/lib/admin-auth";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

const PANELS = [
  {
    role: "sprzedawca",
    label: "Panel Sprzedawcy",
    domain: "panelsprzedawcy.myperformance.pl",
    tlsOption: "mtls-sprzedawca",
  },
  {
    role: "serwisant",
    label: "Panel Serwisanta",
    domain: "panelserwisanta.myperformance.pl",
    tlsOption: "mtls-serwisant",
  },
  {
    role: "kierowca",
    label: "Panel Kierowcy",
    domain: "panelkierowcy.myperformance.pl",
    tlsOption: "mtls-kierowca",
  },
] as const;

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) throw ApiError.unauthorized();
    if (!canManageCertificates(session)) {
      throw ApiError.forbidden("certificates_admin required");
    }
    return createSuccessResponse({ panels: PANELS });
  } catch (error) {
    return handleApiError(error);
  }
}
