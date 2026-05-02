"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  ExternalLink,
  Loader2,
  Package,
  PackageCheck,
  Trash2,
  Truck,
} from "lucide-react";

export interface PartOrder {
  id: string;
  partName: string;
  supplierName: string | null;
  courier: string | null;
  trackingUrl: string | null;
  trackingNumber: string | null;
  expectedDeliveryDate: string | null;
  orderedAt: string;
  receivedAt: string | null;
  status: "ordered" | "shipped" | "delivered" | "cancelled" | "lost";
  notes: string | null;
}

const STATUS_LABELS: Record<PartOrder["status"], string> = {
  ordered: "Zamówione",
  shipped: "W drodze",
  delivered: "Dostarczone",
  cancelled: "Anulowane",
  lost: "Zaginione",
};

const STATUS_COLORS: Record<PartOrder["status"], string> = {
  ordered: "#64748B",
  shipped: "#0EA5E9",
  delivered: "#22C55E",
  cancelled: "#94A3B8",
  lost: "#EF4444",
};

interface PartOrdersSectionProps {
  serviceId: string;
}

interface NewOrderForm {
  partName: string;
  supplierName: string;
  courier: string;
  trackingUrl: string;
  trackingNumber: string;
  expectedDeliveryDate: string;
  notes: string;
}

const EMPTY_FORM: NewOrderForm = {
  partName: "",
  supplierName: "",
  courier: "",
  trackingUrl: "",
  trackingNumber: "",
  expectedDeliveryDate: "",
  notes: "",
};

/**
 * Sekcja "Zamówione części" — lista part_orders + form do dodawania nowego
 * zamówienia. Wyświetlana w NaprawaTab gdy service.status === "awaiting_parts".
 *
 * Każdy order ma akcje: edycja inline trackingu (PATCH), mark received,
 * soft-delete. Tracking URL otwiera się w nowej karcie (target="_blank"
 * rel="noopener noreferrer").
 */
export function PartOrdersSection({ serviceId }: PartOrdersSectionProps) {
  const [orders, setOrders] = useState<PartOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewOrderForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    courier: string;
    trackingUrl: string;
    trackingNumber: string;
    expectedDeliveryDate: string;
  }>({
    courier: "",
    trackingUrl: "",
    trackingNumber: "",
    expectedDeliveryDate: "",
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/relay/services/${serviceId}/part-orders`,
      );
      const json = (await res.json().catch(() => null)) as
        | { orders?: PartOrder[] }
        | null;
      setOrders(json?.orders ?? []);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submitNew = async () => {
    if (!form.partName.trim()) {
      setError("Nazwa części jest wymagana");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/relay/services/${serviceId}/part-orders`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            partName: form.partName.trim(),
            supplierName: form.supplierName.trim() || undefined,
            courier: form.courier.trim() || undefined,
            trackingUrl: form.trackingUrl.trim() || undefined,
            trackingNumber: form.trackingNumber.trim() || undefined,
            expectedDeliveryDate:
              form.expectedDeliveryDate.trim() || undefined,
            notes: form.notes.trim() || undefined,
          }),
        },
      );
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; order?: PartOrder }
        | null;
      if (!res.ok) {
        setError(json?.error ?? `Błąd serwera (HTTP ${res.status})`);
        return;
      }
      setForm(EMPTY_FORM);
      setShowForm(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd sieci");
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (o: PartOrder) => {
    setEditingId(o.id);
    setEditForm({
      courier: o.courier ?? "",
      trackingUrl: o.trackingUrl ?? "",
      trackingNumber: o.trackingNumber ?? "",
      expectedDeliveryDate: o.expectedDeliveryDate ?? "",
    });
  };

  const saveEdit = async (orderId: string) => {
    setError(null);
    try {
      const res = await fetch(
        `/api/relay/services/${serviceId}/part-orders/${orderId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courier: editForm.courier.trim() || null,
            trackingUrl: editForm.trackingUrl.trim() || null,
            trackingNumber: editForm.trackingNumber.trim() || null,
            expectedDeliveryDate:
              editForm.expectedDeliveryDate.trim() || null,
          }),
        },
      );
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok) {
        setError(json?.error ?? `Błąd serwera (HTTP ${res.status})`);
        return;
      }
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd sieci");
    }
  };

  const markReceived = async (orderId: string) => {
    if (
      !window.confirm(
        "Potwierdzasz że ta część została fizycznie odebrana w serwisie?",
      )
    )
      return;
    setError(null);
    try {
      const res = await fetch(
        `/api/relay/services/${serviceId}/part-orders/${orderId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markReceived: true }),
        },
      );
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok) {
        setError(json?.error ?? `Błąd serwera (HTTP ${res.status})`);
        return;
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd sieci");
    }
  };

  const deleteOrder = async (orderId: string, partName: string) => {
    if (
      !window.confirm(
        `Usunąć zamówienie "${partName}"? (soft delete — zapis pozostaje w historii)`,
      )
    )
      return;
    setError(null);
    try {
      const res = await fetch(
        `/api/relay/services/${serviceId}/part-orders/${orderId}`,
        { method: "DELETE" },
      );
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok) {
        setError(json?.error ?? `Błąd serwera (HTTP ${res.status})`);
        return;
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd sieci");
    }
  };

  return (
    <div className="space-y-3">
      {error && (
        <div
          role="alert"
          className="text-xs rounded-lg border p-2"
          style={{
            background: "rgba(239, 68, 68, 0.08)",
            borderColor: "rgba(239, 68, 68, 0.4)",
            color: "#fca5a5",
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-3">
          <Loader2
            className="w-4 h-4 animate-spin"
            style={{ color: "var(--text-muted)" }}
            aria-hidden="true"
          />
        </div>
      ) : orders.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Brak zamówionych części dla tego zlecenia.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {orders.map((o) => (
            <li
              key={o.id}
              className="p-2 rounded-lg border space-y-1.5"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <div className="flex items-start gap-2">
                <Package
                  className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"
                  style={{ color: STATUS_COLORS[o.status] }}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="text-xs font-semibold"
                      style={{ color: "var(--text-main)" }}
                    >
                      {o.partName}
                    </span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                      style={{
                        background: `${STATUS_COLORS[o.status]}22`,
                        color: STATUS_COLORS[o.status],
                      }}
                    >
                      {STATUS_LABELS[o.status]}
                    </span>
                  </div>
                  {o.supplierName && (
                    <p
                      className="text-[11px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Dostawca: {o.supplierName}
                    </p>
                  )}
                  {editingId === o.id ? (
                    <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                      <input
                        type="text"
                        value={editForm.courier}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            courier: e.target.value,
                          }))
                        }
                        placeholder="Kurier (DPD…)"
                        aria-label="Kurier"
                        className="px-2 py-1 rounded border text-xs outline-none"
                        style={{
                          background: "var(--bg-card)",
                          borderColor: "var(--border-subtle)",
                          color: "var(--text-main)",
                        }}
                      />
                      <input
                        type="text"
                        value={editForm.trackingNumber}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            trackingNumber: e.target.value,
                          }))
                        }
                        placeholder="Numer listu"
                        aria-label="Numer listu przewozowego"
                        className="px-2 py-1 rounded border text-xs outline-none font-mono"
                        style={{
                          background: "var(--bg-card)",
                          borderColor: "var(--border-subtle)",
                          color: "var(--text-main)",
                        }}
                      />
                      <input
                        type="url"
                        value={editForm.trackingUrl}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            trackingUrl: e.target.value,
                          }))
                        }
                        placeholder="https://tracking…"
                        aria-label="URL śledzenia"
                        className="col-span-2 px-2 py-1 rounded border text-xs outline-none"
                        style={{
                          background: "var(--bg-card)",
                          borderColor: "var(--border-subtle)",
                          color: "var(--text-main)",
                        }}
                      />
                      <input
                        type="date"
                        value={editForm.expectedDeliveryDate}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            expectedDeliveryDate: e.target.value,
                          }))
                        }
                        aria-label="Przewidywana data dostawy"
                        className="px-2 py-1 rounded border text-xs outline-none"
                        style={{
                          background: "var(--bg-card)",
                          borderColor: "var(--border-subtle)",
                          color: "var(--text-main)",
                        }}
                      />
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void saveEdit(o.id)}
                          className="px-2 py-1 rounded text-[11px] font-medium"
                          style={{ background: "var(--accent)", color: "#fff" }}
                        >
                          Zapisz
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="px-2 py-1 rounded text-[11px] font-medium border"
                          style={{
                            background: "var(--bg-card)",
                            borderColor: "var(--border-subtle)",
                            color: "var(--text-main)",
                          }}
                        >
                          Anuluj
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {(o.courier ||
                        o.trackingNumber ||
                        o.trackingUrl ||
                        o.expectedDeliveryDate) && (
                        <div
                          className="flex flex-wrap items-center gap-2 mt-1 text-[11px]"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {o.courier && (
                            <span className="inline-flex items-center gap-1">
                              <Truck
                                className="w-3 h-3"
                                aria-hidden="true"
                              />
                              {o.courier}
                            </span>
                          )}
                          {o.trackingNumber && (
                            <span className="font-mono">
                              {o.trackingNumber}
                            </span>
                          )}
                          {o.trackingUrl && (
                            <a
                              href={o.trackingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 underline"
                              style={{ color: "rgba(14, 165, 233, 0.9)" }}
                            >
                              Śledź
                              <ExternalLink
                                className="w-3 h-3"
                                aria-hidden="true"
                              />
                            </a>
                          )}
                          {o.expectedDeliveryDate && (
                            <span>
                              ETA:{" "}
                              {new Date(
                                o.expectedDeliveryDate,
                              ).toLocaleDateString("pl-PL")}
                            </span>
                          )}
                        </div>
                      )}
                      {o.receivedAt && (
                        <p
                          className="text-[11px] mt-0.5"
                          style={{ color: "#22C55E" }}
                        >
                          Odebrano:{" "}
                          {new Date(o.receivedAt).toLocaleString("pl-PL")}
                        </p>
                      )}
                      {o.notes && (
                        <p
                          className="text-[11px] mt-0.5 italic"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {o.notes}
                        </p>
                      )}
                    </>
                  )}
                </div>
                {editingId !== o.id && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(o)}
                      className="text-[11px] px-2 py-0.5 rounded border"
                      style={{
                        background: "var(--bg-card)",
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-main)",
                      }}
                      aria-label={`Edytuj zamówienie ${o.partName}`}
                    >
                      Edytuj
                    </button>
                    {!o.receivedAt && o.status !== "cancelled" && (
                      <button
                        type="button"
                        onClick={() => void markReceived(o.id)}
                        className="text-[11px] px-2 py-0.5 rounded inline-flex items-center gap-0.5"
                        style={{ background: "#22C55E", color: "#fff" }}
                        aria-label={`Oznacz ${o.partName} jako odebrane`}
                        title="Oznacz jako odebrane"
                      >
                        <PackageCheck
                          className="w-3 h-3"
                          aria-hidden="true"
                        />
                        Odebrano
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void deleteOrder(o.id, o.partName)}
                      className="p-1 rounded"
                      style={{ color: "var(--text-muted)" }}
                      aria-label={`Usuń zamówienie ${o.partName}`}
                      title="Usuń zamówienie"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {showForm ? (
        <div
          className="p-3 rounded-lg border space-y-2"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <p
            className="text-[11px] uppercase tracking-wider font-semibold"
            style={{ color: "var(--text-muted)" }}
          >
            Nowe zamówienie
          </p>
          <div>
            <label
              htmlFor="part-name"
              className="block text-[11px] font-medium mb-0.5"
              style={{ color: "var(--text-muted)" }}
            >
              Nazwa części <span aria-hidden="true">*</span>
            </label>
            <input
              id="part-name"
              type="text"
              value={form.partName}
              onChange={(e) =>
                setForm((f) => ({ ...f, partName: e.target.value }))
              }
              required
              aria-required="true"
              placeholder="Wyświetlacz iPhone 13 OEM"
              className="w-full px-2 py-1.5 rounded border text-xs outline-none"
              style={{
                background: "var(--bg-card)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                htmlFor="part-supplier"
                className="block text-[11px] font-medium mb-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                Dostawca
              </label>
              <input
                id="part-supplier"
                type="text"
                value={form.supplierName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, supplierName: e.target.value }))
                }
                placeholder="Komputronik / Hurtownia X"
                className="w-full px-2 py-1.5 rounded border text-xs outline-none"
                style={{
                  background: "var(--bg-card)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
              />
            </div>
            <div>
              <label
                htmlFor="part-courier"
                className="block text-[11px] font-medium mb-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                Kurier
              </label>
              <input
                id="part-courier"
                type="text"
                value={form.courier}
                onChange={(e) =>
                  setForm((f) => ({ ...f, courier: e.target.value }))
                }
                placeholder="DPD / InPost / Pocztex"
                className="w-full px-2 py-1.5 rounded border text-xs outline-none"
                style={{
                  background: "var(--bg-card)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="part-tracking-url"
              className="block text-[11px] font-medium mb-0.5"
              style={{ color: "var(--text-muted)" }}
            >
              URL śledzenia
            </label>
            <input
              id="part-tracking-url"
              type="url"
              value={form.trackingUrl}
              onChange={(e) =>
                setForm((f) => ({ ...f, trackingUrl: e.target.value }))
              }
              placeholder="https://tracktrace.dpd.com.pl/parcelDetails?p=…"
              className="w-full px-2 py-1.5 rounded border text-xs outline-none"
              style={{
                background: "var(--bg-card)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                htmlFor="part-tracking-no"
                className="block text-[11px] font-medium mb-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                Nr listu
              </label>
              <input
                id="part-tracking-no"
                type="text"
                value={form.trackingNumber}
                onChange={(e) =>
                  setForm((f) => ({ ...f, trackingNumber: e.target.value }))
                }
                className="w-full px-2 py-1.5 rounded border text-xs outline-none font-mono"
                style={{
                  background: "var(--bg-card)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
              />
            </div>
            <div>
              <label
                htmlFor="part-eta"
                className="block text-[11px] font-medium mb-0.5"
                style={{ color: "var(--text-muted)" }}
              >
                Przewidywana data
              </label>
              <input
                id="part-eta"
                type="date"
                value={form.expectedDeliveryDate}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    expectedDeliveryDate: e.target.value,
                  }))
                }
                className="w-full px-2 py-1.5 rounded border text-xs outline-none"
                style={{
                  background: "var(--bg-card)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="part-notes"
              className="block text-[11px] font-medium mb-0.5"
              style={{ color: "var(--text-muted)" }}
            >
              Notatki
            </label>
            <textarea
              id="part-notes"
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
              rows={2}
              className="w-full px-2 py-1.5 rounded border text-xs outline-none resize-y"
              style={{
                background: "var(--bg-card)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
            />
          </div>
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setForm(EMPTY_FORM);
                setError(null);
              }}
              disabled={submitting}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-50"
              style={{
                background: "var(--bg-card)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-main)",
              }}
            >
              Anuluj
            </button>
            <button
              type="button"
              onClick={() => void submitNew()}
              disabled={submitting || !form.partName.trim()}
              className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {submitting ? (
                <Loader2
                  className="w-3.5 h-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              Dodaj zamówienie
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          <Package className="w-3.5 h-3.5" aria-hidden="true" />
          Dodaj zamówienie części
        </button>
      )}
    </div>
  );
}
