import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/auth";
import { canAccessKeycloakAdmin } from "@/lib/admin-auth";
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

  return (
    <UserDetailClient
      userId={id}
      selfId={session.user.id}
      callerLabel={session.user.name ?? session.user.email ?? ""}
      callerEmail={session.user.email ?? undefined}
    />
  );
}
