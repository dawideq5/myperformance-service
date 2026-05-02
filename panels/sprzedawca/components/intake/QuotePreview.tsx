"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowDownToLine, Tag } from "lucide-react";

interface QuoteLine {
  code: string;
  label: string;
  price: number | null;
  warrantyMonths: number | null;
}

export interface Quote {
  lines: QuoteLine[];
  total: number | null;
  contactServiceman: boolean;
  reason: string | null;
  combinationErrors: string[];
}

/** Pokazuje wycenę dla wybranych typów napraw. Fetchuje /api/relay/quote
 * z debounce na zmianach. Renderuje:
 *  - listę usług z cenami z mp_pricelist (lub "—" gdy brak ceny)
 *  - razem (gdy sumowalne)
 *  - komunikat "skontaktuj się z serwisantem" gdy kombinacja niełączalna
 *  - błędy combinable rules (np. EXPERTISE + inne) — blokujące
 *
 * Po `onTotal` callback przekazuje ostatnią obliczoną sumę — caller może
 * użyć jej żeby podpowiedzieć w polu kwoty. */
export function QuotePreview({
  brand,
  model,
  repairTypes,
  onSuggestedTotal,
  onApplyTotal,
  onLines,
}: {
  brand: string;
  model: string;
  repairTypes: string[];
  onSuggestedTotal?: (total: number | null) => void;
  /** Wywoływane gdy user klika "Zastosuj wycenę" — przenosi total do
   * pola amountEstimate w EstimateBlock. */
  onApplyTotal?: (total: number) => void;
  /** Wywoływane przy każdej aktualizacji wyceny — przekazuje surowe
   * pozycje (label + price) do callera, który podaje je dalej do
   * SummaryPanel konfiguratora 3D. */
  onLines?: (lines: { code: string; label: string; price: number }[]) => void;
}) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);

  const codes = repairTypes;

  useEffect(() => {
    if (codes.length === 0) {
      setQuote(null);
      onSuggestedTotal?.(null);
      onLines?.([]);
      return;
    }
    const t = setTimeout(() => {
      setLoading(true);
      fetch("/api/relay/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes, brand, model }),
      })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((j: Quote) => {
          setQuote(j);
          onSuggestedTotal?.(j.contactServiceman ? null : j.total);
          onLines?.(
            j.lines
              .filter((l) => l.price != null)
              .map((l) => ({ code: l.code, label: l.label, price: l.price! })),
          );
        })
        .catch(() => {
          setQuote(null);
          onSuggestedTotal?.(null);
          onLines?.([]);
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codes.join(","), brand, model]);

  if (codes.length === 0) return null;

  if (loading && !quote) {
    return (
      <div
        className="rounded-xl border p-3 text-xs animate-pulse"
        style={{
          background: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-muted)",
        }}
      >
        Liczenie wyceny…
      </div>
    );
  }

  if (!quote) return null;

  return (
    <div className="space-y-2">
      {quote.combinationErrors.length > 0 && (
        <div
          className="rounded-xl border-2 p-3 flex items-start gap-2 text-xs"
          style={{
            background: "rgba(239, 68, 68, 0.08)",
            borderColor: "rgba(239, 68, 68, 0.5)",
            color: "#EF4444",
          }}
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            {quote.combinationErrors.map((e, i) => (
              <p key={i}>{e}</p>
            ))}
          </div>
        </div>
      )}

      <div
        className="rounded-xl border p-3 space-y-2"
        style={{
          background: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div
          className="flex items-center gap-1.5 text-[11px] uppercase font-semibold tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          <Tag className="w-3 h-3" />
          Wybrane usługi
        </div>
        <ul className="space-y-1 text-xs">
          {quote.lines.map((line) => (
            <li
              key={line.code}
              className="flex items-center justify-between gap-2"
            >
              <span style={{ color: "var(--text-main)" }}>{line.label}</span>
              <span
                className="font-semibold whitespace-nowrap"
                style={{
                  color:
                    line.price != null ? "var(--text-main)" : "var(--text-muted)",
                }}
              >
                {line.price != null
                  ? `${line.price.toFixed(2)} PLN`
                  : "—"}
              </span>
            </li>
          ))}
        </ul>

        {quote.contactServiceman ? (
          <div
            className="rounded-lg border p-2.5 text-xs flex items-start gap-2"
            style={{
              background: "rgba(245, 158, 11, 0.1)",
              borderColor: "rgba(245, 158, 11, 0.4)",
              color: "#F59E0B",
            }}
          >
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-semibold">
                Skontaktuj się z serwisantem w celu ustalenia kwoty zlecenia.
              </p>
              <p className="text-[11px] opacity-80">
                W przypadku naprawy łączonej wymagana indywidualna wycena.
              </p>
            </div>
          </div>
        ) : quote.total != null ? (
          <div
            className="pt-2 mt-1 border-t space-y-2"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <div className="flex items-center justify-between text-sm">
              <span
                className="font-semibold uppercase tracking-wide text-[11px]"
                style={{ color: "var(--text-muted)" }}
              >
                Razem
              </span>
              <span className="font-bold" style={{ color: "#0EA5E9" }}>
                {quote.total.toFixed(2)} PLN
              </span>
            </div>
            {onApplyTotal && (
              <button
                type="button"
                onClick={() => quote.total != null && onApplyTotal(quote.total)}
                className="w-full px-3 py-2 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-all hover:scale-[1.01]"
                style={{
                  background: "linear-gradient(135deg, #0EA5E9, #0284C7)",
                  color: "#fff",
                }}
              >
                <ArrowDownToLine className="w-3.5 h-3.5" />
                Zastosuj wycenę
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
