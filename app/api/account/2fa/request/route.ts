export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/auth";
import { requestCode, TwoFactorEmailError } from "@/lib/security/two-factor";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

interface PostPayload {
  purpose?: string;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.email) {
      throw ApiError.unauthorized();
    }
    const ip = getClientIp(req);
    // Wysyłka kodu OTP idzie mailem — flooding wystarczy żeby zaspamować
    // skrzynkę usera. 5 prób na 5 min per (user, IP) jest wystarczające do
    // legit re-send a blokuje masowy abuse.
    const limit = rateLimit(`2fa:request:${session.user.id}:${ip}`, {
      capacity: 5,
      refillPerSec: 5 / 300,
    });
    if (!limit.allowed) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Zbyt wiele żądań kodu — odczekaj chwilę.",
          },
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
          },
        },
      );
    }
    const body = (await req.json().catch(() => ({}))) as PostPayload;
    const purpose = body.purpose ?? "sensitive_action";
    if (!["login", "sensitive_action", "password_change", "email_change"].includes(purpose)) {
      throw ApiError.badRequest("invalid purpose");
    }
    let result;
    try {
      result = await requestCode({
        userId: session.user.id,
        email: session.user.email,
        purpose,
        srcIp: ip === "unknown" ? undefined : ip,
      });
    } catch (err) {
      if (err instanceof TwoFactorEmailError) {
        // Mapowanie SMTP error → user-friendly response. Klient może wtedy
        // pokazać retry button albo info o problemie z mailbox.
        const userMsg =
          err.code === "smtp_auth"
            ? "Konfiguracja serwera pocztowego jest błędna. Skontaktuj się z administratorem."
            : err.code === "smtp_rejected"
              ? "Twój adres email został odrzucony przez serwer pocztowy. Sprawdź ustawienia konta."
              : "Nie udało się wysłać kodu — serwer pocztowy chwilowo niedostępny. Spróbuj za chwilę.";
        return NextResponse.json(
          { error: { code: "EMAIL_SEND_FAILED", message: userMsg } },
          { status: 503 },
        );
      }
      throw err;
    }
    return createSuccessResponse({
      codeId: result.codeId,
      // Maskujemy email — tylko 2 pierwsze znaki
      email: result.email.replace(/(.{2}).*(@.*)/, "$1***$2"),
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
