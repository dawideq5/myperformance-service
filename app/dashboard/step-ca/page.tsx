import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { redirect } from "next/navigation";
import { canAccessStepCa } from "@/lib/admin-auth";
import { listCertificates } from "@/lib/step-ca";
import { StepCaClient } from "./StepCaClient";

export const metadata = { title: "Step CA — Serwisy" };
export const dynamic = "force-dynamic";

export default async function StepCaPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (!canAccessStepCa(session)) redirect("/forbidden");

  const certs = await listCertificates().catch(() => []);
  const caUrl = process.env.STEP_CA_PUBLIC_URL || "https://ca.myperformance.pl";

  return (
    <StepCaClient
      caUrl={caUrl}
      certs={certs}
      userLabel={session.user.name ?? session.user.email ?? undefined}
      userEmail={session.user.email ?? undefined}
    />
  );
}
