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

interface Payload {
  password?: string;
  temporary?: boolean;
  sendEmail?: boolean;
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const { id } = await params;
    if (!id) throw ApiError.badRequest("Missing user id");

    const body = (await req.json().catch(() => null)) as Payload | null;
    const adminToken = await keycloak.getServiceAccountToken();

    if (body?.sendEmail !== false && !body?.password) {
      await keycloak.executeActionsEmail(
        adminToken,
        id,
        ["UPDATE_PASSWORD"],
        { lifespan: 60 * 60 * 24 },
      );
      return createSuccessResponse({ sent: true });
    }

    const password = body?.password?.trim();
    // Walidujemy zsynchronizowane z KC realm passwordPolicy: length(16) +
    // upperCase + lowerCase + digits + specialChars + notUsername. Odbijamy
    // request *przed* trafieniem do KC, daje to lepszy UX (jeden round-trip
    // mniej) i blokuje próbę bypass'owania policy gdyby ktoś wyłączył ją w KC.
    if (!password) {
      throw ApiError.badRequest(
        "Password required when sendEmail=false",
      );
    }
    if (password.length < 16) {
      throw ApiError.badRequest("Hasło musi mieć minimum 16 znaków");
    }
    if (!/[A-Z]/.test(password)) {
      throw ApiError.badRequest("Hasło musi zawierać wielką literę");
    }
    if (!/[a-z]/.test(password)) {
      throw ApiError.badRequest("Hasło musi zawierać małą literę");
    }
    if (!/[0-9]/.test(password)) {
      throw ApiError.badRequest("Hasło musi zawierać cyfrę");
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      throw ApiError.badRequest("Hasło musi zawierać znak specjalny");
    }

    const res = await keycloak.adminRequest(
      `/users/${id}/reset-password`,
      adminToken,
      {
        method: "PUT",
        body: JSON.stringify({
          type: "password",
          value: password,
          temporary: body?.temporary !== false,
        }),
      },
    );

    if (!res.ok) {
      // KC może odrzucić z passwordPolicy violation — zwracamy generic msg
      // żeby nie ujawniać internal KC error details. Pełny detail w logu.
      const details = await res.text().catch(() => "");
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Nie udało się zresetować hasła (KC password policy?)",
        res.status,
        details.slice(0, 200),
      );
    }

    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
