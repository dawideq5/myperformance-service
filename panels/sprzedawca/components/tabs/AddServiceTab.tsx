"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, X } from "lucide-react";

const DEVICE_TYPES = [
  { value: "phone", label: "Telefon" },
  { value: "tablet", label: "Tablet" },
  { value: "laptop", label: "Laptop" },
  { value: "smartwatch", label: "Smartwatch" },
  { value: "headphones", label: "Słuchawki" },
  { value: "other", label: "Inne" },
];

export function AddServiceTab({ locationId }: { locationId: string }) {
  const [type, setType] = useState("phone");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [imei, setImei] = useState("");
  const [color, setColor] = useState("");
  const [lockCode, setLockCode] = useState("");
  const [description, setDescription] = useState("");
  const [amountEstimate, setAmountEstimate] = useState("");
  const [customerFirstName, setCustomerFirstName] = useState("");
  const [customerLastName, setCustomerLastName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setBrand("");
    setModel("");
    setImei("");
    setColor("");
    setLockCode("");
    setDescription("");
    setAmountEstimate("");
    setCustomerFirstName("");
    setCustomerLastName("");
    setContactPhone("");
    setContactEmail("");
    setPhotos([]);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const body = {
        locationId,
        type,
        brand: brand.trim() || null,
        model: model.trim() || null,
        imei: imei.trim() || null,
        color: color.trim() || null,
        lockCode: lockCode.trim() || null,
        description: description.trim() || null,
        amountEstimate: amountEstimate ? Number(amountEstimate) : null,
        customerFirstName: customerFirstName.trim() || null,
        customerLastName: customerLastName.trim() || null,
        contactPhone: contactPhone.trim() || null,
        contactEmail: contactEmail.trim() || null,
        photos,
      };
      const res = await fetch("/api/relay/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setSuccess(`Utworzono zlecenie ${json.service.ticketNumber}`);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd zapisu");
    } finally {
      setSaving(false);
    }
  };

  return (
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

      <Section title="Urządzenie">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select label="Typ" value={type} onChange={setType} options={DEVICE_TYPES} />
          <Input label="Marka" value={brand} onChange={setBrand} placeholder="Apple, Samsung…" />
          <Input label="Model" value={model} onChange={setModel} placeholder="iPhone 15 Pro" />
          <Input label="IMEI / SN" value={imei} onChange={setImei} placeholder="15 cyfr" mono />
          <Input label="Kolor" value={color} onChange={setColor} />
          <Input
            label="Kod blokady ekranu"
            value={lockCode}
            onChange={setLockCode}
            placeholder="opcjonalnie"
          />
        </div>
      </Section>

      <Section title="Opis usterki">
        <Textarea
          value={description}
          onChange={setDescription}
          placeholder="Co zgłasza klient? Co przestało działać? Kiedy się zaczęło?"
          rows={3}
        />
      </Section>

      <Section title="Wycena wstępna">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Kwota orientacyjna (PLN)"
            value={amountEstimate}
            onChange={setAmountEstimate}
            type="number"
            placeholder="0.00"
          />
        </div>
      </Section>

      <Section title="Klient">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Imię" value={customerFirstName} onChange={setCustomerFirstName} />
          <Input label="Nazwisko" value={customerLastName} onChange={setCustomerLastName} />
          <Input label="Telefon" value={contactPhone} onChange={setContactPhone} />
          <Input
            label="Email"
            value={contactEmail}
            onChange={setContactEmail}
            type="email"
          />
        </div>
      </Section>

      <PhotosUpload photos={photos} onChange={setPhotos} />

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 rounded-lg text-sm font-medium border"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-muted)",
          }}
          disabled={saving}
        >
          Wyczyść
        </button>
        <button
          type="submit"
          className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
          style={{ background: "var(--accent)", color: "#fff" }}
          disabled={saving}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Utwórz zlecenie
        </button>
      </div>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
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
        {title}
      </h3>
      {children}
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
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
        placeholder={placeholder}
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

function Textarea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
      style={{
        background: "var(--bg-surface)",
        borderColor: "var(--border-subtle)",
        color: "var(--text-main)",
      }}
    />
  );
}

function Select({
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

function PhotosUpload({
  photos,
  onChange,
}: {
  photos: string[];
  onChange: (p: string[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onFile = async (file: File) => {
    if (photos.length >= 5) {
      setError("Max 5 zdjęć");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("filename", file.name);
      const res = await fetch("/api/photo-relay", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      onChange([...photos, json.data.url].slice(0, 5));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };
  return (
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
        Zdjęcia (max 5)
      </h3>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {photos.map((url, idx) => (
          <div
            key={idx}
            className="relative aspect-square rounded-lg overflow-hidden border"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(photos.filter((_, i) => i !== idx))}
              className="absolute top-1 right-1 p-1 rounded bg-black/60 text-white"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        {photos.length < 5 && (
          <label
            className={`aspect-square rounded-lg border-2 border-dashed flex items-center justify-center text-xs cursor-pointer ${
              uploading ? "opacity-50 pointer-events-none" : ""
            }`}
            style={{
              borderColor: "var(--border-subtle)",
              color: "var(--text-muted)",
            }}
          >
            {uploading ? "Wgrywanie…" : "+ Dodaj"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      {error && (
        <p
          className="text-xs mt-2"
          style={{ color: "#ef4444" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
