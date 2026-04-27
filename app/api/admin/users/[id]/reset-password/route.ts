export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { keycloak } from "@/lib/keycloak";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";
import { requireAdminPanel } from "@/lib/admin-auth";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

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

    // Rate-limit: skompromitowane admin konto mogłoby spamować user mailbox
    // password-reset emailami. 20/5min per admin, ale 5/5min per target user.
    const adminId = session.user?.id ?? session.user?.email ?? "unknown";
    const ip = getClientIp(req);
    for (const [key, capacity] of [
      [`admin:reset-pwd:by:${adminId}:${ip}`, 20],
      [`admin:reset-pwd:to:${id}`, 5],
    ] as const) {
      const r = rateLimit(key, {
        capacity,
        refillPerSec: capacity / 300,
      });
      if (!r.allowed) {
        return NextResponse.json(
          {
            error: {
              code: "RATE_LIMITED",
              message: "Zbyt wiele resetów hasła — odczekaj chwilę.",
            },
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(Math.ceil(r.retryAfterMs / 1000)),
            },
          },
        );
      }
    }

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
    // Sanity check: nie pusta. Pełna walidacja (długość, complexity) jest
    // delegowana do Keycloak realm passwordPolicy — admin zarządza tą
    // policy w KC Admin Console, nie tutaj. Jeśli KC odrzuci, zwracamy
    // KC error message do klienta poniżej.
    if (!password) {
      throw ApiError.badRequest(
        "Hasło jest wymagane gdy sendEmail=false",
      );
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
      // KC może odrzucić z passwordPolicy violation — przekazujemy KC
      // error message do klienta (helpful gdy admin ustawia policy w UI).
      // KC Admin API zwraca {"errorMessage":"..."} z konkretną informacją
      // (np. "invalidPasswordMinLengthMessage").
      const details = await res.text().catch(() => "");
      let userMessage = "Nie udało się zresetować hasła";
      try {
        const parsed = JSON.parse(details) as { errorMessage?: string };
        if (parsed.errorMessage) {
          userMessage = `Keycloak: ${parsed.errorMessage}`;
        }
      } catch {
        /* nie JSON, zostaje generic msg */
      }
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        userMessage,
        res.status,
        details.slice(0, 300),
      );
    }

    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
