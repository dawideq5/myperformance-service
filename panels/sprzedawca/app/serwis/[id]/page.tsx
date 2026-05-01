import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ServiceDetailView } from "@/components/serwis/ServiceDetailView";

export default async function ServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ action?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const devBypass =
    process.env.NODE_ENV === "development" &&
    process.env.DEV_CERT_BYPASS === "true";
  const roles = (session.user as { roles?: string[] } | undefined)?.roles ?? [];
  const hasRole = roles.includes("sprzedawca") || roles.includes("admin");
  if (!devBypass && !hasRole) redirect("/forbidden");

  const { id } = await params;
  const sp = await searchParams;

  return <ServiceDetailView serviceId={id} initialAction={sp.action ?? null} />;
}
