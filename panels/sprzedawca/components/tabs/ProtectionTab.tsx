"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

interface Protection {
  id: string;
  brand: string | null;
  model: string | null;
  imei: string | null;
  glassType: string;
  extendedWarranty: boolean;
  warrantyMonths: number | null;
  amount: number | null;
  customerLastName: string | null;
  createdAt: string | null;
}

const GLASS_TYPES = [
  { value: "none", label: "Bez szkła" },
  { value: "standard", label: "Standard 2.5D" },
  { value: "uv", label: "Szkło UV" },
  { value: "privacy", label: "Szkło prywatyzujące" },
  { value: "full_3d", label: "Szkło 3D pełne" },
];

export function ProtectionTab({ locationId }: { locationId: string }) {
  const [recent, setRecent] = useState<Protection[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [imei, setImei] = useState("");
  const [glassType, setGlassType] = useState("standard");
  const [extendedWarranty, setExtendedWarranty] = useState(false);
  const [warrantyMonths, setWarrantyMonths] = useState("12");
  const [amount, setAmount] = useState("");
  const [customerFirstName, setCustomerFirstName] = useState("");
  const [customerLastName, setCustomerLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/relay/protections?limit=10");
      const json = await res.json();
      setRecent(json.protections ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const body = {
        locationId,
        brand: brand.trim(),
        model: model.trim(),
        imei: imei.trim(),
        glassType,
        extendedWarranty,
        warrantyMonths: extendedWarranty ? Number(warrantyMonths) || null : null,
        amount: Number(amount),
        customerFirstName: customerFirstName.trim() || null,
        customerLastName: customerLastName.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
      };
      const res = await fetch("/api/relay/protections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setSuccess(`Pakiet zapisany dla ${json.protection.brand} ${json.protection.model}`);
      setBrand("");
      setModel("");
      setImei("");
      setAmount("");
      setCustomerFirstName("");
      setCustomerLastName("");
      setPhone("");
      setEmail("");
      void refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd zapisu");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-4">
        {success && (
          <div
            className="p-3 rounded-lg border text-sm flex items-center gap-2"
            style={{
              background: "rgba(34, 197, 94, 0.08)",
              borderColor: "rgba(34, 197, 94, 0.3)",
              color: "#22c55e",
            }}
          >
            <CheckCircle2 className="w-4 h-4" />
            {success}
          </div>
        )}
        {error && (
          <div
            className="p-3 rounded-lg border text-sm"
            style={{
              background: "rgba(239, 68, 68, 0.08)",
              borderColor: "rgba(239, 68, 68, 0.3)",
              color: "#ef4444",
            }}
          >
            {error}
          </div>
        )}

        <div
          className="p-4 rounded-2xl border space-y-3"
          style={{
            background: "var(--bg-card)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <h3
            className="text-xs uppercase tracking-wider font-semibold"
            style={{ color: "var(--text-muted)" }}
          >
            Urządzenie
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Marka" value={brand} onChange={setBrand} required />
            <Field label="Model" value={model} onChange={setModel} required />
            <Field label="IMEI" value={imei} onChange={setImei} mono required />
            <SelectField
              label="Rodzaj szkła"
              value={glassType}
              onChange={setGlassType}
              options={GLASS_TYPES}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={extendedWarranty}
                onChange={(e) => setExtendedWarranty(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm">Gwarancja rozszerzona</span>
            </label>
            {extendedWarranty && (
              <Field
                label="Miesięcy"
                value={warrantyMonths}
                onChange={setWarrantyMonths}
                type="number"
                inline
              />
            )}
          </div>
          <Field
            label="Kwota (PLN)"
            value={amount}
            onChange={setAmount}
            type="number"
            required
          />
        </div>

        <div
          className="p-4 rounded-2xl border space-y-3"
          style={{
            background: "var(--bg-card)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <h3
            className="text-xs uppercase tracking-wider font-semibold"
            style={{ color: "var(--text-muted)" }}
          >
            Klient (opcjonalnie)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Imię" value={customerFirstName} onChange={setCustomerFirstName} />
            <Field label="Nazwisko" value={customerLastName} onChange={setCustomerLastName} />
            <Field label="Telefon" value={phone} onChange={setPhone} />
            <Field label="Email" value={email} onChange={setEmail} type="email" />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
            style={{ background: "var(--accent)", color: "#fff" }}
            disabled={saving}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Zapisz pakiet
          </button>
        </div>
      </form>

      <div
        className="p-4 rounded-2xl border"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <h3
          className="text-xs uppercase tracking-wider font-semibold mb-3"
          style={{ color: "var(--text-muted)" }}
        >
          Ostatnie pakiety
        </h3>
        {loadingList ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--text-muted)" }} />
          </div>
        ) : recent.length === 0 ? (
          <p
            className="text-sm text-center py-4"
            style={{ color: "var(--text-muted)" }}
          >
            Brak zapisanych pakietów.
          </p>
        ) : (
          <div className="space-y-2">
            {recent.map((p) => (
              <div
                key={p.id}
                className="p-3 rounded-lg flex items-center justify-between text-sm"
                style={{ background: "var(--bg-surface)" }}
              >
                <div>
                  <div className="font-medium">
                    {p.brand} {p.model}
                  </div>
                  <div
                    className="text-xs font-mono"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {p.imei} ·{" "}
                    {GLASS_TYPES.find((g) => g.value === p.glassType)?.label ??
                      p.glassType}
                    {p.extendedWarranty
                      ? ` · gwarancja ${p.warrantyMonths ?? "?"} mies.`
                      : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{p.amount} PLN</div>
                  {p.createdAt && (
                    <div
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {new Date(p.createdAt).toLocaleDateString("pl")}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  mono,
  inline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  mono?: boolean;
  inline?: boolean;
}) {
  return (
    <label className={inline ? "flex items-center gap-2" : "block"}>
      <span
        className={`text-xs font-medium ${inline ? "" : "block mb-1"}`}
        style={{ color: "var(--text-muted)" }}
      >
        {label}
        {required ? " *" : ""}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className={`px-3 py-2 rounded-lg border text-sm outline-none ${
          mono ? "font-mono" : ""
        } ${inline ? "w-20" : "w-full"}`}
        style={{
          background: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-main)",
        }}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span
        className="block text-xs font-medium mb-1"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
        style={{
          background: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-main)",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
