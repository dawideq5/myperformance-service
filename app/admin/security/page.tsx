import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * /admin/security został zmergowany z /admin/infrastructure (2026-04-26).
 * Bezpieczeństwo + SIEM to teraz sub-taby w "Infrastruktura serwera".
 */
export default function SecurityPage() {
  redirect("/admin/infrastructure");
}
