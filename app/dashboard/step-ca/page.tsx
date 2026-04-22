import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { redirect } from "next/navigation";
import { canAccessStepCa } from "@/lib/admin-auth";
import { StepCaClient } from "./StepCaClient";

export const metadata = { title: "Step CA — MyPerformance" };
export const dynamic = "force-dynamic";

async function fetchRootFingerprint(): Promise<string | null> {
  const base = process.env.STEP_CA_URL?.trim();
  if (!base) return null;
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/roots.pem`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const pem = await res.text();
    const match = pem.match(/-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/);
    if (!match) return null;
    const der = Buffer.from(match[1].replace(/\s+/g, ""), "base64");
    const { createHash } = await import("crypto");
    return createHash("sha256").update(der).digest("hex");
  } catch {
    return null;
  }
}

export default async function StepCaPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  if (!canAccessStepCa(session)) redirect("/forbidden");

  const fingerprint = await fetchRootFingerprint();
  const caUrl = process.env.STEP_CA_PUBLIC_URL || "https://ca.myperformance.pl";

  return (
    <StepCaClient
      caUrl={caUrl}
      rootFingerprint={fingerprint}
      userLabel={session.user.name ?? session.user.email ?? undefined}
      userEmail={session.user.email ?? undefined}
    />
  );
}
