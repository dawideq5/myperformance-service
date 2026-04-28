"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Plus } from "lucide-react";

interface Claim {
  id: string;
  claimNumber: string;
  status: string;
  customerFirstName: string | null;
  customerLastName: string | null;
  productName: string | null;
  customerDemand: string | null;
  defectDescription: string | null;
  productValue: number | null;
  createdAt: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  new: "Nowa",
  review: "W rozpatrywaniu",
  accepted: "Zaakceptowana",
  rejected: "Odrzucona",
  closed: "Zakończona",
};

const DEMANDS = [
  { value: "repair", label: "Naprawa" },
  { value: "exchange", label: "Wymiana" },
  { value: "refund", label: "Zwrot pieniędzy" },
  { value: "discount", label: "Obniżenie ceny" },
];

export function ClaimsTab({ locationId }: { locationId: string }) {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/relay/claims?limit=50");
      const json = await res.json();
      setClaims(json.claims ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Reklamacje klientów dla tego punktu.
        </p>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          <Plus className="w-4 h-4" />
          {showForm ? "Anuluj" : "Nowa reklamacja"}
        </button>
      </div>

      {showForm && (
        <NewClaimForm
          locationId={locationId}
          onSaved={() => {
            setShowForm(false);
            void refresh();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2
            className="w-6 h-6 animate-spin"
            style={{ color: "var(--text-muted)" }}
          />
        </div>
      ) : claims.length === 0 ? (
        <div
          className="text-center py-8 rounded-2xl border"
          style={{
            background: "var(--bg-card)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          <p className="text-sm">Brak reklamacji.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {claims.map((c) => (
            <div
              key={c.id}
              className="p-4 rounded-xl border"
              style={{
                background: "var(--bg-card)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="font-mono text-xs font-semibold">
                  {c.claimNumber}
                </span>
                <span
                  className="text-[10px] uppercase font-mono px-2 py-0.5 rounded"
                  style={{
                    background: "var(--bg-surface)",
                    color: "var(--text-muted)",
                  }}
                >
                  {STATUS_LABELS[c.status] ?? c.status}
                </span>
              </div>
              <div className="text-sm font-medium">
                {[c.customerFirstName, c.customerLastName]
                  .filter(Boolean)
                  .join(" ")}{" "}
                — {c.productName}
              </div>
              {c.defectDescription && (
                <p
                  className="text-xs mt-1 line-clamp-2"
                  style={{ color: "var(--text-muted)" }}
                >
                  {c.defectDescription}
                </p>
              )}
              <div
                className="text-xs mt-1.5 flex flex-wrap gap-3"
                style={{ color: "var(--text-muted)" }}
              >
                {c.customerDemand && (
                  <span>
                    Żądanie:{" "}
                    {DEMANDS.find((d) => d.value === c.customerDemand)?.label ??
                      c.customerDemand}
                  </span>
                )}
                {c.productValue != null && <span>{c.productValue} PLN</span>}
                {c.createdAt && (
                  <span>{new Date(c.createdAt).toLocaleDateString("pl")}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewClaimForm({
  locationId,
  onSaved,
  onCancel,
}: {
  locationId: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [customerFirstName, setCustomerFirstName] = useState("");
  const [customerLastName, setCustomerLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [productName, setProductName] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [productValue, setProductValue] = useState("");
  const [defectDescription, setDefectDescription] = useState("");
  const [customerDemand, setCustomerDemand] = useState("repair");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = {
        locationId,
        customerFirstName: customerFirstName.trim(),
        customerLastName: customerLastName.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        productName: productName.trim(),
        purchaseDate: purchaseDate || null,
        receiptNumber: receiptNumber.trim() || null,
        productValue: productValue ? Number(productValue) : null,
        defectDescription: defectDescription.trim(),
        customerDemand,
      };
      const res = await fetch("/api/relay/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setSuccess(`Zapisano reklamację ${json.claim.claimNumber}`);
      setTimeout(onSaved, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd zapisu");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="p-4 rounded-2xl border space-y-3"
      style={{
        background: "var(--bg-card)",
        borderColor: "var(--border-subtle)",
      }}
    >
      {success && (
        <div
          className="p-2 rounded-lg text-sm flex items-center gap-2"
          style={{ background: "rgba(34,197,94,0.08)", color: "#22c55e" }}
        >
          <CheckCircle2 className="w-4 h-4" />
          {success}
        </div>
      )}
      {error && (
        <div
          className="p-2 rounded-lg text-sm"
          style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444" }}
        >
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Imię klienta *" value={customerFirstName} onChange={setCustomerFirstName} required />
        <Field label="Nazwisko *" value={customerLastName} onChange={setCustomerLastName} required />
        <Field label="Telefon" value={phone} onChange={setPhone} />
        <Field label="Email" value={email} onChange={setEmail} type="email" />
        <Field label="Produkt *" value={productName} onChange={setProductName} required />
        <Field label="Data zakupu" value={purchaseDate} onChange={setPurchaseDate} type="date" />
        <Field label="Numer paragonu" value={receiptNumber} onChange={setReceiptNumber} mono />
        <Field label="Wartość (PLN)" value={productValue} onChange={setProductValue} type="number" />
      </div>
      <label className="block">
        <span
          className="block text-xs font-medium mb-1"
          style={{ color: "var(--text-muted)" }}
        >
          Opis usterki *
        </span>
        <textarea
          value={defectDescription}
          onChange={(e) => setDefectDescription(e.target.value)}
          required
          rows={3}
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-main)",
          }}
        />
      </label>
      <label className="block">
        <span
          className="block text-xs font-medium mb-1"
          style={{ color: "var(--text-muted)" }}
        >
          Żądanie klienta
        </span>
        <select
          value={customerDemand}
          onChange={(e) => setCustomerDemand(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-main)",
          }}
        >
          {DEMANDS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-sm border"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          Anuluj
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Zapisz reklamację
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span
        className="block text-xs font-medium mb-1"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className={`w-full px-3 py-2 rounded-lg border text-sm outline-none ${
          mono ? "font-mono" : ""
        }`}
        style={{
          background: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-main)",
        }}
      />
    </label>
  );
}
