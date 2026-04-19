export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";
import { requireAdminPanel } from "@/lib/admin-auth";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const { id } = await params;
    if (!id) throw ApiError.badRequest("Missing user id");

    const adminToken = await keycloak.getServiceAccountToken();

    const [userRes, fedRes] = await Promise.all([
      keycloak.adminRequest(`/users/${id}`, adminToken),
      keycloak.adminRequest(`/users/${id}/federated-identity`, adminToken),
    ]);

    if (!userRes.ok) {
      const details = await userRes.text();
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Failed to load user",
        userRes.status,
        details,
      );
    }

    const userData = await userRes.json();
    const attrs = userData.attributes ?? {};
    const federatedList = fedRes.ok ? await fedRes.json() : [];

    const googleFederation = Array.isArray(federatedList)
      ? federatedList.find(
          (f: { identityProvider?: string }) =>
            f.identityProvider === "google",
        )
      : null;

    const kadromierzApiKey = Array.isArray(attrs.kadromierz_api_key)
      ? attrs.kadromierz_api_key[0]
      : null;

    return createSuccessResponse({
      google: {
        connected: !!googleFederation,
        userId: googleFederation?.userId ?? null,
        username: googleFederation?.userName ?? null,
      },
      kadromierz: {
        connected: !!kadromierzApiKey,
        companyId: Array.isArray(attrs.kadromierz_company_id)
          ? attrs.kadromierz_company_id[0]
          : null,
        employeeId: Array.isArray(attrs.kadromierz_employee_id)
          ? attrs.kadromierz_employee_id[0]
          : null,
        connectedAt: Array.isArray(attrs.kadromierz_connected_at)
          ? attrs.kadromierz_connected_at[0]
          : null,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

interface UnlinkPayload {
  provider: "google" | "kadromierz";
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const { id } = await params;
    if (!id) throw ApiError.badRequest("Missing user id");

    const url = new URL(req.url);
    const provider = url.searchParams.get("provider") as
      | UnlinkPayload["provider"]
      | null;
    if (provider !== "google" && provider !== "kadromierz") {
      throw ApiError.badRequest("Invalid provider");
    }

    const adminToken = await keycloak.getServiceAccountToken();

    if (provider === "google") {
      await keycloak.removeFederatedIdentity(adminToken, id, "google");
      await keycloak.updateUserAttributes(adminToken, id, {
        google_features_requested: [],
      });
    } else {
      await keycloak.updateUserAttributes(adminToken, id, {
        kadromierz_api_key: [],
        kadromierz_company_id: [],
        kadromierz_employee_id: [],
        kadromierz_connected_at: [],
      });
    }

    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
