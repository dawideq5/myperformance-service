"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Tag } from "lucide-react";

interface PricelistItem {
  id: string;
  code: string;
  name: string;
  category: string;
  price: number;
  description: string | null;
  warrantyMonths: number | null;
  durationMinutes: number | null;
  enabled: boolean;
  brand: string | null;
  modelPattern: string | null;
}

/** Mapowanie kategorii cennika ←→ kody typów napraw z DescriptionPicker.
 * Pomaga sugerować pricelist items na podstawie wybranych przez sprzedawcę
 * typów napraw. */
/** Mapowanie repair type values (z DescriptionPicker) → kategorie cennika.
 * Pozwala filtrować pricelist po wybranych typach napraw. */
const REPAIR_TYPE_TO_CATEGORY: Record<string, string[]> = {
  ekspertyza: ["diagnostic"],
  wymiana_wyswietlacza: ["screen"],
  wymiana_baterii: ["battery"],
  wymiana_gniazda_ladowania: ["port"],
  wymiana_panelu_tylnego: ["screen"],
  wymiana_glosnika_rozmow: ["other"],
  wymiana_glosnika_multimedialnego: ["other"],
  wymiana_szkla_aparatu: ["screen"],
  wymiana_korpusu: ["other"],
  wymiana_mikrofonu: ["other"],
  wymiana_tacki_sim: ["other"],
  odzysk_danych: ["other"],
  usterka_oprogramowania: ["other"],
  nieznany_wzor_kod_blokady: ["other"],
  frp_usuniecie_blokady_google: ["other"],
};

function matchesDevice(
  item: PricelistItem,
  brand: string,
  model: string,
): boolean {
  if (!item.enabled) return false;
  if (item.brand) {
    if (item.brand.toLowerCase() !== brand.toLowerCase().trim()) return false;
  }
  if (item.modelPattern) {
    if (!model.toLowerCase().trim().includes(item.modelPattern.toLowerCase()))
      return false;
  }
  return true;
}

export function PriceSuggestions({
  brand,
  model,
  repairTypes,
  onApply,
}: {
  brand: string;
  model: string;
  repairTypes: string[];
  onApply: (totalPrice: number) => void;
}) {
  const [items, setItems] = useState<PricelistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!brand && !model) return;
    setLoading(true);
    fetch("/api/relay/pricelist")
      .then((r) => r.json())
      .then((j) => setItems(j.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [brand, model]);

  // Filtruj items: matching device + (jeśli wybrane repair types — match
  // category, w przeciwnym razie pokaż wszystkie matching device).
  const matching = useMemo(() => {
    if (items.length === 0) return [];
    const wantedCategories = new Set<string>();
    for (const rt of repairTypes) {
      const cats = REPAIR_TYPE_TO_CATEGORY[rt] ?? [];
      cats.forEach((c) => wantedCategories.add(c));
    }
    return items
      .filter((it) => matchesDevice(it, brand, model))
      .filter((it) => {
        if (wantedCategories.size === 0) return true;
        return wantedCategories.has(it.category);
      })
      .sort((a, b) => {
        // Specyficzne (z brand+model) na górze
        const aSpec = (a.brand ? 2 : 0) + (a.modelPattern ? 1 : 0);
        const bSpec = (b.brand ? 2 : 0) + (b.modelPattern ? 1 : 0);
        if (aSpec !== bSpec) return bSpec - aSpec;
        return a.price - b.price;
      });
  }, [items, brand, model, repairTypes]);

  const total = useMemo(() => {
    return matching
      .filter((it) => selected.has(it.id))
      .reduce((sum, it) => sum + it.price, 0);
  }, [matching, selected]);

  if (loading) {
    return (
      <div
        className="rounded-xl border p-3 text-xs animate-pulse"
        style={{
          background: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-muted)",
        }}
      >
        Ładowanie sugestii cen…
      </div>
    );
  }

  if (matching.length === 0) {
    if (!brand && !model) return null;
    return null;
  }

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div
      className="rounded-xl border p-3 space-y-2"
      style={{
        background:
          "linear-gradient(135deg, rgba(34, 197, 94, 0.06), rgba(34, 197, 94, 0.02))",
        borderColor: "rgba(34, 197, 94, 0.3)",
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Tag className="w-3.5 h-3.5" style={{ color: "#22C55E" }} />
          <p
            className="text-xs uppercase tracking-wide font-semibold"
            style={{ color: "#22C55E" }}
          >
            Sugestie cen z cennika ({matching.length})
          </p>
        </div>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={() => {
              onApply(total);
              setSelected(new Set());
            }}
            className="text-xs font-semibold px-2.5 py-1 rounded-lg shadow-sm transition-all hover:scale-[1.02]"
            style={{
              background: "linear-gradient(135deg, #22C55E, #16A34A)",
              color: "#fff",
            }}
          >
            Zastosuj sumę: {total.toFixed(2)} PLN
          </button>
        )}
      </div>
      <div className="space-y-1.5">
        {matching.map((it) => {
          const isSelected = selected.has(it.id);
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => toggle(it.id)}
              className="w-full text-left flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all hover:scale-[1.005]"
              style={{
                background: isSelected
                  ? "rgba(34, 197, 94, 0.15)"
                  : "var(--bg-surface)",
                borderColor: isSelected
                  ? "rgba(34, 197, 94, 0.5)"
                  : "var(--border-subtle)",
              }}
            >
              <div
                className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                style={{
                  borderColor: isSelected ? "#22C55E" : "var(--text-muted)",
                  background: isSelected ? "#22C55E" : "transparent",
                }}
              >
                {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className="text-xs font-semibold truncate"
                  style={{ color: "var(--text-main)" }}
                >
                  {it.name}
                </p>
                <p
                  className="text-[10px] truncate"
                  style={{ color: "var(--text-muted)" }}
                >
                  {it.code}
                  {it.brand && ` · ${it.brand}`}
                  {it.modelPattern && ` · ${it.modelPattern}`}
                  {it.warrantyMonths && ` · ${it.warrantyMonths}mc gwarancji`}
                </p>
              </div>
              <span
                className="font-mono font-semibold text-sm flex-shrink-0"
                style={{ color: isSelected ? "#22C55E" : "var(--text-main)" }}
              >
                {it.price.toFixed(2)} PLN
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
