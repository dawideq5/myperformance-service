"use client";

import { useState } from "react";
import {
  AlertCircle,
  Battery,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cpu,
  Droplets,
  FileImage,
  Fingerprint,
  Hash,
  KeyRound,
  Loader2,
  Lock,
  Package,
  Palette,
  Phone,
  ScanLine,
  Shield,
  ShieldOff,
  Smartphone,
  Tablet,
  TabletSmartphone,
  Tag,
  TouchpadOff,
  User as UserIcon,
  Wrench,
  X,
  Zap,
} from "lucide-react";

const DEVICE_TYPES = [
  { value: "phone", label: "Telefon", icon: Smartphone, color: "#0EA5E9" },
  { value: "tablet", label: "Tablet", icon: Tablet, color: "#A855F7" },
  { value: "laptop", label: "Laptop", icon: Cpu, color: "#22C55E" },
  { value: "smartwatch", label: "Smartwatch", icon: TabletSmartphone, color: "#F59E0B" },
  { value: "headphones", label: "Słuchawki", icon: TabletSmartphone, color: "#EC4899" },
  { value: "other", label: "Inne", icon: Wrench, color: "#64748B" },
];

const LOCK_TYPES = [
  { value: "none", label: "Brak blokady", icon: ShieldOff },
  { value: "pin", label: "PIN", icon: Hash },
  { value: "pattern", label: "Wzór", icon: KeyRound },
  { value: "password", label: "Hasło", icon: Lock },
  { value: "face", label: "Face ID", icon: ScanLine },
  { value: "fingerprint", label: "Odcisk palca", icon: Fingerprint },
  { value: "multi", label: "Kombinowana", icon: Shield },
];

const ACCESSORIES = [
  { value: "kabel", label: "Kabel" },
  { value: "ladowarka", label: "Ładowarka" },
  { value: "etui", label: "Etui" },
  { value: "szklo", label: "Szkło" },
  { value: "sluchawki", label: "Słuchawki" },
  { value: "pudelko", label: "Pudełko" },
  { value: "instrukcja", label: "Instrukcja" },
  { value: "tacka_sim", label: "Tacka SIM" },
  { value: "rysik", label: "Rysik" },
];

const SCREEN_OPTIONS = [
  { value: "perfect", label: "Idealny", color: "#22C55E" },
  { value: "minor_scratches", label: "Lekkie rysy", color: "#F59E0B" },
  { value: "cracked", label: "Pęknięty", color: "#EF4444" },
  { value: "shattered", label: "Roztrzaskany", color: "#991B1B" },
];

const BODY_OPTIONS = [
  { value: "perfect", label: "Idealna", color: "#22C55E" },
  { value: "minor_wear", label: "Drobne otarcia", color: "#F59E0B" },
  { value: "dents", label: "Wgniecenia", color: "#EF4444" },
  { value: "damaged", label: "Uszkodzona", color: "#991B1B" },
];

const BATTERY_OPTIONS = [
  { value: "good", label: "Dobra", color: "#22C55E" },
  { value: "moderate", label: "Średnia", color: "#F59E0B" },
  { value: "poor", label: "Słaba", color: "#EF4444" },
  { value: "swollen", label: "Spuchnięta", color: "#991B1B" },
  { value: "unknown", label: "Nieznany", color: "#64748B" },
];

const PORT_OPTIONS = [
  { value: "all_working", label: "Wszystkie OK", color: "#22C55E" },
  { value: "some_loose", label: "Luźne", color: "#F59E0B" },
  { value: "broken", label: "Uszkodzone", color: "#EF4444" },
  { value: "unknown", label: "Nieznany", color: "#64748B" },
];

interface ChecklistState {
  screen?: string;
  body?: string;
  battery_health?: string;
  ports?: string;
  water_damage?: boolean;
  powers_on?: boolean;
  screen_responds?: boolean;
  customer_backup?: boolean;
  reset_consent?: boolean;
  notes?: string;
}

export function AddServiceTab({ locationId }: { locationId: string }) {
  const [type, setType] = useState("phone");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [imei, setImei] = useState("");
  const [color, setColor] = useState("");
  const [lockType, setLockType] = useState("none");
  const [lockCode, setLockCode] = useState("");
  const [signedInAccount, setSignedInAccount] = useState("");
  const [accessories, setAccessories] = useState<string[]>([]);
  const [checklist, setChecklist] = useState<ChecklistState>({});
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

  // Sekcje rozwijane (mobile-first); domyślnie urządzenie + opis otwarte.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    device: true,
    lock: true,
    accessories: true,
    checklist: true,
    description: true,
    customer: true,
    photos: true,
  });
  const toggleSection = (k: string) =>
    setOpenSections((s) => ({ ...s, [k]: !s[k] }));

  const reset = () => {
    setBrand("");
    setModel("");
    setImei("");
    setColor("");
    setLockType("none");
    setLockCode("");
    setSignedInAccount("");
    setAccessories([]);
    setChecklist({});
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
        lockType,
        lockCode: lockCode.trim() || null,
        signedInAccount: signedInAccount.trim() || null,
        accessories,
        intakeChecklist: checklist,
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
      // Auto-scroll na top żeby pokazać success message.
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd zapisu");
    } finally {
      setSaving(false);
    }
  };

  const toggleAccessory = (v: string) => {
    setAccessories((acc) =>
      acc.includes(v) ? acc.filter((a) => a !== v) : [...acc, v],
    );
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {success && (
        <div
          className="p-4 rounded-2xl border flex items-center gap-3 animate-fade-in shadow-lg"
          style={{
            background:
              "linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(34, 197, 94, 0.05))",
            borderColor: "rgba(34, 197, 94, 0.3)",
            color: "#22c55e",
          }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(34, 197, 94, 0.15)" }}
          >
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold">Sukces</p>
            <p className="text-xs opacity-80">{success}</p>
          </div>
        </div>
      )}
      {error && (
        <div
          className="p-4 rounded-2xl border flex items-center gap-3 animate-fade-in"
          style={{
            background: "rgba(239, 68, 68, 0.08)",
            borderColor: "rgba(239, 68, 68, 0.3)",
            color: "#ef4444",
          }}
        >
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <Section
        icon={<Smartphone className="w-5 h-5" />}
        title="Urządzenie"
        subtitle="Typ, marka, model, IMEI"
        open={openSections.device}
        onToggle={() => toggleSection("device")}
        accent="#0EA5E9"
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
          {DEVICE_TYPES.map((t) => {
            const Icon = t.icon;
            const active = type === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className="p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all duration-200 hover:scale-105"
                style={{
                  background: active
                    ? `linear-gradient(135deg, ${t.color}22, ${t.color}11)`
                    : "var(--bg-surface)",
                  borderColor: active ? t.color : "var(--border-subtle)",
                  color: active ? t.color : "var(--text-muted)",
                }}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium">{t.label}</span>
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            icon={<Tag className="w-4 h-4" />}
            label="Marka"
            value={brand}
            onChange={setBrand}
            placeholder="Apple, Samsung, Xiaomi…"
          />
          <Input
            icon={<Smartphone className="w-4 h-4" />}
            label="Model"
            value={model}
            onChange={setModel}
            placeholder="iPhone 15 Pro"
          />
          <Input
            icon={<ScanLine className="w-4 h-4" />}
            label="IMEI / SN"
            value={imei}
            onChange={setImei}
            placeholder="15 cyfr"
            mono
          />
          <Input
            icon={<Palette className="w-4 h-4" />}
            label="Kolor"
            value={color}
            onChange={setColor}
            placeholder="Black, Titanium…"
          />
        </div>
      </Section>

      <Section
        icon={<Lock className="w-5 h-5" />}
        title="Blokada urządzenia"
        subtitle="Typ blokady i kod / wzór"
        open={openSections.lock}
        onToggle={() => toggleSection("lock")}
        accent="#A855F7"
      >
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
          {LOCK_TYPES.map((t) => {
            const Icon = t.icon;
            const active = lockType === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setLockType(t.value)}
                className="p-2 rounded-lg border flex flex-col items-center gap-1 transition-all duration-200 hover:scale-105"
                style={{
                  background: active
                    ? "linear-gradient(135deg, rgba(168, 85, 247, 0.15), rgba(168, 85, 247, 0.05))"
                    : "var(--bg-surface)",
                  borderColor: active ? "#A855F7" : "var(--border-subtle)",
                  color: active ? "#A855F7" : "var(--text-muted)",
                }}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[11px] font-medium leading-tight text-center">
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
        {lockType !== "none" && (
          <div className="space-y-3 animate-fade-in">
            <Input
              icon={<KeyRound className="w-4 h-4" />}
              label="Kod / wzór odblokowania"
              value={lockCode}
              onChange={setLockCode}
              placeholder={
                lockType === "pin"
                  ? "1234"
                  : lockType === "pattern"
                    ? "L-shape, Z-shape, opisz wzór"
                    : "Wpisz hasło / opis"
              }
              mono
            />
            <Input
              icon={<UserIcon className="w-4 h-4" />}
              label="Konto zalogowane (Apple ID, Google, Samsung)"
              value={signedInAccount}
              onChange={setSignedInAccount}
              placeholder="apple@icloud.com lub Google account"
            />
          </div>
        )}
      </Section>

      <Section
        icon={<Package className="w-5 h-5" />}
        title="Akcesoria"
        subtitle={
          accessories.length > 0
            ? `${accessories.length} pozycji do zwrotu`
            : "Co klient zostawia razem z urządzeniem?"
        }
        open={openSections.accessories}
        onToggle={() => toggleSection("accessories")}
        accent="#22C55E"
      >
        <div className="flex flex-wrap gap-2">
          {ACCESSORIES.map((a) => {
            const active = accessories.includes(a.value);
            return (
              <button
                key={a.value}
                type="button"
                onClick={() => toggleAccessory(a.value)}
                className="px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-200 hover:scale-105 flex items-center gap-1.5"
                style={{
                  background: active
                    ? "linear-gradient(135deg, #22C55E, #16A34A)"
                    : "var(--bg-surface)",
                  borderColor: active ? "#22C55E" : "var(--border-subtle)",
                  color: active ? "#fff" : "var(--text-muted)",
                }}
              >
                {active && <CheckCircle2 className="w-3.5 h-3.5" />}
                {a.label}
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        icon={<CheckCircle2 className="w-5 h-5" />}
        title="Checklista przyjęcia"
        subtitle="Stan urządzenia w momencie przyjęcia"
        open={openSections.checklist}
        onToggle={() => toggleSection("checklist")}
        accent="#F59E0B"
      >
        <div className="space-y-3">
          <ChoiceRow
            icon={<Smartphone className="w-4 h-4" />}
            label="Stan ekranu"
            value={checklist.screen}
            onChange={(v) => setChecklist({ ...checklist, screen: v })}
            options={SCREEN_OPTIONS}
          />
          <ChoiceRow
            icon={<TabletSmartphone className="w-4 h-4" />}
            label="Stan obudowy"
            value={checklist.body}
            onChange={(v) => setChecklist({ ...checklist, body: v })}
            options={BODY_OPTIONS}
          />
          <ChoiceRow
            icon={<Battery className="w-4 h-4" />}
            label="Bateria"
            value={checklist.battery_health}
            onChange={(v) =>
              setChecklist({ ...checklist, battery_health: v })
            }
            options={BATTERY_OPTIONS}
          />
          <ChoiceRow
            icon={<Wrench className="w-4 h-4" />}
            label="Porty / złącza"
            value={checklist.ports}
            onChange={(v) => setChecklist({ ...checklist, ports: v })}
            options={PORT_OPTIONS}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <BoolToggle
              icon={<Zap className="w-4 h-4" />}
              label="Włącza się"
              value={checklist.powers_on}
              onChange={(v) => setChecklist({ ...checklist, powers_on: v })}
              positiveColor="#22C55E"
              negativeColor="#EF4444"
            />
            <BoolToggle
              icon={<TouchpadOff className="w-4 h-4" />}
              label="Ekran reaguje"
              value={checklist.screen_responds}
              onChange={(v) =>
                setChecklist({ ...checklist, screen_responds: v })
              }
              positiveColor="#22C55E"
              negativeColor="#EF4444"
            />
            <BoolToggle
              icon={<Droplets className="w-4 h-4" />}
              label="Ślady wody / korozja"
              value={checklist.water_damage}
              onChange={(v) =>
                setChecklist({ ...checklist, water_damage: v })
              }
              positiveColor="#EF4444"
              negativeColor="#22C55E"
              positiveLabel="TAK"
              negativeLabel="NIE"
            />
            <BoolToggle
              icon={<Shield className="w-4 h-4" />}
              label="Klient ma backup"
              value={checklist.customer_backup}
              onChange={(v) =>
                setChecklist({ ...checklist, customer_backup: v })
              }
              positiveColor="#22C55E"
              negativeColor="#F59E0B"
            />
          </div>
          <BoolToggle
            icon={<AlertCircle className="w-4 h-4" />}
            label="Klient zgadza się na reset do ustawień fabrycznych jeśli niezbędny"
            value={checklist.reset_consent}
            onChange={(v) =>
              setChecklist({ ...checklist, reset_consent: v })
            }
            positiveColor="#22C55E"
            negativeColor="#F59E0B"
          />
        </div>
      </Section>

      <Section
        icon={<FileImage className="w-5 h-5" />}
        title="Opis usterki + wycena"
        subtitle="Co zgłasza klient"
        open={openSections.description}
        onToggle={() => toggleSection("description")}
        accent="#06B6D4"
      >
        <div className="space-y-3">
          <Textarea
            value={description}
            onChange={setDescription}
            placeholder="Co przestało działać? Kiedy się zaczęło? Czy klient próbował naprawić sam?"
            rows={3}
          />
          <Input
            icon={<Tag className="w-4 h-4" />}
            label="Wycena orientacyjna (PLN)"
            value={amountEstimate}
            onChange={setAmountEstimate}
            type="number"
            placeholder="0.00"
          />
        </div>
      </Section>

      <Section
        icon={<UserIcon className="w-5 h-5" />}
        title="Klient"
        subtitle="Kontakt do powiadomień Chatwoot"
        open={openSections.customer}
        onToggle={() => toggleSection("customer")}
        accent="#EC4899"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            icon={<UserIcon className="w-4 h-4" />}
            label="Imię"
            value={customerFirstName}
            onChange={setCustomerFirstName}
          />
          <Input
            icon={<UserIcon className="w-4 h-4" />}
            label="Nazwisko"
            value={customerLastName}
            onChange={setCustomerLastName}
          />
          <Input
            icon={<Phone className="w-4 h-4" />}
            label="Telefon"
            value={contactPhone}
            onChange={setContactPhone}
            placeholder="+48 …"
          />
          <Input
            icon={<UserIcon className="w-4 h-4" />}
            label="Email"
            value={contactEmail}
            onChange={setContactEmail}
            type="email"
          />
        </div>
      </Section>

      <Section
        icon={<FileImage className="w-5 h-5" />}
        title="Zdjęcia"
        subtitle={`${photos.length} z 5 dodanych`}
        open={openSections.photos}
        onToggle={() => toggleSection("photos")}
        accent="#8B5CF6"
      >
        <PhotosUpload photos={photos} onChange={setPhotos} />
      </Section>

      <div
        className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 border-t backdrop-blur-md flex justify-between items-center gap-2"
        style={{
          background: "var(--bg-header)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <button
          type="button"
          onClick={reset}
          disabled={saving}
          className="px-4 py-2 rounded-xl text-sm font-medium border transition-colors hover:bg-[var(--bg-surface)]"
          style={{
            background: "transparent",
            borderColor: "var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          Wyczyść
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 shadow-lg transition-all hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, var(--accent), #2563eb)",
            color: "#fff",
          }}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
          {saving ? "Zapisywanie…" : "Utwórz zlecenie"}
        </button>
      </div>
    </form>
  );
}

function Section({
  icon,
  title,
  subtitle,
  open,
  onToggle,
  accent,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border overflow-hidden transition-all"
      style={{
        background: "var(--bg-card)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-3 transition-colors hover:bg-[var(--bg-surface)]/50"
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, ${accent}22, ${accent}11)`,
            color: accent,
          }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-semibold" style={{ color: "var(--text-main)" }}>
            {title}
          </p>
          {subtitle && (
            <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
              {subtitle}
            </p>
          )}
        </div>
        {open ? (
          <ChevronDown className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
        ) : (
          <ChevronRight className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 animate-fade-in">{children}</div>
      )}
    </div>
  );
}

function Input({
  icon,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  mono,
}: {
  icon?: React.ReactNode;
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
        className="block text-xs font-medium mb-1.5"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </span>
      <div className="relative">
        {icon && (
          <div
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--text-muted)" }}
          >
            {icon}
          </div>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full ${icon ? "pl-9" : "pl-3"} pr-3 py-2 rounded-xl border text-sm outline-none transition-colors focus:border-[var(--accent)] ${
            mono ? "font-mono" : ""
          }`}
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-main)",
          }}
        />
      </div>
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
      className="w-full px-3 py-2 rounded-xl border text-sm outline-none resize-none transition-colors focus:border-[var(--accent)]"
      style={{
        background: "var(--bg-surface)",
        borderColor: "var(--border-subtle)",
        color: "var(--text-main)",
      }}
    />
  );
}

function ChoiceRow({
  icon,
  label,
  value,
  onChange,
  options,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  options: { value: string; label: string; color: string }[];
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        {icon && (
          <span style={{ color: "var(--text-muted)" }}>{icon}</span>
        )}
        <span
          className="text-xs font-medium"
          style={{ color: "var(--text-muted)" }}
        >
          {label}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className="px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all duration-200 hover:scale-105"
              style={{
                background: active
                  ? `linear-gradient(135deg, ${o.color}33, ${o.color}11)`
                  : "var(--bg-surface)",
                borderColor: active ? o.color : "var(--border-subtle)",
                color: active ? o.color : "var(--text-muted)",
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BoolToggle({
  icon,
  label,
  value,
  onChange,
  positiveColor = "#22C55E",
  negativeColor = "#EF4444",
  positiveLabel = "TAK",
  negativeLabel = "NIE",
}: {
  icon?: React.ReactNode;
  label: string;
  value: boolean | undefined;
  onChange: (v: boolean) => void;
  positiveColor?: string;
  negativeColor?: string;
  positiveLabel?: string;
  negativeLabel?: string;
}) {
  return (
    <div
      className="p-2.5 rounded-xl border flex items-center justify-between gap-2"
      style={{
        background: "var(--bg-surface)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {icon && (
          <span style={{ color: "var(--text-muted)" }}>{icon}</span>
        )}
        <span
          className="text-xs font-medium truncate"
          style={{ color: "var(--text-main)" }}
        >
          {label}
        </span>
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={() => onChange(false)}
          className="px-2 py-1 rounded text-[10px] font-bold transition-all"
          style={{
            background:
              value === false
                ? `linear-gradient(135deg, ${negativeColor}, ${negativeColor}dd)`
                : "transparent",
            color: value === false ? "#fff" : "var(--text-muted)",
            border:
              value === false
                ? `1px solid ${negativeColor}`
                : "1px solid var(--border-subtle)",
          }}
        >
          {negativeLabel}
        </button>
        <button
          type="button"
          onClick={() => onChange(true)}
          className="px-2 py-1 rounded text-[10px] font-bold transition-all"
          style={{
            background:
              value === true
                ? `linear-gradient(135deg, ${positiveColor}, ${positiveColor}dd)`
                : "transparent",
            color: value === true ? "#fff" : "var(--text-muted)",
            border:
              value === true
                ? `1px solid ${positiveColor}`
                : "1px solid var(--border-subtle)",
          }}
        >
          {positiveLabel}
        </button>
      </div>
    </div>
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
    <div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {photos.map((url, idx) => (
          <div
            key={idx}
            className="relative aspect-square rounded-xl overflow-hidden border group"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt=""
              className="w-full h-full object-cover transition-transform group-hover:scale-110"
            />
            <button
              type="button"
              onClick={() => onChange(photos.filter((_, i) => i !== idx))}
              className="absolute top-1 right-1 p-1 rounded-lg bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        {photos.length < 5 && (
          <label
            className={`aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center text-xs gap-1 cursor-pointer transition-all hover:scale-105 ${
              uploading ? "opacity-50 pointer-events-none" : ""
            }`}
            style={{
              borderColor: "var(--border-subtle)",
              color: "var(--text-muted)",
            }}
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <FileImage className="w-5 h-5" />
            )}
            <span>{uploading ? "Wgrywanie…" : "+ Dodaj"}</span>
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
