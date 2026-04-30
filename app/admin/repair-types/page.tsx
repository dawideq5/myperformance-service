import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/auth";
import { canAccessConfigHub } from "@/lib/admin-auth";
import { listRepairTypes } from "@/lib/repair-types";
import { RepairTypesAdminClient } from "./RepairTypesAdminClient";

export const metadata = { title: "Typy napraw — Admin" };
export const dynamic = "force-dynamic";

export default async function RepairTypesAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!canAccessConfigHub(session)) redirect("/forbidden");

  const types = await listRepairTypes();

  return <RepairTypesAdminClient initialTypes={types} />;
}
