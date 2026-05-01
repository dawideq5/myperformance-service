import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/auth";
import { canAccessKeycloakAdmin } from "@/lib/admin-auth";
import { keycloak } from "@/lib/keycloak";
import { UserDetailClient } from "./UserDetailClient";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminUserDetailPage({ params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.error === "RefreshTokenExpired") {
    redirect("/login");
  }
  if (!canAccessKeycloakAdmin(session)) {
    redirect("/forbidden");
  }

  const { id } = await params;

  // Deep-link do KC Admin Console (replacement dla sekcji Sesje + Logi —
  // Keycloak ma to natywnie, nie duplikujemy tych widoków w naszym UI).
  let kcUserUrl: string | null = null;
  try {
    const consoleBase = keycloak.getAdminConsoleUrl();
    const realm = keycloak.getRealm();
    kcUserUrl = `${consoleBase.replace(/\/$/, "")}/#/${encodeURIComponent(realm)}/users/${encodeURIComponent(id)}`;
  } catch {
    kcUserUrl = null;
  }

  return (
    <UserDetailClient
      userId={id}
      selfId={session.user.id}
      callerLabel={session.user.name ?? session.user.email ?? ""}
      callerEmail={session.user.email ?? undefined}
      kcUserUrl={kcUserUrl}
    />
  );
}
