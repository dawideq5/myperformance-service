"use client";

import { Truck } from "lucide-react";
import { DriverDispatch } from "./tabs/DriverDispatch";

/**
 * Panel Kierowcy — UI listy zleceń transportowych. TopBar globalny
 * dostarczany jest przez `app/layout.tsx` (UnifiedTopBar). Pozostawiamy
 * tylko sub-header z tytułem sekcji oraz `<main>` z dispatcherem.
 *
 * Props `userLabel` jest pomijany (TopBar wczytuje useSession sam),
 * `userEmail` przekazujemy do DriverDispatch dla kontekstu zleceń.
 */
export function DriverHome({
  userEmail,
}: {
  /** Pozostawiamy w sygnaturze dla zgodności z page.tsx — TopBar bierze z useSession. */
  userLabel?: string;
  userEmail: string;
}) {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--bg-main)" }}
    >
      {/* Sub-header — tytuł sekcji "Zlecenia transportowe" obok ikonki. */}
      <div
        className="border-b"
        style={{
          background: "var(--bg-header)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-12 flex items-center gap-2">
          <Truck
            className="w-4 h-4"
            style={{ color: "var(--accent)" }}
            aria-hidden="true"
          />
          <p
            className="font-semibold text-sm"
            style={{ color: "var(--text-main)" }}
          >
            Zlecenia transportowe
          </p>
        </div>
      </div>

      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 py-6 sm:py-8 animate-fade-in">
        <DriverDispatch userEmail={userEmail} />
      </main>
    </div>
  );
}
