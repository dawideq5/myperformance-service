import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { Button, Card, PageShell } from "@/components/ui";

export const metadata = { title: "Brak dostępu — MyPerformance" };
export const dynamic = "force-dynamic";

export default function ForbiddenPage() {
  return (
    <PageShell maxWidth="md">
      <Card padding="lg" className="text-center">
        <div className="flex flex-col items-center gap-5 py-10">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center">
            <ShieldOff className="w-8 h-8 text-red-500" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-main)]">
              Brak dostępu!
            </h1>
            <p className="mt-2 text-sm text-[var(--text-muted)] max-w-md mx-auto">
              Nie masz uprawnień, aby zobaczyć tę sekcję. Jeśli uważasz, że to
              błąd — skontaktuj się z administratorem.
            </p>
          </div>
          <Link href="/dashboard">
            <Button>Wróć do dashboardu</Button>
          </Link>
        </div>
      </Card>
    </PageShell>
  );
}
