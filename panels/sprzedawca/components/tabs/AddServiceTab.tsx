"use client";

import { useEffect, useRef, useState } from "react";
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
import {
  DescriptionPicker,
  serializeRepairTypes,
} from "../intake/DescriptionPicker";

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
  const [repairTypes, setRepairTypes] = useState<string[]>([]);
  const [customDescription, setCustomDescription] = useState("");
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

  // Sequence sekcji — używana do continueToNext.
  const SECTION_ORDER = ["device", "lock", "checklist", "visual", "customer"] as const;
  const continueToNext = (current: string) => {
    const idx = SECTION_ORDER.indexOf(current as (typeof SECTION_ORDER)[number]);
    if (idx === -1) return;
    const nextKey = SECTION_ORDER[idx + 1];
    setOpen((s) => ({
      ...s,
      [current]: false,
      ...(nextKey ? { [nextKey]: true } : {}),
    }));
    // Smooth scroll do następnej sekcji.
    if (nextKey && typeof window !== "undefined") {
      setTimeout(() => {
        const el = document.querySelector(`[data-section="${nextKey}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 320);
    }
  };

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

  // Per-section completion (wszystkie wymagane pola wypełnione).
  const deviceComplete = !!(brand.trim() && model.trim() && imei.trim() && color.trim());
  const lockComplete =
    lockType === "none" || (lockType !== "none" && !!lockCode.trim());
  const checklistComplete = (() => {
    if (!checklist.powers_on) return false;
    if (checklist.bent === undefined) return false;
    if (checklist.cracked_front === undefined) return false;
    if (checklist.cracked_back === undefined) return false;
    if (brand.toLowerCase() === "apple" && checklist.face_touch_id === undefined)
      return false;
    if (!checklist.water_damage) return false;
    // Prąd ładowania wymagany tylko gdy zalanie = no.
    if (checklist.water_damage === "no" && !chargingCurrent.trim()) return false;
    return true;
  })();
  const visualComplete = visualCompleted;
  const customerComplete = !!(
    repairTypes.length > 0 &&
    customerFirstName.trim() &&
    customerLastName.trim() &&
    contactPhone.trim()
  );
  const allComplete =
    deviceComplete &&
    lockComplete &&
    checklistComplete &&
    visualComplete &&
    customerComplete;

  // Auto-collapse sekcji po complete (jeśli była otwarta — zwiń, oszczędność miejsca).
  // Jednorazowo per section, by user mógł ją otworzyć ręcznie potem.
  const prevCompletion = useRef({
    device: false,
    lock: false,
    checklist: false,
    visual: false,
    customer: false,
  });
  useEffect(() => {
    setOpen((curr) => {
      const next = { ...curr };
      if (deviceComplete && !prevCompletion.current.device && curr.device) {
        next.device = false;
      }
      if (lockComplete && !prevCompletion.current.lock && curr.lock && lockType !== "none") {
        next.lock = false;
      }
      if (checklistComplete && !prevCompletion.current.checklist && curr.checklist) {
        next.checklist = false;
      }
      if (visualComplete && !prevCompletion.current.visual && curr.visual) {
        next.visual = false;
      }
      prevCompletion.current = {
        device: deviceComplete,
        lock: lockComplete,
        checklist: checklistComplete,
        visual: visualComplete,
        customer: customerComplete,
      };
      return next;
    });
  }, [deviceComplete, lockComplete, checklistComplete, visualComplete, customerComplete, lockType]);

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
    setRepairTypes([]);
    setCustomDescription("");
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
        description: serializeRepairTypes(repairTypes, customDescription) || null,
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

        <div data-section="device">
        <Section
          icon={<Smartphone className="w-5 h-5" />}
          title="Urządzenie"
          subtitle="Marka, model, IMEI, kolor"
          accent="#0EA5E9"
          complete={deviceComplete}
          open={open.device}
          onToggle={() => toggle("device")}
          onContinue={() => continueToNext("device")}
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
        </div>

        <div data-section="lock">
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
          complete={lockComplete}
          open={open.lock}
          onToggle={() => toggle("lock")}
          onContinue={() => continueToNext("lock")}
        >
          <LockSection
            lockType={lockType}
            lockCode={lockCode}
            onChangeType={setLockType}
            onChangeCode={setLockCode}
          />
        </Section>
        </div>

        <div data-section="checklist">
        <Section
          icon={<CheckCircle2 className="w-5 h-5" />}
          title="Checklista przyjęcia"
          subtitle="Stan i funkcjonalność urządzenia"
          accent="#F59E0B"
          complete={checklistComplete}
          open={open.checklist}
          onToggle={() => toggle("checklist")}
          onContinue={() => continueToNext("checklist")}
        >
          <ChecklistSection
            brand={brand}
            checklist={checklist}
            chargingCurrent={chargingCurrent}
            onChangeChecklist={setChecklist}
            onChangeChargingCurrent={setChargingCurrent}
          />
        </Section>
        </div>

        <div data-section="visual">
        <Section
          icon={<Sparkles className="w-5 h-5" />}
          title="Stan wizualny urządzenia"
          subtitle={
            visualCompleted
              ? "Zapisany — możesz edytować klikając poniżej"
              : "3D walkthrough — kliknij aby rozpocząć"
          }
          accent="#EC4899"
          complete={visualComplete}
          open={open.visual}
          onToggle={() => toggle("visual")}
          onContinue={() => continueToNext("visual")}
        >
          <VisualConditionSummary
            completed={visualCompleted}
            condition={visualCondition}
            cleaningPrice={cleaningPrice}
            onOpen={() => setShowConfigurator(true)}
          />
        </Section>
        </div>

        <div data-section="customer">
        <Section
          icon={<Wrench className="w-5 h-5" />}
          title="Opis usterki + dane klienta"
          subtitle="Wybierz typy napraw i wpisz dane klienta"
          accent="#06B6D4"
          complete={customerComplete}
          open={open.customer}
          onToggle={() => toggle("customer")}
        >
          <div className="space-y-3">
            <DescriptionPicker
              selected={repairTypes}
              customDescription={customDescription}
              onChange={setRepairTypes}
              onChangeCustom={setCustomDescription}
            />
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
        </div>

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
            disabled={saving || !allComplete}
            title={
              !allComplete
                ? "Uzupełnij wszystkie wymagane pola we wszystkich sekcjach"
                : undefined
            }
            className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 shadow-lg transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{
              background: allComplete
                ? "linear-gradient(135deg, var(--accent), #2563eb)"
                : "rgba(120, 130, 150, 0.5)",
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
  complete,
  onContinue,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  accent: string;
  complete?: boolean;
  /** Show "Kontynuuj" button when section complete + collapse + open next. */
  onContinue?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border overflow-hidden transition-all"
      style={{
        background: "var(--bg-card)",
        borderColor: complete ? "rgba(34,197,94,0.4)" : "var(--border-subtle)",
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
        {complete && (
          <CheckCircle2
            className="w-4 h-4 flex-shrink-0"
            style={{ color: "#22C55E" }}
          />
        )}
        {open ? (
          <ChevronDown className="w-4 h-4 ml-1" style={{ color: "var(--text-muted)" }} />
        ) : (
          <ChevronRight className="w-4 h-4 ml-1" style={{ color: "var(--text-muted)" }} />
        )}
      </button>
      <div
        className="overflow-hidden transition-all duration-500 ease-in-out"
        style={{
          maxHeight: open ? "5000px" : "0px",
          opacity: open ? 1 : 0,
        }}
      >
        <div className="px-4 pb-4 pt-1">
          {children}
          {onContinue && complete && (
            <div className="flex justify-end mt-3 pt-3 border-t border-[var(--border-subtle)] animate-fade-in">
              <button
                type="button"
                onClick={onContinue}
                className="px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5 shadow-md transition-all hover:scale-[1.02]"
                style={{
                  background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
                  color: "#fff",
                }}
              >
                Kontynuuj
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
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

  const ratings: { label: string; value: number | undefined }[] = [
    { label: "Wyświetlacz", value: condition.display_rating },
    { label: "Panel tylny", value: condition.back_rating },
    { label: "Wyspa aparatów", value: condition.camera_rating },
    { label: "Ramki boczne", value: condition.frames_rating },
  ];
  const markerCount = (condition.damage_markers ?? []).length;
  const cleaningSelected = condition.cleaning_accepted ? 1 : 0;

  return (
    <div className="space-y-2">
      <div
        className="p-4 rounded-2xl border space-y-3 animate-fade-in"
        style={{
          background:
            "linear-gradient(135deg, rgba(34, 197, 94, 0.06), rgba(34, 197, 94, 0.02))",
          borderColor: "rgba(34, 197, 94, 0.3)",
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: "rgba(34, 197, 94, 0.18)",
              color: "#22c55e",
            }}
          >
            <BoxIcon className="w-5 h-5" />
          </div>
          <p className="text-sm font-semibold flex-1" style={{ color: "#22c55e" }}>
            Stan wizualny zapisany
          </p>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {ratings.map((r) => (
            <div
              key={r.label}
              className="rounded-lg p-2 flex items-center justify-between"
              style={{ background: "var(--bg-surface)" }}
            >
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {r.label}
              </span>
              <span
                className="font-mono text-xs font-bold"
                style={{
                  color:
                    r.value == null
                      ? "var(--text-muted)"
                      : r.value >= 7
                        ? "#22C55E"
                        : r.value >= 5
                          ? "#F59E0B"
                          : "#EF4444",
                }}
              >
                {r.value != null ? `${r.value}/10` : "—"}
              </span>
            </div>
          ))}
        </div>
        {markerCount > 0 && (
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            Markery uszkodzeń:{" "}
            <strong style={{ color: "var(--text-main)" }}>{markerCount}</strong>
          </div>
        )}
        {cleaningSelected > 0 && cleaningPrice != null && (
          <div className="text-xs" style={{ color: "#22c55e" }}>
            ✓ Czyszczenie: <strong>+{cleaningPrice} PLN</strong>
          </div>
        )}
        {condition.additional_notes && (
          <div
            className="text-xs pt-2 border-t"
            style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
          >
            <p
              className="text-[10px] uppercase tracking-wide mb-0.5"
              style={{ color: "var(--text-muted)" }}
            >
              Dodatkowe uwagi
            </p>
            <p style={{ color: "var(--text-main)" }}>
              {condition.additional_notes}
            </p>
          </div>
        )}
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onOpen}
            className="px-2.5 py-1 rounded-lg text-[11px] font-medium border"
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
    </div>
  );
}
