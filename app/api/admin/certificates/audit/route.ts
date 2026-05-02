import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { canManageCertificates } from "@/lib/admin-auth";
import { getAuditTail } from "@/lib/step-ca";
import { keycloak } from "@/lib/keycloak";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface KcUserRow {
  email?: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Wzbogaca actor (email) o display name (imię + nazwisko) z KC. Batch
 * lookup unikatowych emaili w jednym przebiegu, potem mapping per event.
 */
async function buildActorNameMap(
  events: Array<{ actor: string }>,
): Promise<Record<string, string>> {
  const uniqueEmails = Array.from(
    new Set(events.map((e) => e.actor).filter((a) => a && a.includes("@"))),
  );
  if (uniqueEmails.length === 0) return {};
  const map: Record<string, string> = {};
  try {
    const adminToken = await keycloak.getServiceAccountToken();
    await Promise.all(
      uniqueEmails.map(async (email) => {
        try {
          const res = await keycloak.adminRequest(
            `/users?email=${encodeURIComponent(email)}&exact=true`,
            adminToken,
          );
          if (!res.ok) return;
          const arr = (await res.json()) as KcUserRow[];
          const u = arr[0];
          if (!u) return;
          const fullName = [u.firstName, u.lastName]
            .filter(Boolean)
            .join(" ")
            .trim();
          if (fullName) map[email] = fullName;
        } catch {
          /* skip */
        }
      }),
    );
  } catch {
    /* admin token unavailable — fallback do emaila */
  }
  return map;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCertificates(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? 100);
  const offsetRaw = Number(url.searchParams.get("offset") ?? 0);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 500 ? Math.floor(limitRaw) : 100;
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.floor(offsetRaw) : 0;

  const all = await getAuditTail(limit + offset);
  const slice = all.slice(offset, offset + limit);
  const actorNames = await buildActorNameMap(slice);
  const enriched = slice.map((e) => ({
    ...e,
    actorName: actorNames[e.actor] ?? null,
  }));
  return NextResponse.json({ events: enriched, limit, offset });
}
