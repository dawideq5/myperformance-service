"use client";

/**
 * ComponentsSection (Wave 20 / Phase 1E).
 *
 * Lista komponentów (części/materiały) użytych w naprawie + kalkulacja marży:
 *   - tabela: nazwa | hurtownia | faktura | netto | ilość | VAT | brutto | plik
 *   - sumaryczne netto/brutto
 *   - marża brutto + % (wycena klienta - koszt komponentów)
 *   - modal Add / Edit / Delete
 *   - upload pliku faktury (jpeg/png/pdf, max 10MB)
 *
 * Real-time SSE: subscribeToService → component_added/updated/deleted.
 * A11y: dialog role + ESC close + focus trap entry + aria-labels.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  AlertCircle,
  Edit3,
  FileText,
  Loader2,
  Paperclip,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { subscribeToService } from "@/lib/sse-client";
import { ClearableInput } from "../ui/ClearableInput";

interface ServiceComponent {
  id: string;
  serviceId: string;
  ticketNumber: string | null;
  name: string;
  supplierName: string | null;
  invoiceNumber: string | null;
  invoiceKind: "faktura" | "paragon" | "wz" | "inny" | null;
  purchaseDate: string | null;
  deliveryDate: string | null;
  costNet: number;
  quantity: number;
  vatRate: number;
  costGross: number;
  marginTargetPct: number | null;
  invoiceFileId: string | null;
  notes: string | null;
  createdByEmail: string | null;
  createdByName: string | null;
  createdAt: string;
  deletedAt: string | null;
}

interface ComponentsTotals {
  totalCostNet: number;
  totalCostGross: number;
  count: number;
}

interface Props {
  serviceId: string;
  /** Aktualna wycena brutto klienta — używana w kalkulacji marży. */
  amountEstimate: number | null;
  /** Pozwala edytować/dodawać/usuwać. Domyślnie true. */
  editable?: boolean;
}

const VAT_OPTIONS = [0, 5, 8, 23] as const;
const INVOICE_KIND_LABEL: Record<string, string> = {
  faktura: "Faktura",
  paragon: "Paragon",
  wz: "WZ",
  inny: "Inny",
};
const ALLOWED_INVOICE_MIME = ["image/jpeg", "image/png", "application/pdf"];
const MAX_INVOICE_BYTES = 10 * 1024 * 1024;

function formatPLN(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)} PLN`;
}

/**
 * Otwiera plik faktury w nowej karcie przez relay (Bearer auth z sesji KC).
 * Pobieramy bytes do blob, robimy ObjectURL i window.open — pozwala na PDF
 * i obrazy w przeglądarce bez wymagania publicznego dostępu do Directusa.
 */
async function openInvoiceFile(
  serviceId: string,
  componentId: string,
): Promise<void> {
  try {
    const res = await fetch(
      `/api/relay/services/${encodeURIComponent(
        serviceId,
      )}/components/${encodeURIComponent(componentId)}/invoice-file`,
    );
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(json?.error ?? `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    // GC: revoke po krótkiej chwili, żeby URL zdążył zostać użyty przez tab.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    alert(
      err instanceof Error
        ? `Nie udało się otworzyć pliku: ${err.message}`
        : "Nie udało się otworzyć pliku",
    );
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

interface ComponentFormDraft {
  name: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceKind: "faktura" | "paragon" | "wz" | "inny";
  purchaseDate: string;
  deliveryDate: string;
  /** Wartość wpisana przez serwisanta — interpretacja zależy od `priceMode`. */
  priceInput: string;
  /** Wave 21 / Faza 1E — toggle netto/brutto. Backend nadal przyjmuje
   * wyłącznie `costNet`; brutto liczymy klientowo i konwertujemy do net
   * przy submit. */
  priceMode: "net" | "gross";
  quantity: string;
  vatRate: 0 | 5 | 8 | 23;
  marginTargetPct: string;
  notes: string;
}

function emptyDraft(): ComponentFormDraft {
  return {
    name: "",
    supplierName: "",
    invoiceNumber: "",
    invoiceKind: "faktura",
    purchaseDate: "",
    deliveryDate: "",
    priceInput: "",
    priceMode: "net",
    quantity: "1",
    vatRate: 23,
    marginTargetPct: "",
    notes: "",
  };
}

function draftFromComponent(c: ServiceComponent): ComponentFormDraft {
  return {
    name: c.name,
    supplierName: c.supplierName ?? "",
    invoiceNumber: c.invoiceNumber ?? "",
    invoiceKind: (c.invoiceKind as ComponentFormDraft["invoiceKind"]) ?? "faktura",
    purchaseDate: c.purchaseDate ?? "",
    deliveryDate: c.deliveryDate ?? "",
    // Edycja istniejącego komponentu: zaczynamy zawsze w trybie netto, bo
    // backend trzyma wyłącznie cost_net. User może przełączyć na brutto i
    // konwersja zostanie obliczona on-the-fly.
    priceInput: String(c.costNet),
    priceMode: "net",
    quantity: String(c.quantity),
    vatRate: (VAT_OPTIONS as readonly number[]).includes(c.vatRate)
      ? (c.vatRate as ComponentFormDraft["vatRate"])
      : 23,
    marginTargetPct:
      c.marginTargetPct != null ? String(c.marginTargetPct) : "",
    notes: c.notes ?? "",
  };
}

export function ComponentsSection({
  serviceId,
  amountEstimate,
  editable = true,
}: Props) {
  const [components, setComponents] = useState<ServiceComponent[]>([]);
  const [totals, setTotals] = useState<ComponentsTotals>({
    totalCostNet: 0,
    totalCostGross: 0,
    count: 0,
  });
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceComponent | null>(null);

  const fetchComponents = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const res = await fetch(
        `/api/relay/services/${encodeURIComponent(serviceId)}/components`,
      );
      const json = (await res.json().catch(() => null)) as {
        components?: ServiceComponent[];
        totals?: ComponentsTotals;
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      setComponents(json?.components ?? []);
      setTotals(
        json?.totals ?? { totalCostNet: 0, totalCostGross: 0, count: 0 },
      );
    } catch (err) {
      setListError(
        err instanceof Error
          ? err.message
          : "Nie udało się pobrać komponentów",
      );
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => {
    void fetchComponents();
  }, [fetchComponents]);

  // Real-time SSE — refetch po component_* events.
  useEffect(() => {
    const unsub = subscribeToService(serviceId, (evt) => {
      if (
        evt.type === "component_added" ||
        evt.type === "component_updated" ||
        evt.type === "component_deleted"
      ) {
        void fetchComponents();
      }
    });
    return unsub;
  }, [serviceId, fetchComponents]);

  const onAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const onEdit = (c: ServiceComponent) => {
    setEditing(c);
    setModalOpen(true);
  };
  const onDelete = async (c: ServiceComponent) => {
    if (
      !confirm(
        `Usunąć komponent "${c.name}"? Ta operacja jest miękka — komponent zniknie z listy.`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(
        `/api/relay/services/${encodeURIComponent(
          serviceId,
        )}/components/${encodeURIComponent(c.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      await fetchComponents();
    } catch (err) {
      setListError(
        err instanceof Error
          ? err.message
          : "Nie udało się usunąć komponentu",
      );
    }
  };

  // Kalkulacja marży — Z (wycena brutto klienta) - Y (koszt komponentów brutto)
  const margin = useMemo(() => {
    const Z = amountEstimate ?? 0;
    const Y = totals.totalCostGross;
    const M = Z - Y;
    const N = Z > 0 ? (M / Z) * 100 : 0;
    let color = "var(--text-muted)";
    if (Z > 0) {
      if (N > 20) color = "#22c55e";
      else if (N >= 5) color = "#f59e0b";
      else color = "#ef4444";
    }
    return { Z, Y, M, N, color };
  }, [amountEstimate, totals.totalCostGross]);

  return (
    <div
      className="p-3 rounded-xl border"
      style={{ borderColor: "var(--border-subtle)" }}
    >
      <div className="flex items-center justify-between mb-2 gap-2">
        <h3
          className="text-[11px] uppercase tracking-wider font-semibold"
          style={{ color: "var(--text-muted)" }}
        >
          Komponenty użyte
        </h3>
        {editable && (
          <button
            type="button"
            onClick={onAdd}
            className="px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5"
            style={{ background: "var(--accent)", color: "#fff" }}
            aria-label="Dodaj komponent"
          >
            <Plus className="w-3.5 h-3.5" />
            Dodaj komponent
          </button>
        )}
      </div>

      {listError && (
        <div
          role="alert"
          className="mb-2 p-2 rounded-lg flex items-start gap-2 text-xs"
          style={{ background: "rgba(239, 68, 68, 0.1)", color: "#fca5a5" }}
        >
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{listError}</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2
            className="w-4 h-4 animate-spin"
            style={{ color: "var(--text-muted)" }}
          />
        </div>
      ) : components.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Brak komponentów do tego zlecenia.
        </p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs min-w-[640px]">
            <thead>
              <tr
                style={{ color: "var(--text-muted)" }}
                className="text-left text-[10px] uppercase tracking-wider"
              >
                <th className="py-1.5 px-1">Nazwa</th>
                <th className="py-1.5 px-1">Hurtownia</th>
                <th className="py-1.5 px-1">Faktura</th>
                <th className="py-1.5 px-1 text-right">Netto</th>
                <th className="py-1.5 px-1 text-right">Ilość</th>
                <th className="py-1.5 px-1 text-right">VAT</th>
                <th className="py-1.5 px-1 text-right">Brutto</th>
                <th className="py-1.5 px-1">Plik</th>
                {editable && <th className="py-1.5 px-1 text-right">Akcje</th>}
              </tr>
            </thead>
            <tbody>
              {components.map((c) => (
                <tr
                  key={c.id}
                  className="border-t"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <td className="py-1.5 px-1 align-top">
                    <div className="font-medium" style={{ color: "var(--text-main)" }}>
                      {c.name}
                    </div>
                    {c.purchaseDate && (
                      <div
                        className="text-[10px] mt-0.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        zakup: {formatDate(c.purchaseDate)}
                        {c.deliveryDate && ` · dost.: ${formatDate(c.deliveryDate)}`}
                      </div>
                    )}
                  </td>
                  <td className="py-1.5 px-1 align-top">
                    {c.supplierName ?? "—"}
                  </td>
                  <td className="py-1.5 px-1 align-top">
                    {c.invoiceNumber ? (
                      <>
                        <div className="font-mono">{c.invoiceNumber}</div>
                        {c.invoiceKind && (
                          <div
                            className="text-[10px]"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {INVOICE_KIND_LABEL[c.invoiceKind] ?? c.invoiceKind}
                          </div>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-1.5 px-1 text-right font-mono align-top">
                    {formatPLN(c.costNet)}
                  </td>
                  <td className="py-1.5 px-1 text-right font-mono align-top">
                    {c.quantity}
                  </td>
                  <td className="py-1.5 px-1 text-right font-mono align-top">
                    {c.vatRate}%
                  </td>
                  <td className="py-1.5 px-1 text-right font-mono align-top">
                    {formatPLN(c.costGross)}
                  </td>
                  <td className="py-1.5 px-1 align-top">
                    {c.invoiceFileId ? (
                      <button
                        type="button"
                        onClick={() => void openInvoiceFile(serviceId, c.id)}
                        className="inline-flex items-center gap-1 text-[11px] underline"
                        style={{ color: "var(--accent)" }}
                        aria-label={`Otwórz plik faktury (${c.invoiceNumber ?? c.name})`}
                      >
                        <Paperclip className="w-3 h-3" />
                        Otwórz
                      </button>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </td>
                  {editable && (
                    <td className="py-1.5 px-1 text-right align-top">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onEdit(c)}
                          className="p-1 rounded hover:bg-white/5"
                          style={{ color: "var(--text-muted)" }}
                          aria-label={`Edytuj komponent ${c.name}`}
                          title="Edytuj"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDelete(c)}
                          className="p-1 rounded hover:bg-white/5"
                          style={{ color: "#fca5a5" }}
                          aria-label={`Usuń komponent ${c.name}`}
                          title="Usuń"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr
                className="border-t font-semibold"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <td className="py-1.5 px-1" colSpan={3}>
                  Razem ({totals.count})
                </td>
                <td className="py-1.5 px-1 text-right font-mono">
                  {formatPLN(totals.totalCostNet)}
                </td>
                <td colSpan={2} />
                <td className="py-1.5 px-1 text-right font-mono">
                  {formatPLN(totals.totalCostGross)}
                </td>
                <td colSpan={editable ? 2 : 1} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Kalkulacja marży */}
      <div
        className="mt-3 pt-3 border-t text-xs grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className="flex justify-between gap-2">
          <span style={{ color: "var(--text-muted)" }}>Wycena brutto klienta:</span>
          <span className="font-mono">{formatPLN(margin.Z)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span style={{ color: "var(--text-muted)" }}>
            Koszt komponentów brutto:
          </span>
          <span className="font-mono">{formatPLN(margin.Y)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span style={{ color: "var(--text-muted)" }}>Marża brutto:</span>
          <span className="font-mono" style={{ color: margin.color }}>
            {formatPLN(margin.M)}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span style={{ color: "var(--text-muted)" }}>Marża %:</span>
          <span className="font-mono font-semibold" style={{ color: margin.color }}>
            {margin.Z > 0 ? `${margin.N.toFixed(1)}%` : "—"}
          </span>
        </div>
      </div>

      {modalOpen && (
        <ComponentModal
          serviceId={serviceId}
          existing={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            void fetchComponents();
          }}
        />
      )}
    </div>
  );
}

interface ModalProps {
  serviceId: string;
  existing: ServiceComponent | null;
  onClose: () => void;
  onSaved: () => void;
}

function ComponentModal({
  serviceId,
  existing,
  onClose,
  onSaved,
}: ModalProps) {
  const [draft, setDraft] = useState<ComponentFormDraft>(
    existing ? draftFromComponent(existing) : emptyDraft(),
  );
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  // ESC close + initial focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    firstInputRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_INVOICE_MIME.includes(file.type)) {
      return "Dozwolone formaty: JPEG, PNG, PDF";
    }
    if (file.size > MAX_INVOICE_BYTES) {
      return `Plik przekracza maksymalny rozmiar ${Math.round(
        MAX_INVOICE_BYTES / 1024 / 1024,
      )} MB`;
    }
    return null;
  };

  const onPickFile = (file: File | null) => {
    setError(null);
    if (!file) {
      setPendingFile(null);
      return;
    }
    const err = validateFile(file);
    if (err) {
      setError(err);
      setPendingFile(null);
      return;
    }
    setPendingFile(file);
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const name = draft.name.trim();
    if (!name) {
      setError("Pole `Nazwa` jest wymagane");
      return;
    }
    // Wave 21 / Faza 1E — netto/brutto toggle. Backend dalej dostaje
    // wyłącznie cost_net; brutto konwertujemy klientowo: net = gross /
    // (1 + vat/100). Walidacja na inputie po konwersji.
    const priceValue = Number(draft.priceInput);
    if (!Number.isFinite(priceValue) || priceValue < 0) {
      setError(
        draft.priceMode === "gross"
          ? "Pole `Cena brutto` musi być liczbą >= 0"
          : "Pole `Cena netto` musi być liczbą >= 0",
      );
      return;
    }
    const costNet =
      draft.priceMode === "gross"
        ? Number((priceValue / (1 + draft.vatRate / 100)).toFixed(4))
        : Number(priceValue.toFixed(4));
    const quantity = Number(draft.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Pole `Ilość` musi być liczbą > 0");
      return;
    }
    const marginTargetPct =
      draft.marginTargetPct.trim() === ""
        ? null
        : Number(draft.marginTargetPct);
    if (
      marginTargetPct != null &&
      (!Number.isFinite(marginTargetPct) ||
        marginTargetPct < -100 ||
        marginTargetPct > 1000)
    ) {
      setError("Pole `Marża target %` poza zakresem -100 .. 1000");
      return;
    }

    const payload: Record<string, unknown> = {
      name,
      supplierName: draft.supplierName.trim() || null,
      invoiceNumber: draft.invoiceNumber.trim() || null,
      invoiceKind: draft.invoiceKind,
      purchaseDate: draft.purchaseDate || null,
      deliveryDate: draft.deliveryDate || null,
      costNet,
      quantity,
      vatRate: draft.vatRate,
      marginTargetPct,
      notes: draft.notes.trim() || null,
    };

    setSubmitting(true);
    try {
      let componentId = existing?.id ?? null;
      if (existing) {
        const res = await fetch(
          `/api/relay/services/${encodeURIComponent(
            serviceId,
          )}/components/${encodeURIComponent(existing.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        if (!res.ok) {
          const json = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(json?.error ?? `HTTP ${res.status}`);
        }
      } else {
        const res = await fetch(
          `/api/relay/services/${encodeURIComponent(serviceId)}/components`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const json = (await res.json().catch(() => null)) as
          | { component?: { id?: string }; error?: string }
          | null;
        if (!res.ok || !json?.component?.id) {
          throw new Error(json?.error ?? `HTTP ${res.status}`);
        }
        componentId = json.component.id;
      }

      // Upload pliku (jeśli wybrany) — po create/update.
      if (pendingFile && componentId) {
        const fd = new FormData();
        fd.set("file", pendingFile);
        const upRes = await fetch(
          `/api/relay/services/${encodeURIComponent(
            serviceId,
          )}/components/${encodeURIComponent(componentId)}/invoice-file`,
          { method: "POST", body: fd },
        );
        if (!upRes.ok) {
          const json = (await upRes.json().catch(() => null)) as
            | { error?: string }
            | null;
          // Komponent zapisany — błąd uploadu nie powinien zerwać save.
          // Ale informujemy usera.
          throw new Error(
            json?.error ?? `Nie udało się dodać pliku faktury (HTTP ${upRes.status})`,
          );
        }
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-2 sm:p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="component-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-5 shadow-xl"
        style={{
          background: "var(--bg-card)",
          color: "var(--text-main)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <div className="flex items-start justify-between mb-3 gap-2">
          <h2
            id="component-modal-title"
            className="text-base font-semibold"
          >
            {existing ? "Edytuj komponent" : "Dodaj komponent"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded"
            style={{ color: "var(--text-muted)" }}
            aria-label="Zamknij"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <Field label="Nazwa" htmlFor="cmp-name" required>
            <input
              ref={firstInputRef}
              id="cmp-name"
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              required
              maxLength={200}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
              placeholder="np. Wyświetlacz iPhone 13"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Hurtownia" htmlFor="cmp-supplier">
              <ClearableInput
                id="cmp-supplier"
                type="text"
                value={draft.supplierName}
                onValueChange={(v) => setDraft({ ...draft, supplierName: v })}
                optional
                clearAriaLabel="Wyczyść pole hurtowni"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
                placeholder="np. GSM Hurt"
              />
            </Field>
            <Field label="Numer faktury / paragonu" htmlFor="cmp-invoice">
              <ClearableInput
                id="cmp-invoice"
                type="text"
                value={draft.invoiceNumber}
                onValueChange={(v) => setDraft({ ...draft, invoiceNumber: v })}
                optional
                clearAriaLabel="Wyczyść pole numeru faktury"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none font-mono"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
                placeholder="FV/2026/05/0042"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Rodzaj dokumentu" htmlFor="cmp-kind">
              <select
                id="cmp-kind"
                value={draft.invoiceKind}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    invoiceKind: e.target
                      .value as ComponentFormDraft["invoiceKind"],
                  })
                }
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
              >
                <option value="faktura">Faktura</option>
                <option value="paragon">Paragon</option>
                <option value="wz">WZ</option>
                <option value="inny">Inny</option>
              </select>
            </Field>
            <Field label="Data zakupu" htmlFor="cmp-purchase">
              <ClearableInput
                id="cmp-purchase"
                type="date"
                value={draft.purchaseDate}
                onValueChange={(v) => setDraft({ ...draft, purchaseDate: v })}
                optional
                clearAriaLabel="Wyczyść pole daty zakupu"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
              />
            </Field>
            <Field label="Data dostawy" htmlFor="cmp-delivery">
              <ClearableInput
                id="cmp-delivery"
                type="date"
                value={draft.deliveryDate}
                onValueChange={(v) => setDraft({ ...draft, deliveryDate: v })}
                optional
                clearAriaLabel="Wyczyść pole daty dostawy"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
              />
            </Field>
          </div>

          {/* Wave 21 / Faza 1E — toggle netto/brutto + dynamiczny label. */}
          <div className="space-y-2">
            <span
              className="block text-[11px] uppercase tracking-wider font-semibold"
              style={{ color: "var(--text-muted)" }}
            >
              Cena (PLN) <span style={{ color: "#ef4444" }}>*</span>
            </span>
            <div
              role="radiogroup"
              aria-label="Sposób wprowadzania ceny"
              className="inline-flex gap-1 p-0.5 rounded-lg border"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <button
                type="button"
                role="radio"
                aria-checked={draft.priceMode === "net"}
                onClick={() => setDraft({ ...draft, priceMode: "net" })}
                className="px-3 py-1 rounded text-xs font-medium transition-colors"
                style={{
                  background:
                    draft.priceMode === "net" ? "var(--accent)" : "transparent",
                  color: draft.priceMode === "net" ? "#fff" : "var(--text-main)",
                }}
              >
                Netto
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={draft.priceMode === "gross"}
                onClick={() => setDraft({ ...draft, priceMode: "gross" })}
                className="px-3 py-1 rounded text-xs font-medium transition-colors"
                style={{
                  background:
                    draft.priceMode === "gross"
                      ? "var(--accent)"
                      : "transparent",
                  color:
                    draft.priceMode === "gross" ? "#fff" : "var(--text-main)",
                }}
              >
                Brutto
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field
              label={
                draft.priceMode === "gross"
                  ? "Cena brutto (PLN)"
                  : "Cena netto (PLN)"
              }
              htmlFor="cmp-price"
              required
            >
              <input
                id="cmp-price"
                type="number"
                min={0}
                step="0.01"
                value={draft.priceInput}
                onChange={(e) =>
                  setDraft({ ...draft, priceInput: e.target.value })
                }
                required
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none font-mono"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
                inputMode="decimal"
                aria-describedby="cmp-price-preview"
              />
              <PricePreview
                priceInput={draft.priceInput}
                priceMode={draft.priceMode}
                vatRate={draft.vatRate}
              />
            </Field>
            <Field label="Ilość" htmlFor="cmp-qty" required>
              <input
                id="cmp-qty"
                type="number"
                min={0}
                step="0.5"
                value={draft.quantity}
                onChange={(e) =>
                  setDraft({ ...draft, quantity: e.target.value })
                }
                required
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none font-mono"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
                inputMode="decimal"
              />
            </Field>
            <Field label="VAT" htmlFor="cmp-vat" required>
              <select
                id="cmp-vat"
                value={String(draft.vatRate)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    vatRate: Number(e.target.value) as
                      | 0
                      | 5
                      | 8
                      | 23,
                  })
                }
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
              >
                <option value="0">0%</option>
                <option value="5">5%</option>
                <option value="8">8%</option>
                <option value="23">23%</option>
              </select>
            </Field>
            <Field label="Marża target %" htmlFor="cmp-margin">
              <ClearableInput
                id="cmp-margin"
                type="number"
                step="0.1"
                value={draft.marginTargetPct}
                onValueChange={(v) =>
                  setDraft({ ...draft, marginTargetPct: v })
                }
                optional
                clearAriaLabel="Wyczyść pole marży"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none font-mono"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
                placeholder="opcjonalne"
                inputMode="decimal"
              />
            </Field>
          </div>

          <Field label="Notatki" htmlFor="cmp-notes">
            <textarea
              id="cmp-notes"
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
              placeholder="np. wersja OEM, sprawdzona po dostawie"
            />
          </Field>

          <Field label="Plik faktury (opcjonalne)" htmlFor="cmp-file">
            <div className="flex flex-col gap-2">
              {existing?.invoiceFileId && !pendingFile && (
                <div
                  className="text-[11px] flex items-center gap-2"
                  style={{ color: "var(--text-muted)" }}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Plik faktury jest już podpięty (upload nowego nadpisze).
                </div>
              )}
              <label
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
              >
                <Upload className="w-3.5 h-3.5" />
                {pendingFile ? pendingFile.name : "Wybierz plik (JPEG / PNG / PDF, max 10 MB)"}
                <input
                  id="cmp-file"
                  type="file"
                  accept={ALLOWED_INVOICE_MIME.join(",")}
                  className="sr-only"
                  onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                />
              </label>
              {pendingFile && (
                <button
                  type="button"
                  onClick={() => setPendingFile(null)}
                  className="self-start text-[11px] underline"
                  style={{ color: "var(--text-muted)" }}
                >
                  Wyczyść wybór
                </button>
              )}
            </div>
          </Field>

          {error && (
            <div
              role="alert"
              className="p-2 rounded-lg flex items-start gap-2 text-xs"
              style={{
                background: "rgba(239, 68, 68, 0.1)",
                color: "#fca5a5",
              }}
            >
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border"
              style={{
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {existing ? "Zapisz zmiany" : "Dodaj komponent"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Wave 21 / Faza 1E — preview "= X PLN brutto/netto" pod inputem ceny. */
function PricePreview({
  priceInput,
  priceMode,
  vatRate,
}: {
  priceInput: string;
  priceMode: "net" | "gross";
  vatRate: number;
}) {
  const value = Number(priceInput);
  if (!priceInput.trim() || !Number.isFinite(value) || value < 0) {
    return (
      <p
        id="cmp-price-preview"
        className="mt-1 text-[10px]"
        style={{ color: "var(--text-muted)" }}
      >
        VAT {vatRate}% — wpisz wartość, aby zobaczyć przeliczenie.
      </p>
    );
  }
  const counterpart =
    priceMode === "net"
      ? value * (1 + vatRate / 100)
      : value / (1 + vatRate / 100);
  const counterLabel = priceMode === "net" ? "brutto" : "netto";
  return (
    <p
      id="cmp-price-preview"
      className="mt-1 text-[10px]"
      style={{ color: "var(--text-muted)" }}
    >
      = {counterpart.toFixed(2)} PLN {counterLabel} (VAT {vatRate}%)
    </p>
  );
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span
        className="block text-[11px] uppercase tracking-wider font-semibold mb-1"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
        {required && <span style={{ color: "#ef4444" }}> *</span>}
      </span>
      {children}
    </label>
  );
}
