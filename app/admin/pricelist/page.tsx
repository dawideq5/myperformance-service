import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/auth";
import { canAccessConfigHub } from "@/lib/admin-auth";
import { listPricelist } from "@/lib/pricelist";
import { PricelistAdminClient } from "./PricelistAdminClient";

export const metadata = { title: "Cennik — Admin" };
export const dynamic = "force-dynamic";

export default async function PricelistAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!canAccessConfigHub(session)) redirect("/forbidden");

  const items = await listPricelist({ enabledOnly: false });

  return (
    <PricelistAdminClient
      initialItems={items}
      userLabel={session.user?.name ?? session.user?.email ?? undefined}
      userEmail={session.user?.email ?? undefined}
    />
  );
}
