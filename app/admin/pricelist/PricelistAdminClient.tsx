"use client";

import { useCallback, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Edit2,
  Filter,
  Plus,
  Search,
  ShieldCheck,
  Tags,
  Trash2,
  XCircle,
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
import Link from "next/link";
import type { PricelistItem, PricelistInput } from "@/lib/pricelist";

const CATEGORIES: { value: string; label: string }[] = [
  { value: "screen", label: "Wyświetlacz" },
  { value: "battery", label: "Bateria" },
  { value: "water_damage", label: "Zalanie" },
  { value: "logic_board", label: "Płyta główna" },
  { value: "port", label: "Port ładowania" },
  { value: "protection", label: "Ochrona / czyszczenie" },
  { value: "diagnostic", label: "Diagnostyka" },
  { value: "other", label: "Inne" },
];

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c.label]),
);

export function PricelistAdminClient({
  initialItems,
  userLabel,
  userEmail,
}: {
  initialItems: PricelistItem[];
  userLabel: string | undefined;
  userEmail: string | undefined;
}) {
  const [items, setItems] = useState<PricelistItem[]>(initialItems);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [brandFilter, setBrandFilter] = useState("");
  const [editing, setEditing] = useState<PricelistItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (categoryFilter && it.category !== categoryFilter) return false;
      if (brandFilter) {
        const b = (it.brand ?? "").toLowerCase();
        if (!b.includes(brandFilter.toLowerCase())) return false;
      }
      if (q) {
        const hay =
          `${it.code} ${it.name} ${it.brand ?? ""} ${it.modelPattern ?? ""} ${it.description ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, categoryFilter, brandFilter]);

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
        backHref="/admin/config"
        userLabel={userLabel}
        userSubLabel={userEmail}
      />
      <div className="mb-3 text-xs flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
        <Link href="/admin" className="hover:underline">Admin</Link>
        <span>/</span>
        <Link href="/admin/config" className="hover:underline">Konfiguracja</Link>
        <span>/</span>
        <span style={{ color: "var(--text-main)" }}>Cennik</span>
      </div>

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
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
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
                <th className="px-3 py-2">Kod</th>
                <th className="px-3 py-2">Nazwa</th>
                <th className="px-3 py-2">Kategoria</th>
                <th className="px-3 py-2">Marka / model</th>
                <th className="px-3 py-2 text-right">Cena</th>
                <th className="px-3 py-2 text-right">
                  <Clock className="w-3 h-3 inline mr-0.5" />
                  min
                </th>
                <th className="px-3 py-2 text-right">Gwar.</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-8 text-center text-sm"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {items.length === 0
                      ? "Brak pozycji w cenniku — dodaj pierwszą."
                      : "Brak pozycji pasujących do filtrów."}
                  </td>
                </tr>
              ) : (
                filtered.map((it) => (
                  <tr
                    key={it.id}
                    className="border-t hover:bg-[var(--bg-surface)]/50"
                    style={{ borderColor: "var(--border-subtle)" }}
                  >
                    <td className="px-3 py-2 font-mono text-xs">{it.code}</td>
                    <td className="px-3 py-2">{it.name}</td>
                    <td className="px-3 py-2 text-xs">
                      {CATEGORY_LABELS[it.category] ?? it.category}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <div>{it.brand || <span className="opacity-50">wszystkie</span>}</div>
                      {it.modelPattern && (
                        <div
                          className="text-[10px] font-mono"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {it.modelPattern}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {it.price.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      {it.durationMinutes ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      {it.warrantyMonths != null ? `${it.warrantyMonths} mc` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {it.enabled ? (
                        <Badge tone="success" className="text-[10px]">
                          aktywna
                        </Badge>
                      ) : (
                        <Badge tone="neutral" className="text-[10px]">
                          ukryta
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setEditing(it)}
                        className="p-1.5 rounded hover:bg-[var(--bg-card)]"
                        style={{ color: "var(--text-muted)" }}
                        aria-label="Edytuj"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(it)}
                        className="p-1.5 rounded hover:bg-red-500/10"
                        style={{ color: "#ef4444" }}
                        aria-label="Usuń"
                        disabled={busy}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {(editing || creating) && (
        <PricelistDialog
          item={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
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
  onClose,
  onSave,
  busy,
}: {
  item: PricelistItem | null;
  onClose: () => void;
  onSave: (input: PricelistInput) => void;
  busy: boolean;
}) {
  const [code, setCode] = useState(item?.code ?? "");
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState(item?.category ?? "screen");
  const [price, setPrice] = useState(item?.price?.toString() ?? "0");
  const [brand, setBrand] = useState(item?.brand ?? "");
  const [modelPattern, setModelPattern] = useState(item?.modelPattern ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [warrantyMonths, setWarrantyMonths] = useState(
    item?.warrantyMonths?.toString() ?? "3",
  );
  const [durationMinutes, setDurationMinutes] = useState(
    item?.durationMinutes?.toString() ?? "",
  );
  const [sort, setSort] = useState(item?.sort?.toString() ?? "0");
  const [enabled, setEnabled] = useState(item?.enabled ?? true);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input: PricelistInput = {
      code: code.trim().toUpperCase(),
      name: name.trim(),
      category,
      price: Number(price),
      brand: brand.trim() || null,
      modelPattern: modelPattern.trim() || null,
      description: description.trim() || null,
      warrantyMonths: warrantyMonths ? Number(warrantyMonths) : null,
      durationMinutes: durationMinutes ? Number(durationMinutes) : null,
      sort: sort ? Number(sort) : 0,
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Kod (A-Z 0-9 _)"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            disabled={!!item}
            required
            placeholder="SCREEN_REPLACE_IPHONE12"
          />
          <Input
            label="Nazwa"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span
              className="block text-xs font-medium mb-1.5"
              style={{ color: "var(--text-muted)" }}
            >
              Kategoria
            </span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border text-sm bg-[var(--bg-surface)] border-[var(--border-subtle)]"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Cena (PLN)"
            type="number"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
        </div>
        <div className="rounded-xl border p-3 bg-[var(--bg-surface)] border-[var(--border-subtle)] space-y-2">
          <p
            className="text-xs uppercase tracking-wide font-semibold"
            style={{ color: "var(--text-muted)" }}
          >
            Targetowanie urządzenia (opcjonalne)
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Puste = pozycja stosowana dla wszystkich. Brand+model_pattern
            zawężają do konkretnych urządzeń.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Marka"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Apple, Samsung, Xiaomi…"
            />
            <Input
              label="Model (substring)"
              value={modelPattern}
              onChange={(e) => setModelPattern(e.target.value)}
              placeholder="iPhone 12, Galaxy S, Redmi…"
            />
          </div>
        </div>
        <Textarea
          label="Opis"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
        <div className="grid grid-cols-3 gap-3">
          <Input
            label="Gwarancja (mc)"
            type="number"
            min="0"
            value={warrantyMonths}
            onChange={(e) => setWarrantyMonths(e.target.value)}
          />
          <Input
            label="Czas (min)"
            type="number"
            min="0"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
          />
          <Input
            label="Sort"
            type="number"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span className="text-sm">Pozycja aktywna (widoczna dla sprzedawców)</span>
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
