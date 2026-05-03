"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Edit2,
  Filter,
  Plus,
  Search,
  ShieldCheck,
  Tags,
  Trash2,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Dialog,
  Input,
  PageShell,
  Spinner,
  Textarea,
  useToast,
} from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import type { PricelistItem, PricelistInput } from "@/lib/pricelist";
import type { RepairType } from "@/lib/repair-types";

function describeCombinable(rt: RepairType): string {
  if (rt.combinableMode === "no") return "Nie łączy";
  if (rt.combinableMode === "only_with") {
    return rt.combinableWith?.length
      ? `Tylko z: ${rt.combinableWith.join(", ")}`
      : "Tylko z: —";
  }
  if (rt.combinableMode === "except") {
    return rt.combinableWith?.length
      ? `Łącz oprócz: ${rt.combinableWith.join(", ")}`
      : "Łącz z każdym";
  }
  return "Łącz z każdym";
}

function describeSums(rt: RepairType): string {
  if (rt.sumsMode === "no") return "Kontakt z serwisantem";
  if (rt.sumsMode === "only_with") {
    return rt.sumsWith?.length
      ? `Sumuj z: ${rt.sumsWith.join(", ")}`
      : "Sumuj cenę";
  }
  if (rt.sumsMode === "except") {
    return rt.sumsWith?.length
      ? `Sumuj oprócz: ${rt.sumsWith.join(", ")}`
      : "Sumuj cenę";
  }
  return "Sumuj cenę";
}

export function PricelistAdminClient({
  initialItems,
  initialRepairTypes,
  userLabel,
  userEmail,
}: {
  initialItems: PricelistItem[];
  initialRepairTypes: RepairType[];
  userLabel: string | undefined;
  userEmail: string | undefined;
}) {
  const [repairTypes, setRepairTypes] = useState<RepairType[]>(initialRepairTypes);

  // Lista kategorii = lista typów napraw (1:1) — admin wymaga DOKŁADNIE tej
  // listy z mp_repair_types (Ekspertyza, Wymiana wyświetlacza, Wymiana
  // baterii, …). Sortowanie po sort_order z mp_repair_types (już posortowane
  // przez API), fallback na surowy pricelist.category dla pozycji sierot.
  const allCategories = useMemo(() => {
    const ordered: string[] = [];
    const seen = new Set<string>();
    for (const rt of repairTypes) {
      if (!seen.has(rt.label)) {
        ordered.push(rt.label);
        seen.add(rt.label);
      }
    }
    for (const it of initialItems) {
      const fallback = it.category?.trim();
      if (fallback && !seen.has(fallback)) {
        ordered.push(fallback);
        seen.add(fallback);
      }
    }
    return ordered;
  }, [repairTypes, initialItems]);

  // Refresh repair types przy mount (gdyby admin edytował w innej karcie).
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/repair-types");
        if (!res.ok) return;
        const json = await res.json();
        if (Array.isArray(json.types)) setRepairTypes(json.types as RepairType[]);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const [items, setItems] = useState<PricelistItem[]>(initialItems);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [brandFilter, setBrandFilter] = useState("");
  const [editing, setEditing] = useState<PricelistItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [prefillCode, setPrefillCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  // Tabela pokazuje WSZYSTKIE typy napraw (18) z ich properties + cena bazowa
  // jeśli istnieje pricelist entry dla code (bez phone_model). Filter po
  // search + categoryFilter ogranicza widoczne wiersze.
  const visibleRepairTypes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return repairTypes.filter((rt) => {
      if (categoryFilter && rt.label !== categoryFilter) return false;
      if (q) {
        const hay = `${rt.code} ${rt.label} ${rt.description ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (brandFilter) {
        const matching = items.filter(
          (i) => i.code === rt.code && (i.brand ?? "").toLowerCase().includes(brandFilter.toLowerCase()),
        );
        if (matching.length === 0) return false;
      }
      return true;
    });
  }, [repairTypes, items, search, categoryFilter, brandFilter]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/pricelist");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setItems(json.data?.items ?? json.items ?? []);
    } catch (e) {
      toast.error("Błąd odświeżania", e instanceof Error ? e.message : String(e));
    }
  }, [toast]);
  void refresh;


  const stats = useMemo(() => {
    const enabled = items.filter((i) => i.enabled).length;
    const withBrand = items.filter((i) => i.brand).length;
    const withModel = items.filter((i) => i.modelPattern).length;
    return { total: items.length, enabled, withBrand, withModel };
  }, [items]);

  const onDelete = async (item: PricelistItem) => {
    if (!confirm(`Usunąć pozycję "${item.name}" (${item.code})?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/pricelist/${item.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      toast.success("Usunięto", item.code);
    } catch (e) {
      toast.error("Błąd usunięcia", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onSave = async (input: PricelistInput, id?: string) => {
    setBusy(true);
    try {
      const url = id ? `/api/admin/pricelist/${id}` : "/api/admin/pricelist";
      const method = id ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      const item: PricelistItem = json.data?.item ?? json.item;
      setItems((prev) => {
        if (id) {
          return prev.map((i) => (i.id === id ? item : i));
        }
        return [...prev, item];
      });
      toast.success(id ? "Zaktualizowano" : "Dodano", item.code);
      setEditing(null);
      setCreating(false);
    } catch (e) {
      toast.error("Błąd zapisu", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell>
      <AppHeader
        title="Cennik"
        backHref="/dashboard"
        parentHref="/admin/config"
        parentLabel="Konfiguracja"
        userLabel={userLabel}
        userSubLabel={userEmail}
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard icon={<Tags className="w-4 h-4" />} label="Pozycji" value={stats.total} />
        <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="Aktywne" value={stats.enabled} />
        <StatCard icon={<ShieldCheck className="w-4 h-4" />} label="Z marką" value={stats.withBrand} />
        <StatCard icon={<Filter className="w-4 h-4" />} label="Z modelem" value={stats.withModel} />
      </div>

      <Card className="p-4 mb-4 flex flex-wrap gap-2 items-center">
        <div className="flex-1 min-w-[220px] relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
            style={{ color: "var(--text-muted)" }}
          />
          <Input
            placeholder="Szukaj kod / nazwa / marka / model"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border bg-[var(--bg-surface)] text-sm border-[var(--border-subtle)]"
        >
          <option value="">Wszystkie kategorie</option>
          {allCategories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <Input
          placeholder="Marka filter"
          value={brandFilter}
          onChange={(e) => setBrandFilter(e.target.value)}
          className="w-40"
        />
        <Button onClick={() => setCreating(true)} variant="primary">
          <Plus className="w-4 h-4 mr-1" />
          Dodaj pozycję
        </Button>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="text-left text-[10px] uppercase tracking-wider"
                style={{ background: "var(--bg-surface)", color: "var(--text-muted)" }}
              >
                <th className="px-3 py-2">Typ naprawy</th>
                <th className="px-3 py-2">Łączenie</th>
                <th className="px-3 py-2">Suma</th>
                <th className="px-3 py-2 text-right">Cena bazowa</th>
                <th className="px-3 py-2 text-right">Per-model</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {visibleRepairTypes.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-sm"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Brak typów napraw pasujących do filtrów.
                  </td>
                </tr>
              ) : (
                visibleRepairTypes.map((rt) => {
                  const itemsForType = items.filter((i) => i.code === rt.code);
                  const baseItem = itemsForType.find(
                    (i) => !i.phoneModelSlug && !i.brand,
                  );
                  const perModelCount = itemsForType.length - (baseItem ? 1 : 0);
                  const combinable = describeCombinable(rt);
                  const sums = describeSums(rt);
                  return (
                    <tr
                      key={rt.code}
                      className="border-t hover:bg-[var(--bg-surface)]/50"
                      style={{ borderColor: "var(--border-subtle)" }}
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium">{rt.label}</div>
                        <div
                          className="text-[10px] font-mono"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {rt.code}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs">{combinable}</td>
                      <td className="px-3 py-2 text-xs">{sums}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {baseItem ? (
                          baseItem.price.toFixed(2)
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-xs">
                        {perModelCount > 0 ? (
                          <Badge tone="neutral" className="text-[10px]">
                            {perModelCount}
                          </Badge>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {baseItem ? (
                          <button
                            type="button"
                            onClick={() => setEditing(baseItem)}
                            className="p-1.5 rounded hover:bg-[var(--bg-card)]"
                            style={{ color: "var(--text-muted)" }}
                            aria-label="Edytuj cenę bazową"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setPrefillCode(rt.code);
                              setCreating(true);
                            }}
                            className="px-2 py-1 rounded text-[10px] uppercase tracking-wide bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20"
                          >
                            <Plus className="w-3 h-3 inline mr-0.5" />
                            Cena
                          </button>
                        )}
                        {baseItem && (
                          <button
                            type="button"
                            onClick={() => onDelete(baseItem)}
                            className="p-1.5 rounded hover:bg-red-500/10"
                            style={{ color: "#ef4444" }}
                            aria-label="Usuń cenę bazową"
                            disabled={busy}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {(editing || creating) && (
        <PricelistDialog
          item={editing}
          repairTypes={repairTypes}
          prefillCode={prefillCode}
          onClose={() => {
            setEditing(null);
            setCreating(false);
            setPrefillCode(null);
          }}
          onSave={(input) => onSave(input, editing?.id)}
          busy={busy}
        />
      )}
    </PageShell>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 mb-1" style={{ color: "var(--text-muted)" }}>
        {icon}
        <span className="text-xs uppercase tracking-wide font-semibold">{label}</span>
      </div>
      <p className="text-2xl font-bold" style={{ color: "var(--text-main)" }}>
        {value}
      </p>
    </Card>
  );
}

function PricelistDialog({
  item,
  repairTypes,
  prefillCode,
  onClose,
  onSave,
  busy,
}: {
  item: PricelistItem | null;
  repairTypes: RepairType[];
  prefillCode: string | null;
  onClose: () => void;
  onSave: (input: PricelistInput) => void;
  busy: boolean;
}) {
  const repairTypeByCode = useMemo(
    () => new Map(repairTypes.map((t) => [t.code, t])),
    [repairTypes],
  );
  // Wybór typu naprawy steruje code + name + category; nie ma osobnego pola
  // code / name / category w UI — wszystko dziedziczone z repair_type.
  const [repairTypeCode, setRepairTypeCode] = useState(
    item?.repairTypeCode ?? item?.code ?? prefillCode ?? "",
  );
  const [price, setPrice] = useState(item?.price?.toString() ?? "0");
  const [brand, setBrand] = useState((item?.brand ?? "").toUpperCase());
  const [modelPattern, setModelPattern] = useState(
    (item?.modelPattern ?? "").toUpperCase(),
  );
  const [description, setDescription] = useState(item?.description ?? "");
  const [enabled, setEnabled] = useState(item?.enabled ?? true);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedCode = repairTypeCode.trim().toUpperCase();
    const rt = repairTypeByCode.get(normalizedCode);
    const input: PricelistInput = {
      code: normalizedCode,
      // Nazwa = label repair_type (fallback: code), category = category z
      // repair_type (fallback "Inne"). Backend zachowuje te kolumny w DB
      // dla back-compat; UI ich nie wystawia.
      name: rt?.label ?? normalizedCode,
      category: rt?.category ?? "Inne",
      repairTypeCode: normalizedCode,
      price: Number(price),
      brand: brand.trim().toUpperCase() || null,
      modelPattern: modelPattern.trim().toUpperCase() || null,
      description: description.trim() || null,
      // Gwarancja i czas dziedziczone z repair_type — UI ich nie wystawia.
      // Pola opcjonalne w PricelistInput, więc pomijamy (DB nie zostanie
      // nadpisana jeśli edycja).
      enabled,
    };
    onSave(input);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={item ? `Edytuj: ${item.code}` : "Nowa pozycja cennika"}
      size="lg"
    >
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span
            className="block text-xs font-medium mb-1.5"
            style={{ color: "var(--text-muted)" }}
          >
            Typ naprawy
          </span>
          {/* Wybór z listy mp_repair_types — code + nazwa + kategoria
              dziedziczone automatycznie. */}
          <input
            list="repair-type-codes"
            value={repairTypeCode}
            onChange={(e) => setRepairTypeCode(e.target.value.toUpperCase())}
            disabled={!!item}
            required
            placeholder="Wybierz typ naprawy z listy"
            className="w-full px-3 py-2 rounded-xl border text-sm bg-[var(--bg-surface)] border-[var(--border-subtle)] uppercase font-mono"
          />
          <datalist id="repair-type-codes">
            {repairTypes.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </datalist>
          <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
            Wybierz z listy mp_repair_types — gwarancja, czas i kategoria dziedziczone automatycznie.
          </p>
        </label>
        <div className="rounded-xl border p-3 bg-[var(--bg-surface)] border-[var(--border-subtle)] space-y-2">
          <p
            className="text-xs uppercase tracking-wide font-semibold"
            style={{ color: "var(--text-muted)" }}
          >
            Targetowanie urządzenia (opcjonalne)
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Puste = cena bazowa (wszystkie modele). Marka+model zawężają do
            konkretnych urządzeń (np. APPLE + IPHONE 13 PRO MAX). Wpisuj
            DUŻYMI LITERAMI — pełną oficjalną nazwę modelu.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Marka"
              value={brand}
              onChange={(e) => setBrand(e.target.value.toUpperCase())}
              placeholder="APPLE, SAMSUNG, XIAOMI…"
            />
            <Input
              label="Model (pełna nazwa)"
              value={modelPattern}
              onChange={(e) => setModelPattern(e.target.value.toUpperCase())}
              placeholder="IPHONE 13 PRO MAX, GALAXY S24 ULTRA…"
            />
          </div>
        </div>
        <Input
          label="Cena (PLN)"
          type="number"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
        />
        <Textarea
          label="Opis (np. tylko zamiennik)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Gwarancja, czas i reguły łączenia są zarządzane w
          <a
            href="/admin/repair-types"
            className="ml-1 underline"
            style={{ color: "#3b82f6" }}
          >
            Typach napraw
          </a>
          .
        </p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span className="text-sm">Pozycja aktywna</span>
        </label>
        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Anuluj
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? <Spinner className="w-4 h-4" /> : item ? "Zapisz" : "Utwórz"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
