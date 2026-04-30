"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Tag } from "lucide-react";

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
 *  - listę usług z cenami (lub "—" gdy brak ceny w cenniku)
 *  - razem (gdy sumowalne)
 *  - komunikat "skontaktuj się z serwisantem" gdy kombinacja niełączalna
 *  - błędy combinable rules
 *
 * Po `onTotal` callback przekazuje ostatnią obliczoną sumę — caller może
 * użyć jej żeby podpowiedzieć w polu kwoty. */
export function QuotePreview({
  brand,
  model,
  repairTypes,
  cleaningSelected,
  cleaningPrice,
  onSuggestedTotal,
}: {
  brand: string;
  model: string;
  repairTypes: string[];
  cleaningSelected?: boolean;
  cleaningPrice?: number | null;
  onSuggestedTotal?: (total: number | null) => void;
}) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);

  // Wirtualnie dodajemy CLEANING gdy zostało wybrane oddzielnie (visual
  // condition), nawet jeśli nie ma kodu w repairTypes — back-compat dla
  // VisualConditionConfigurator który ustawia osobny flag.
  const codes = cleaningSelected && !repairTypes.includes("CLEANING")
    ? [...repairTypes, "CLEANING"]
    : repairTypes;

  useEffect(() => {
    if (codes.length === 0) {
      setQuote(null);
      onSuggestedTotal?.(null);
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
          // Override CLEANING price gdy podana z visualCondition (cennik
          // mp_pricelist może mieć inną kwotę niż obliczona w intake).
          if (cleaningSelected && cleaningPrice != null) {
            const idx = j.lines.findIndex((l) => l.code === "CLEANING");
            if (idx >= 0) {
              j.lines[idx].price = cleaningPrice;
            }
          }
          onSuggestedTotal?.(j.contactServiceman ? null : j.total);
        })
        .catch(() => {
          setQuote(null);
          onSuggestedTotal?.(null);
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codes.join(","), brand, model, cleaningSelected, cleaningPrice]);

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
              {quote.reason && (
                <p className="text-[11px] opacity-80">{quote.reason}</p>
              )}
              <p className="text-[11px] opacity-80">
                W przypadku naprawy łączonej (poza czyszczeniem) wymagana
                indywidualna wycena.
              </p>
            </div>
          </div>
        ) : quote.total != null ? (
          <div
            className="flex items-center justify-between pt-2 mt-1 border-t text-sm"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <span
              className="font-semibold uppercase tracking-wide text-[11px]"
              style={{ color: "var(--text-muted)" }}
            >
              Razem
            </span>
            <span
              className="font-bold"
              style={{ color: "#0EA5E9" }}
            >
              {quote.total.toFixed(2)} PLN
            </span>
          </div>
        ) : (
          <div
            className="text-[11px] flex items-center gap-1.5"
            style={{ color: "var(--text-muted)" }}
          >
            <Check className="w-3 h-3" />
            Po uzupełnieniu cennika cena pojawi się automatycznie.
          </div>
        )}
      </div>
    </div>
  );
}
