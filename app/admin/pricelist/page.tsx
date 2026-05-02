import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/auth";
import { canAccessConfigHub } from "@/lib/admin-auth";
import { listPricelist } from "@/lib/pricelist";
import { listRepairTypes } from "@/lib/repair-types";
import { PricelistAdminClient } from "./PricelistAdminClient";

export const metadata = { title: "Cennik — Admin" };
export const dynamic = "force-dynamic";

export default async function PricelistAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!canAccessConfigHub(session)) redirect("/forbidden");

  // Cennik + katalog typów napraw — kategorie cennika dziedziczone z
  // mp_repair_types.category (bez hardcoded enum).
  const [items, repairTypes] = await Promise.all([
    listPricelist({ enabledOnly: false }),
    listRepairTypes(),
  ]);

  return (
    <PricelistAdminClient
      initialItems={items}
      initialRepairTypes={repairTypes}
      userLabel={session.user?.name ?? session.user?.email ?? undefined}
      userEmail={session.user?.email ?? undefined}
    />
  );
}
