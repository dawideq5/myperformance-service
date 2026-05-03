import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/auth";
import { canAccessInfrastructure } from "@/lib/admin-auth";
import { LivekitAdminClient } from "./LivekitAdminClient";

export const dynamic = "force-dynamic";

/**
 * /admin/livekit (Wave 23)
 *
 * Realm-admin only — oversight active LiveKit consultations. Server-side
 * auth via canAccessInfrastructure (mirror of `/admin/infrastructure` —
 * "infra admin" = "może dotykać LiveKit/sieci/VPS"). Client-side komponent
 * fetcha listę co 5s przez /api/admin/livekit/rooms.
 */
export default async function AdminLiveKitPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.error === "RefreshTokenExpired") {
    redirect("/login");
  }
  if (!canAccessInfrastructure(session)) {
    redirect("/forbidden");
  }
  return (
    <LivekitAdminClient
      userLabel={session.user.name ?? session.user.email ?? ""}
      userEmail={session.user.email ?? undefined}
    />
  );
}
