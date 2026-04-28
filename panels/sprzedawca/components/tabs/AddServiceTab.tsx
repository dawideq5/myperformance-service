"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Box as BoxIcon,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Lock,
  Palette,
  Phone,
  Smartphone,
  Sparkles,
  User as UserIcon,
  Wrench,
} from "lucide-react";
import { BrandPicker, BRANDS } from "../intake/BrandPicker";
import { ImeiField } from "../intake/ImeiField";
import { ColorPicker } from "../intake/ColorPicker";
import { LockSection } from "../intake/LockSection";
import {
  ChecklistSection,
  type ChecklistState,
} from "../intake/ChecklistSection";
import {
  PhoneConfigurator3D,
  type VisualConditionState,
} from "../intake/PhoneConfigurator3D";

export function AddServiceTab({ locationId }: { locationId: string }) {
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [imei, setImei] = useState("");
  const [color, setColor] = useState("");
  const [lockType, setLockType] = useState("none");
  const [lockCode, setLockCode] = useState("");
  const [checklist, setChecklist] = useState<ChecklistState>({});
  const [chargingCurrent, setChargingCurrent] = useState("");
  const [visualCondition, setVisualCondition] = useState<VisualConditionState>({});
  const [visualCompleted, setVisualCompleted] = useState(false);
  const [showConfigurator, setShowConfigurator] = useState(false);
  const [description, setDescription] = useState("");
  const [amountEstimate, setAmountEstimate] = useState("");
  const [customerFirstName, setCustomerFirstName] = useState("");
  const [customerLastName, setCustomerLastName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cleaningPrice, setCleaningPrice] = useState<number | null>(null);

  // Sekcje rozwijane.
  const [open, setOpen] = useState<Record<string, boolean>>({
    device: true,
    lock: true,
    checklist: true,
    visual: true,
    customer: true,
  });
  const toggle = (k: string) => setOpen((s) => ({ ...s, [k]: !s[k] }));

  // Pobierz cenę czyszczenia z cennika (mp_pricelist code=CLEANING_INTAKE).
  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/relay/pricelist");
        const json = await r.json();
        const item = (json.items ?? []).find(
          (i: { code: string; price: number }) => i.code === "CLEANING_INTAKE",
        );
        if (item) setCleaningPrice(Number(item.price));
      } catch {
        /* ignore */
      }
    })();
  }, []);

  // Hex marki dla 3D modelu — z BrandPicker palette.
  const brandColorHex =
    BRANDS.find((b) => b.value.toLowerCase() === brand.toLowerCase())?.color ??
    "#1f2937";

  const reset = () => {
    setBrand("");
    setModel("");
    setImei("");
    setColor("");
    setLockType("none");
    setLockCode("");
    setChecklist({});
    setChargingCurrent("");
    setVisualCondition({});
    setVisualCompleted(false);
    setDescription("");
    setAmountEstimate("");
    setCustomerFirstName("");
    setCustomerLastName("");
    setContactPhone("");
    setContactEmail("");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const body = {
        locationId,
        type: "phone",
        brand: brand.trim() || null,
        model: model.trim() || null,
        imei: imei.trim() || null,
        color: color.trim() || null,
        lockType,
        lockCode: lockCode.trim() || null,
        intakeChecklist: checklist,
        chargingCurrent: chargingCurrent ? Number(chargingCurrent) : null,
        visualCondition: visualCompleted ? visualCondition : {},
        description: description.trim() || null,
        amountEstimate: amountEstimate ? Number(amountEstimate) : null,
        customerFirstName: customerFirstName.trim() || null,
        customerLastName: customerLastName.trim() || null,
        contactPhone: contactPhone.trim() || null,
        contactEmail: contactEmail.trim() || null,
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
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd zapisu");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <form onSubmit={onSubmit} className="space-y-3">
        {success && (
          <div
            className="p-4 rounded-2xl border flex items-center gap-3 animate-fade-in shadow-lg"
            style={{
              background:
                "linear-gradient(135deg, rgba(34, 197, 94, 0.12), rgba(34, 197, 94, 0.04))",
              borderColor: "rgba(34, 197, 94, 0.35)",
              color: "#22c55e",
            }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(34, 197, 94, 0.18)" }}
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
          subtitle="Marka, model, IMEI, kolor"
          accent="#0EA5E9"
          open={open.device}
          onToggle={() => toggle("device")}
        >
          <div className="space-y-4">
            <BrandPicker value={brand} onChange={setBrand} />
            <Input
              icon={<Smartphone className="w-4 h-4" />}
              label="Model"
              value={model}
              onChange={setModel}
              placeholder="iPhone 15 Pro, Galaxy S24, Redmi Note 13…"
            />
            <ImeiField value={imei} onChange={setImei} />
            <ColorPicker value={color} onChange={setColor} />
          </div>
        </Section>

        <Section
          icon={<Lock className="w-5 h-5" />}
          title="Blokada urządzenia"
          subtitle={
            lockType === "none"
              ? "Brak blokady"
              : lockType === "pin"
                ? "Hasło / PIN"
                : "Wzór"
          }
          accent="#A855F7"
          open={open.lock}
          onToggle={() => toggle("lock")}
        >
          <LockSection
            lockType={lockType}
            lockCode={lockCode}
            onChangeType={setLockType}
            onChangeCode={setLockCode}
          />
        </Section>

        <Section
          icon={<CheckCircle2 className="w-5 h-5" />}
          title="Checklista przyjęcia"
          subtitle="Stan i funkcjonalność urządzenia"
          accent="#F59E0B"
          open={open.checklist}
          onToggle={() => toggle("checklist")}
        >
          <ChecklistSection
            brand={brand}
            checklist={checklist}
            chargingCurrent={chargingCurrent}
            onChangeChecklist={setChecklist}
            onChangeChargingCurrent={setChargingCurrent}
          />
        </Section>

        <Section
          icon={<Sparkles className="w-5 h-5" />}
          title="Stan wizualny urządzenia"
          subtitle={
            visualCompleted
              ? "Zapisany — możesz edytować klikając poniżej"
              : "3D walkthrough — kliknij aby rozpocząć"
          }
          accent="#EC4899"
          open={open.visual}
          onToggle={() => toggle("visual")}
        >
          <VisualConditionSummary
            completed={visualCompleted}
            condition={visualCondition}
            cleaningPrice={cleaningPrice}
            onOpen={() => setShowConfigurator(true)}
          />
        </Section>

        <Section
          icon={<Wrench className="w-5 h-5" />}
          title="Opis usterki + wycena"
          subtitle="Co zgłasza klient"
          accent="#06B6D4"
          open={open.customer}
          onToggle={() => toggle("customer")}
        >
          <div className="space-y-3">
            <label className="block">
              <span
                className="block text-xs font-medium mb-1.5"
                style={{ color: "var(--text-muted)" }}
              >
                Opis usterki
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Co przestało działać? Kiedy się zaczęło? Czy klient próbował naprawić sam?"
                rows={3}
                className="w-full px-3 py-2 rounded-xl border text-sm outline-none resize-none focus:border-[var(--accent)]"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
              />
            </label>
            <Input
              icon={<Palette className="w-4 h-4" />}
              label="Wycena orientacyjna (PLN)"
              value={amountEstimate}
              onChange={setAmountEstimate}
              type="number"
              placeholder="0.00"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                icon={<UserIcon className="w-4 h-4" />}
                label="Imię klienta"
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
          </div>
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
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            {saving ? "Zapisywanie…" : "Utwórz zlecenie"}
          </button>
        </div>
      </form>

      {showConfigurator && (
        <PhoneConfigurator3D
          brand={brand || "Telefon"}
          brandColorHex={brandColorHex}
          cleaningPrice={cleaningPrice}
          initial={visualCondition}
          onCancel={() => setShowConfigurator(false)}
          onComplete={(state) => {
            setVisualCondition(state);
            setVisualCompleted(true);
            setShowConfigurator(false);
          }}
        />
      )}
    </>
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
      {open && <div className="px-4 pb-4 pt-1 animate-fade-in">{children}</div>}
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
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
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
          className={`w-full ${icon ? "pl-9" : "pl-3"} pr-3 py-2 rounded-xl border text-sm outline-none transition-colors focus:border-[var(--accent)]`}
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

function VisualConditionSummary({
  completed,
  condition,
  cleaningPrice,
  onOpen,
}: {
  completed: boolean;
  condition: VisualConditionState;
  cleaningPrice: number | null;
  onOpen: () => void;
}) {
  if (!completed) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="w-full p-6 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all duration-200 hover:scale-[1.01] hover:bg-[var(--bg-surface)]/40"
        style={{
          borderColor: "var(--border-subtle)",
          color: "var(--text-muted)",
        }}
      >
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, #EC489922, #A855F722)",
            color: "#EC4899",
          }}
        >
          <Sparkles className="w-6 h-6" />
        </div>
        <p className="text-sm font-medium" style={{ color: "var(--text-main)" }}>
          Otwórz interaktywny konfigurator 3D
        </p>
        <p className="text-xs">
          Walkthrough po wszystkich krytycznych elementach: ekran, tył, aparaty,
          ramki, głośniki, port ładowania.
        </p>
      </button>
    );
  }

  const cleaningSelected = condition.cleaning_accepted ? 1 : 0;
  const ratings = [
    condition.display_rating,
    condition.back_rating,
    condition.camera_rating,
    condition.frames_rating,
  ].filter((v): v is number => v != null);
  const avgRating =
    ratings.length > 0
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) /
        10
      : null;

  return (
    <div className="space-y-2">
      <div
        className="p-4 rounded-2xl border flex items-start gap-3 animate-fade-in"
        style={{
          background:
            "linear-gradient(135deg, rgba(34, 197, 94, 0.08), rgba(34, 197, 94, 0.02))",
          borderColor: "rgba(34, 197, 94, 0.3)",
        }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: "rgba(34, 197, 94, 0.18)",
            color: "#22c55e",
          }}
        >
          <BoxIcon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: "#22c55e" }}>
            Stan wizualny zapisany
          </p>
          <div
            className="text-xs mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5"
            style={{ color: "var(--text-muted)" }}
          >
            {avgRating != null && (
              <span>
                Średnia: <strong>{avgRating}/10</strong>
              </span>
            )}
            {(condition.damage_markers ?? []).length > 0 && (
              <span>
                Markery: <strong>{(condition.damage_markers ?? []).length}</strong>
              </span>
            )}
            {cleaningSelected > 0 && cleaningPrice != null && (
              <span className="col-span-2">
                ✓ Czyszczenie: <strong>+{cleaningPrice} PLN</strong>
              </span>
            )}
            {condition.additional_notes && (
              <span className="col-span-2 truncate">
                💬 {condition.additional_notes}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="px-2.5 py-1 rounded-lg text-[11px] font-medium border flex-shrink-0"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-main)",
          }}
        >
          Edytuj
        </button>
      </div>
    </div>
  );
}
