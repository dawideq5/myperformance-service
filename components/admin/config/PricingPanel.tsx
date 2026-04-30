"use client";

import Link from "next/link";
import { ExternalLink, FileSignature, Tags } from "lucide-react";
import { Card } from "@/components/ui";

/**
 * Cennik usług — tylko CTA do edytora cennika, typów napraw i raw Directus.
 * Edycja właściwa żyje pod /admin/pricelist; tu jest jedynie wyjaśnienie po
 * polsku. Sekcja certyfikatów (`CertsSummary`) jest osobnym eksportem dla
 * dedykowanego taba.
 */
export function PricingPanel() {
  return (
    <Card className="p-6">
      <div className="flex items-start gap-4">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: "rgba(34, 197, 94, 0.18)",
            color: "#22c55e",
          }}
        >
          <Tags className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h3
            className="text-lg font-semibold mb-1"
            style={{ color: "var(--text-main)" }}
          >
            Cennik usług serwisowych
          </h3>
          <p
            className="text-sm mb-4"
            style={{ color: "var(--text-muted)" }}
          >
            Zarządzaj pozycjami cennika z targetowaniem marka/model. Cena
            czyszczenia (CLEANING_INTAKE), ekspertyzy (EXPERTISE) i wszystkie
            inne usługi widoczne w panelu sprzedawcy.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/pricelist"
              className="px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 transition-all hover:scale-[1.02]"
              style={{
                background: "linear-gradient(135deg, #22C55E, #16A34A)",
                color: "#fff",
              }}
            >
              <ExternalLink className="w-4 h-4" />
              Otwórz edytor cennika
            </Link>
            <Link
              href="/admin/repair-types"
              className="px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2 transition-all hover:scale-[1.02]"
              style={{
                background: "linear-gradient(135deg, #3b82f6, #6366f1)",
                color: "#fff",
              }}
            >
              <ExternalLink className="w-4 h-4" />
              Typy napraw — reguły łączenia
            </Link>
            <a
              href="https://cms.myperformance.pl/admin/content/mp_pricelist"
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded-xl text-sm font-semibold border inline-flex items-center gap-2 transition-all hover:bg-[var(--bg-surface)]"
              style={{
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
            >
              <ExternalLink className="w-4 h-4" />
              Directus (raw)
            </a>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function CertsSummary() {
  return (
    <Card padding="lg">
      <div className="text-center py-6 space-y-3">
        <FileSignature className="w-12 h-12 text-[var(--accent)] mx-auto opacity-60" />
        <h3 className="text-base font-semibold">
          Pełna konsola certyfikatów
        </h3>
        <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto">
          Wystawianie, unieważnianie, audit-trail, device binding, root CA —
          dedykowana strona z pełnymi narzędziami.
        </p>
        <Link
          href="/admin/certificates"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-white font-medium hover:opacity-90 transition"
        >
          Otwórz konsolę certyfikatów
          <ExternalLink className="w-4 h-4" />
        </Link>
      </div>
    </Card>
  );
}
