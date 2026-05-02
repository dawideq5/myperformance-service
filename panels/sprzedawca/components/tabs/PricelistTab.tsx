"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";

interface PricelistItem {
  id: string;
  code: string;
  name: string;
  category: string;
  price: number;
  description: string | null;
  warrantyMonths: number | null;
  durationMinutes: number | null;
}

interface RepairType {
  code: string;
  category: string;
}

export function PricelistTab() {
  const [items, setItems] = useState<PricelistItem[]>([]);
  const [repairTypes, setRepairTypes] = useState<RepairType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("");

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [pricelistRes, typesRes] = await Promise.all([
          fetch("/api/relay/pricelist"),
          fetch("/api/relay/repair-types"),
        ]);
        const pricelistJson = await pricelistRes.json();
        const typesJson = await typesRes.json();
        setItems(pricelistJson.items ?? []);
        setRepairTypes(typesJson.types ?? []);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Mapowanie code → category z mp_repair_types. Pricelist item dziedziczy
  // kategorię z powiązanego repair_type po code (fallback na item.category).
  const repairTypeByCode = useMemo(
    () => new Map(repairTypes.map((t) => [t.code, t])),
    [repairTypes],
  );
  const categoryFor = (it: PricelistItem) =>
    repairTypeByCode.get(it.code)?.category ?? it.category ?? "Inne";

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) set.add(categoryFor(i));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pl"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, repairTypeByCode]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items.filter((i) => {
      if (category && categoryFor(i) !== category) return false;
      if (!s) return true;
      return (
        i.name.toLowerCase().includes(s) ||
        i.code.toLowerCase().includes(s) ||
        (i.description ?? "").toLowerCase().includes(s)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, search, category, repairTypeByCode]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2
          className="w-6 h-6 animate-spin"
          style={{ color: "var(--text-muted)" }}
        />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className="text-center py-12 rounded-2xl border"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-muted)",
        }}
      >
        <p className="text-sm">
          Cennik jest pusty. Dodaj pozycje w panelu admin (/admin/config).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg border"
        style={{
          background: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <Search className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Szukaj usługi…"
          className="flex-1 bg-transparent outline-none text-sm"
          style={{ color: "var(--text-main)" }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <CategoryChip
          active={category === ""}
          onClick={() => setCategory("")}
        >
          Wszystkie
        </CategoryChip>
        {categories.map((c) => (
          <CategoryChip
            key={c}
            active={category === c}
            onClick={() => setCategory(c)}
          >
            {c}
          </CategoryChip>
        ))}
      </div>
      <div className="space-y-2">
        {filtered.map((i) => (
          <div
            key={i.id}
            className="p-3 rounded-xl border flex items-start justify-between gap-3"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className="text-sm font-medium">{i.name}</span>
                <span
                  className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded"
                  style={{
                    background: "var(--bg-surface)",
                    color: "var(--text-muted)",
                  }}
                >
                  {i.code}
                </span>
              </div>
              {i.description && (
                <p
                  className="text-xs mt-0.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  {i.description}
                </p>
              )}
              <div
                className="text-xs mt-1 flex flex-wrap gap-3"
                style={{ color: "var(--text-muted)" }}
              >
                <span>{categoryFor(i)}</span>
                {i.warrantyMonths != null && (
                  <span>gwarancja {i.warrantyMonths} mies.</span>
                )}
                {i.durationMinutes != null && (
                  <span>~{i.durationMinutes} min</span>
                )}
              </div>
            </div>
            <div
              className="text-right text-base font-semibold flex-shrink-0"
              style={{ color: "var(--accent)" }}
            >
              {i.price} PLN
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
      style={{
        background: active ? "var(--accent)" : "var(--bg-surface)",
        color: active ? "#fff" : "var(--text-muted)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      {children}
    </button>
  );
}
