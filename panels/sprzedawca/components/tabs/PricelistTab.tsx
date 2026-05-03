"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Loader2,
  Search,
  Smartphone,
  Tags,
} from "lucide-react";

interface PricelistItem {
  id: string;
  code: string;
  name: string;
  category: string;
  price: number;
  description: string | null;
  warrantyMonths: number | null;
  durationMinutes: number | null;
  brand: string | null;
  modelPattern: string | null;
  phoneModelSlug: string | null;
}

interface RepairType {
  code: string;
  label: string;
  category: string;
  sortOrder?: number;
}

type Step = "brand" | "model" | "items";

const UNIVERSAL_BRAND = "__universal__";
const UNIVERSAL_MODEL = "__universal__";

/**
 * Wave 22 / F6 — Cennik 3-step picker.
 *
 * Flow: Marka (krok 1) → Model (krok 2) → Pozycje cennika (krok 3).
 *
 * Dlaczego 3 kroki: w panelu sprzedawcy cennik ma sens dopiero w kontekście
 * konkretnego urządzenia. Wcześniej była to płaska lista z chipsami kategorii,
 * co wymuszało scrollowanie przez setki pozycji niezwiązanych z aktualną
 * sprawą. Teraz user najpierw wybiera markę → potem model → widzi tylko
 * pozycje pasujące do tej kombinacji (plus uniwersalne dla brand=null /
 * modelPattern=null).
 *
 * Filtrowanie reżyseruje się client-side (cennik ma <500 wpisów, jeden fetch
 * wystarczy). Semantyka match ≈ `matchesPricelist` z lib/pricelist.ts:
 *  - `brand=null` pasuje do wszystkich marek
 *  - `modelPattern=null` pasuje do wszystkich modeli wybranej marki
 *  - `modelPattern=<x>` pasuje gdy wybrany modelPattern equals (case-i)
 */
export function PricelistTab() {
  const [items, setItems] = useState<PricelistItem[]>([]);
  const [repairTypes, setRepairTypes] = useState<RepairType[]>([]);
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState<Step>("brand");
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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

  const repairTypeByCode = useMemo(
    () => new Map(repairTypes.map((t) => [t.code, t])),
    [repairTypes],
  );
  const categoryFor = (it: PricelistItem) =>
    repairTypeByCode.get(it.code)?.label ?? it.category ?? "Inne";

  // ── Krok 1: lista marek ──────────────────────────────────────────────
  // Distinct brand z items (non-null) + bucket "Uniwersalne" gdy są wpisy
  // z brand=null. Każdy bucket pokazuje liczbę pozycji.
  const brandsList = useMemo(() => {
    const counts = new Map<string, number>();
    let universalCount = 0;
    for (const it of items) {
      if (!it.brand) {
        universalCount += 1;
        continue;
      }
      counts.set(it.brand, (counts.get(it.brand) ?? 0) + 1);
    }
    const arr: { value: string; label: string; count: number }[] = [];
    for (const [b, c] of [...counts.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], "pl"),
    )) {
      arr.push({ value: b, label: b, count: c });
    }
    if (universalCount > 0) {
      arr.unshift({
        value: UNIVERSAL_BRAND,
        label: "Uniwersalne (każda marka)",
        count: universalCount,
      });
    }
    return arr;
  }, [items]);

  // ── Krok 2: lista modeli dla wybranej marki ──────────────────────────
  // Dla wybranej marki bierzemy items gdzie item.brand match (lub null);
  // robimy distinct po modelPattern. Bucket "Uniwersalne" dla items
  // z modelPattern=null.
  const modelsList = useMemo(() => {
    if (!selectedBrand) return [];
    const matchBrand = (it: PricelistItem) => {
      if (selectedBrand === UNIVERSAL_BRAND) return it.brand === null;
      if (!it.brand) return true; // universal pasuje do każdej wybranej marki
      return it.brand.toLowerCase() === selectedBrand.toLowerCase();
    };
    const counts = new Map<string, number>();
    let universalCount = 0;
    for (const it of items) {
      if (!matchBrand(it)) continue;
      const mp = it.modelPattern?.trim();
      if (!mp) {
        universalCount += 1;
        continue;
      }
      counts.set(mp, (counts.get(mp) ?? 0) + 1);
    }
    const arr: { value: string; label: string; count: number }[] = [];
    for (const [m, c] of [...counts.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], "pl"),
    )) {
      arr.push({ value: m, label: m, count: c });
    }
    if (universalCount > 0) {
      arr.unshift({
        value: UNIVERSAL_MODEL,
        label: "Uniwersalne (każdy model)",
        count: universalCount,
      });
    }
    return arr;
  }, [items, selectedBrand]);

  // ── Krok 3: pozycje cennika dla brand+model ──────────────────────────
  const filteredItems = useMemo(() => {
    if (!selectedBrand || !selectedModel) return [];
    const brandMatches = (it: PricelistItem) => {
      if (selectedBrand === UNIVERSAL_BRAND) return it.brand === null;
      if (!it.brand) return true;
      return it.brand.toLowerCase() === selectedBrand.toLowerCase();
    };
    const modelMatches = (it: PricelistItem) => {
      if (selectedModel === UNIVERSAL_MODEL) return !it.modelPattern;
      if (!it.modelPattern) return true; // universal item pasuje do każdego modelu
      return it.modelPattern.toLowerCase() === selectedModel.toLowerCase();
    };
    const s = search.trim().toLowerCase();
    return items.filter((it) => {
      if (!brandMatches(it)) return false;
      if (!modelMatches(it)) return false;
      if (!s) return true;
      return (
        it.name.toLowerCase().includes(s) ||
        it.code.toLowerCase().includes(s) ||
        (it.description ?? "").toLowerCase().includes(s)
      );
    });
  }, [items, selectedBrand, selectedModel, search]);

  // ── Loading / empty global ───────────────────────────────────────────
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

  // ── Helpers do widoku ───────────────────────────────────────────────
  const brandLabel =
    selectedBrand === UNIVERSAL_BRAND
      ? "Uniwersalne"
      : selectedBrand ?? "";
  const modelLabel =
    selectedModel === UNIVERSAL_MODEL
      ? "Uniwersalne"
      : selectedModel ?? "";

  const goToBrand = () => {
    setStep("brand");
    setSelectedBrand(null);
    setSelectedModel(null);
    setSearch("");
  };
  const goToModel = () => {
    setStep("model");
    setSelectedModel(null);
    setSearch("");
  };

  return (
    <div className="space-y-4">
      {/* Breadcrumbs / progres kroków */}
      <Breadcrumbs
        step={step}
        brandLabel={brandLabel}
        modelLabel={modelLabel}
        onBrand={goToBrand}
        onModel={goToModel}
      />

      {step === "brand" && (
        <StepBrand
          brands={brandsList}
          onPick={(b) => {
            setSelectedBrand(b);
            setStep("model");
          }}
        />
      )}

      {step === "model" && selectedBrand && (
        <StepModel
          brandLabel={brandLabel}
          models={modelsList}
          onBack={goToBrand}
          onPick={(m) => {
            setSelectedModel(m);
            setStep("items");
          }}
        />
      )}

      {step === "items" && selectedBrand && selectedModel && (
        <StepItems
          brandLabel={brandLabel}
          modelLabel={modelLabel}
          items={filteredItems}
          search={search}
          onSearch={setSearch}
          onBack={goToModel}
          categoryFor={categoryFor}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-komponenty
// ─────────────────────────────────────────────────────────────────────

function Breadcrumbs({
  step,
  brandLabel,
  modelLabel,
  onBrand,
  onModel,
}: {
  step: Step;
  brandLabel: string;
  modelLabel: string;
  onBrand: () => void;
  onModel: () => void;
}) {
  return (
    <div
      className="flex items-center gap-1.5 flex-wrap text-xs"
      style={{ color: "var(--text-muted)" }}
    >
      <Crumb
        label="Marka"
        active={step === "brand"}
        clickable={step !== "brand"}
        onClick={onBrand}
      />
      <ChevronRight className="w-3 h-3 opacity-50" />
      <Crumb
        label={brandLabel ? `Model · ${brandLabel}` : "Model"}
        active={step === "model"}
        clickable={step === "items"}
        onClick={onModel}
        muted={step === "brand"}
      />
      <ChevronRight className="w-3 h-3 opacity-50" />
      <Crumb
        label={modelLabel ? `Cennik · ${modelLabel}` : "Cennik"}
        active={step === "items"}
        clickable={false}
        muted={step !== "items"}
      />
    </div>
  );
}

function Crumb({
  label,
  active,
  clickable,
  muted,
  onClick,
}: {
  label: string;
  active: boolean;
  clickable: boolean;
  muted?: boolean;
  onClick?: () => void;
}) {
  const base =
    "px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap";
  if (clickable) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={base}
        style={{
          background: "var(--bg-surface)",
          color: "var(--text-main)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        {label}
      </button>
    );
  }
  return (
    <span
      className={base}
      style={{
        background: active ? "var(--accent)" : "transparent",
        color: active
          ? "#fff"
          : muted
            ? "var(--text-muted)"
            : "var(--text-main)",
        border: active ? "1px solid var(--accent)" : "1px solid transparent",
        opacity: muted ? 0.6 : 1,
      }}
    >
      {label}
    </span>
  );
}

function StepBrand({
  brands,
  onPick,
}: {
  brands: { value: string; label: string; count: number }[];
  onPick: (b: string) => void;
}) {
  if (brands.length === 0) {
    return (
      <EmptyCard
        title="Brak marek w cenniku"
        body="Cennik nie zawiera pozycji z przypisaną marką. Dodaj pozycje w panelu admin (/admin/config)."
      />
    );
  }
  return (
    <div className="space-y-3">
      <SectionHeader
        icon={<Smartphone className="w-4 h-4" />}
        title="Wybierz markę"
        subtitle="Krok 1 z 3 — od czego zaczynamy?"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {brands.map((b) => (
          <button
            key={b.value}
            type="button"
            onClick={() => onPick(b.value)}
            className="text-left p-4 rounded-2xl border transition-all duration-150 hover:scale-[1.01] hover:-translate-y-0.5 flex items-center justify-between gap-3"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-main)",
            }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: "var(--bg-surface)",
                  color: "var(--accent)",
                }}
              >
                <Smartphone className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{b.label}</div>
                <div
                  className="text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {b.count} {pluralize(b.count, "pozycja", "pozycje", "pozycji")}
                </div>
              </div>
            </div>
            <ChevronRight
              className="w-4 h-4 flex-shrink-0"
              style={{ color: "var(--text-muted)" }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function StepModel({
  brandLabel,
  models,
  onBack,
  onPick,
}: {
  brandLabel: string;
  models: { value: string; label: string; count: number }[];
  onBack: () => void;
  onPick: (m: string) => void;
}) {
  if (models.length === 0) {
    return (
      <div className="space-y-3">
        <BackButton onClick={onBack} label="Zmień markę" />
        <EmptyCard
          title={`Brak modeli dla marki ${brandLabel}`}
          body="Cennik nie zawiera pozycji dla wybranej marki."
        />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <BackButton onClick={onBack} label="Zmień markę" />
      <SectionHeader
        icon={<Smartphone className="w-4 h-4" />}
        title={`Wybierz model — ${brandLabel}`}
        subtitle="Krok 2 z 3"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {models.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => onPick(m.value)}
            className="text-left p-4 rounded-2xl border transition-all duration-150 hover:scale-[1.01] hover:-translate-y-0.5 flex items-center justify-between gap-3"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-main)",
            }}
          >
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">{m.label}</div>
              <div
                className="text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                {m.count} {pluralize(m.count, "pozycja", "pozycje", "pozycji")}
              </div>
            </div>
            <ChevronRight
              className="w-4 h-4 flex-shrink-0"
              style={{ color: "var(--text-muted)" }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function StepItems({
  brandLabel,
  modelLabel,
  items,
  search,
  onSearch,
  onBack,
  categoryFor,
}: {
  brandLabel: string;
  modelLabel: string;
  items: PricelistItem[];
  search: string;
  onSearch: (s: string) => void;
  onBack: () => void;
  categoryFor: (it: PricelistItem) => string;
}) {
  // Grupowanie po kategorii (label z repair_types) dla czytelności.
  const grouped = useMemo(() => {
    const m = new Map<string, PricelistItem[]>();
    for (const it of items) {
      const c = categoryFor(it);
      const arr = m.get(c) ?? [];
      arr.push(it);
      m.set(c, arr);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "pl"));
  }, [items, categoryFor]);

  return (
    <div className="space-y-3">
      <BackButton onClick={onBack} label="Zmień model" />
      <SectionHeader
        icon={<Tags className="w-4 h-4" />}
        title={`${brandLabel} · ${modelLabel}`}
        subtitle={`Krok 3 z 3 — ${items.length} ${pluralize(items.length, "pozycja", "pozycje", "pozycji")}`}
      />

      {/* Search */}
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
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Szukaj w cenniku (nazwa, kod, opis)…"
          className="flex-1 bg-transparent outline-none text-sm"
          style={{ color: "var(--text-main)" }}
        />
      </div>

      {items.length === 0 ? (
        <EmptyCard
          title="Brak pozycji"
          body="Dla wybranej kombinacji marka + model nie ma pozycji w cenniku."
        />
      ) : (
        <div className="space-y-3">
          {grouped.map(([category, list]) => (
            <div key={category} className="space-y-2">
              <div className="flex items-center gap-2">
                <span
                  className="text-[11px] uppercase font-semibold tracking-wide"
                  style={{ color: "var(--text-muted)" }}
                >
                  {category}
                </span>
                <span
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{
                    background: "var(--bg-surface)",
                    color: "var(--text-muted)",
                  }}
                >
                  {list.length}
                </span>
              </div>
              <div className="space-y-2">
                {list.map((i) => (
                  <PricelistRow key={i.id} item={i} categoryFor={categoryFor} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PricelistRow({
  item: i,
  categoryFor,
}: {
  item: PricelistItem;
  categoryFor: (it: PricelistItem) => string;
}) {
  return (
    <div
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
          {i.durationMinutes != null && <span>~{i.durationMinutes} min</span>}
        </div>
      </div>
      <div
        className="text-right text-base font-semibold flex-shrink-0"
        style={{ color: "var(--accent)" }}
      >
        {i.price} PLN
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: "var(--bg-surface)", color: "var(--accent)" }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <h2
          className="text-base font-semibold"
          style={{ color: "var(--text-main)" }}
        >
          {title}
        </h2>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {subtitle}
        </p>
      </div>
    </div>
  );
}

function BackButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
      style={{
        background: "var(--bg-surface)",
        color: "var(--text-muted)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <ArrowLeft className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

function EmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="text-center py-12 px-6 rounded-2xl border"
      style={{
        background: "var(--bg-card)",
        borderColor: "var(--border-subtle)",
        color: "var(--text-muted)",
      }}
    >
      <p
        className="text-sm font-medium mb-1"
        style={{ color: "var(--text-main)" }}
      >
        {title}
      </p>
      <p className="text-xs">{body}</p>
    </div>
  );
}

function pluralize(
  n: number,
  one: string,
  few: string,
  many: string,
): string {
  // Polski: 1 → one; 2-4 (kończące, ≠12-14) → few; reszta → many.
  if (n === 1) return one;
  const lastTwo = n % 100;
  const lastOne = n % 10;
  if (lastTwo >= 12 && lastTwo <= 14) return many;
  if (lastOne >= 2 && lastOne <= 4) return few;
  return many;
}
