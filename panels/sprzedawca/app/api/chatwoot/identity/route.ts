import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import crypto from "node:crypto";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Wave22 / F14 — Chatwoot identity validation endpoint.
 *
 * Chatwoot Website SDK obsługuje "Identity validation" (HMAC-SHA256).
 * Dzięki temu Chatwoot widget wie, że przekazywany identifier (email)
 * faktycznie należy do zalogowanego usera — bez tego ktoś mógłby z
 * konsoli wywołać `$chatwoot.setUser('cudzy@email', ...)` i podszyć się
 * pod innego kontaktu.
 *
 * Hash liczymy serwerowo, sekret nigdy nie ląduje w bundlu klienta.
 * Sekret musi być identyczny z "HMAC token" skonfigurowanym w
 * Chatwoot inbox (Inboxes > Settings > Configuration > Identity validation).
 *
 * Endpoint zwraca 503 gdy `CHATWOOT_USER_HASH_SECRET` nie jest ustawiony
 * — widget i tak działa, tylko bez identity validation. Gdy w Chatwoot
 * inbox jest "Enable identity validation = ON" a my nie wyślemy hash,
 * setUser zostanie odrzucony — to świadomie zostawiamy do operacyjnej
 * konfiguracji.
 */

type IdentityResponse = {
  identifier: string;
  hash: string | null;
  email: string;
  name: string;
};

export async function GET(): Promise<NextResponse<IdentityResponse | { error: string }>> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = session.user.email;
  const name = session.user.name ?? email;
  const identifier = email;

  const secret = process.env.CHATWOOT_USER_HASH_SECRET?.trim() ?? "";
  if (!secret) {
    // Brak secret → zwracamy null hash. Klient użyje setUser bez hash;
    // jeśli inbox wymaga validation, Chatwoot odrzuci wywołanie po
    // stronie SDK. To NIE jest błąd 5xx — to świadoma degradacja.
    return NextResponse.json({
      identifier,
      hash: null,
      email,
      name,
    });
  }

  const hash = crypto
    .createHmac("sha256", secret)
    .update(identifier)
    .digest("hex");

  return NextResponse.json({
    identifier,
    hash,
    email,
    name,
  });
}
