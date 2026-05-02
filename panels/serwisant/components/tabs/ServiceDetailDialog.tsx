"use client";

import { useEffect, useState } from "react";
import {
  Battery,
  CheckCircle2,
  ChevronRight,
  Droplets,
  Eye,
  EyeOff,
  Fingerprint,
  Hash,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Package,
  Phone,
  ScanLine,
  Shield,
  Smartphone,
  TouchpadOff,
  User as UserIcon,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import type { IntakeChecklist, ServiceTicket } from "./ServicesBoard";

const STATUS_FLOW = [
  { from: "received", to: "diagnosing", label: "Rozpocznij diagnozę" },
  { from: "diagnosing", to: "awaiting_quote", label: "Wysłano wycenę" },
  { from: "awaiting_quote", to: "repairing", label: "Klient zaakceptował" },
  { from: "repairing", to: "testing", label: "Naprawa zakończona" },
  { from: "testing", to: "ready", label: "Gotowy do odbioru" },
  { from: "ready", to: "delivered", label: "Wydany klientowi" },
];

const STATUS_LABELS: Record<string, string> = {
  received: "Przyjęty",
  diagnosing: "Diagnoza",
  awaiting_quote: "Wycena u klienta",
  repairing: "Naprawa",
  testing: "Testy",
  ready: "Gotowy",
  delivered: "Wydany",
  cancelled: "Anulowany",
  archived: "Archiwum",
};

export function ServiceDetailDialog({
  service,
  userEmail,
  onClose,
  onUpdated,
}: {
  service: ServiceTicket;
  userEmail: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [showLockCode, setShowLockCode] = useState(false);
  const [diagnosis, setDiagnosis] = useState(service.diagnosis ?? "");
  const [amountFinal, setAmountFinal] = useState(
    service.amountFinal != null ? String(service.amountFinal) : "",
  );
  const [amountEstimate, setAmountEstimate] = useState(
    service.amountEstimate != null ? String(service.amountEstimate) : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>(service.photos ?? []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const update = async (patch: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/relay/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setSuccess("Zaktualizowano");
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Błąd zapisu");
    } finally {
      setSaving(false);
    }
  };

  const advanceStatus = (toStatus: string) => {
    void update({ status: toStatus });
  };

  const assignToMe = () => {
    void update({ assignedTechnician: userEmail });
  };

  const cancel = () => {
    if (!confirm("Anulować to zlecenie?")) return;
    void update({ status: "cancelled" });
  };

  const saveWorkInfo = () => {
    void update({
      diagnosis: diagnosis.trim() || null,
      amountEstimate: amountEstimate ? Number(amountEstimate) : null,
      amountFinal: amountFinal ? Number(amountFinal) : null,
    });
  };

  const onUploadPhoto = async (file: File) => {
    if (photos.length >= 10) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("filename", file.name);
      const r = await fetch("/api/photo-relay", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message ?? "Upload failed");
      const next = [...photos, j.data.url].slice(0, 10);
      setPhotos(next);
      await update({ photos: next });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload nieudany");
    } finally {
      setSaving(false);
    }
  };

  const requestTransport = async (kind: string) => {
    if (
      !confirm(
        kind === "pickup_to_service"
          ? "Utworzyć zlecenie odbioru tego urządzenia do serwisu?"
          : "Utworzyć zlecenie zwrotu urządzenia do klienta?",
      )
    )
      return;
    setSaving(true);
    try {
      const body = {
        kind,
        serviceId: service.id,
        sourceLocationId:
          kind === "pickup_to_service"
            ? service.locationId
            : service.serviceLocationId ?? service.locationId,
        destinationLocationId:
          kind === "pickup_to_service"
            ? service.serviceLocationId ?? service.locationId
            : null,
        destinationAddress:
          kind === "return_to_customer"
            ? `${service.customerFirstName ?? ""} ${service.customerLastName ?? ""}`.trim()
            : null,
        notes: `Zlecenie dla ${service.ticketNumber}`,
      };
      const r = await fetch("/api/relay/transport-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setSuccess(`Utworzono zlecenie ${j.job.jobNumber}`);
      await update({
        transportStatus:
          kind === "pickup_to_service" ? "pickup_pending" : "return_pending",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transport — błąd");
    } finally {
      setSaving(false);
    }
  };

  const nextSteps = STATUS_FLOW.filter((f) => f.from === service.status);

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-3xl max-h-[92vh] rounded-2xl border overflow-hidden flex flex-col"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-main)",
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-semibold">
                {service.ticketNumber}
              </span>
              <span
                className="text-[10px] uppercase font-mono px-2 py-0.5 rounded"
                style={{
                  background: "var(--bg-surface)",
                  color: "var(--text-muted)",
                }}
              >
                {STATUS_LABELS[service.status] ?? service.status}
              </span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              {[service.brand, service.model].filter(Boolean).join(" ") || "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg"
            style={{ color: "var(--text-muted)" }}
            aria-label="Zamknij"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
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

          {/* Status workflow buttons */}
          <Section title="Status">
            <div className="flex flex-wrap gap-2">
              {service.assignedTechnician !== userEmail && (
                <button
                  type="button"
                  onClick={assignToMe}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border"
                  style={{
                    background: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-main)",
                  }}
                >
                  Przypisz mnie do zlecenia
                </button>
              )}
              {nextSteps.map((step) => (
                <button
                  key={step.to}
                  type="button"
                  onClick={() => advanceStatus(step.to)}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  {step.label}
                  <ChevronRight className="w-3 h-3" />
                </button>
              ))}
              {service.status !== "delivered" &&
                service.status !== "cancelled" && (
                  <button
                    type="button"
                    onClick={cancel}
                    disabled={saving}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border"
                    style={{
                      background: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                      color: "#ef4444",
                    }}
                  >
                    Anuluj zlecenie
                  </button>
                )}
              {saving && <Loader2 className="w-4 h-4 animate-spin self-center" />}
            </div>
            {service.assignedTechnician && (
              <p
                className="text-[11px] mt-2"
                style={{ color: "var(--text-muted)" }}
              >
                Przypisany technik: {service.assignedTechnician}
              </p>
            )}
          </Section>

          {/* Klient + IMEI */}
          <Section title="Urządzenie i klient">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Field label="Marka" value={service.brand} />
              <Field label="Model" value={service.model} />
              <Field label="IMEI" value={service.imei} mono />
              <Field
                label="Klient"
                value={
                  [service.customerFirstName, service.customerLastName]
                    .filter(Boolean)
                    .join(" ") || null
                }
              />
              {service.contactPhone && (
                <a
                  href={`tel:${service.contactPhone}`}
                  className="flex items-center gap-1 text-xs"
                  style={{ color: "var(--accent)" }}
                >
                  <Phone className="w-3 h-3" />
                  {service.contactPhone}
                </a>
              )}
              {service.contactEmail && (
                <a
                  href={`mailto:${service.contactEmail}`}
                  className="flex items-center gap-1 text-xs"
                  style={{ color: "var(--accent)" }}
                >
                  <Mail className="w-3 h-3" />
                  {service.contactEmail}
                </a>
              )}
            </div>
            {service.description && (
              <div className="mt-2 pt-2 border-t" style={{ borderColor: "var(--border-subtle)" }}>
                <p
                  className="text-[11px] uppercase font-semibold mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Opis usterki (od klienta)
                </p>
                <p className="text-sm">{service.description}</p>
              </div>
            )}
          </Section>

          {/* Blokada + konto */}
          {(service.lockType !== "none" || service.signedInAccount) && (
            <Section title="Blokada / konto">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <LockTypeIcon lockType={service.lockType} />
                  <span className="text-sm font-medium">
                    {LOCK_LABELS[service.lockType] ?? service.lockType}
                  </span>
                </div>
                {service.lockCode && (
                  <div
                    className="p-2 rounded-lg flex items-center justify-between gap-2"
                    style={{ background: "var(--bg-surface)" }}
                  >
                    <code className="text-sm font-mono">
                      {showLockCode ? service.lockCode : "••••••••"}
                    </code>
                    <button
                      type="button"
                      onClick={() => setShowLockCode(!showLockCode)}
                      className="p-1 rounded hover:bg-[var(--bg-card)] transition-colors"
                      style={{ color: "var(--text-muted)" }}
                      title={showLockCode ? "Ukryj" : "Pokaż"}
                    >
                      {showLockCode ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                )}
                {service.signedInAccount && (
                  <div
                    className="text-xs p-2 rounded-lg flex items-center gap-1.5"
                    style={{
                      background: "var(--bg-surface)",
                      color: "var(--text-main)",
                    }}
                  >
                    <UserIcon className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
                    {service.signedInAccount}
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Akcesoria */}
          {service.accessories && service.accessories.length > 0 && (
            <Section title="Akcesoria do zwrotu">
              <div className="flex flex-wrap gap-1.5">
                {service.accessories.map((a) => (
                  <span
                    key={a}
                    className="px-2.5 py-1 rounded-full text-xs font-medium border flex items-center gap-1"
                    style={{
                      background: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-main)",
                    }}
                  >
                    <CheckCircle2
                      className="w-3 h-3"
                      style={{ color: "#22C55E" }}
                    />
                    {ACCESSORY_LABELS[a] ?? a}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Checklista przyjęcia */}
          {service.intakeChecklist &&
            Object.keys(service.intakeChecklist).length > 0 && (
              <Section title="Checklista przyjęcia">
                <ChecklistDisplay checklist={service.intakeChecklist} />
              </Section>
            )}

          {/* Diagnoza + wycena */}
          <Section title="Praca technika">
            <div className="space-y-2">
              <label className="block">
                <span
                  className="block text-xs font-medium mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Diagnoza
                </span>
                <textarea
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
                  style={{
                    background: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-main)",
                  }}
                  placeholder="Co znaleziono, jakie czynności wykonano…"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span
                    className="block text-xs font-medium mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Wycena (PLN)
                  </span>
                  <input
                    type="number"
                    value={amountEstimate}
                    onChange={(e) => setAmountEstimate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
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
                    Kwota końcowa (PLN)
                  </span>
                  <input
                    type="number"
                    value={amountFinal}
                    onChange={(e) => setAmountFinal(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                    style={{
                      background: "var(--bg-surface)",
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-main)",
                    }}
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={saveWorkInfo}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                Zapisz diagnozę i wycenę
              </button>
            </div>
          </Section>

          {/* Photos */}
          <Section title={`Zdjęcia (${photos.length}/10)`}>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {photos.map((url, idx) => (
                <a
                  key={idx}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="aspect-square rounded-lg overflow-hidden border block"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </a>
              ))}
              {photos.length < 10 && (
                <label
                  className="aspect-square rounded-lg border-2 border-dashed flex items-center justify-center text-xs cursor-pointer"
                  style={{
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-muted)",
                  }}
                >
                  + Dodaj
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onUploadPhoto(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          </Section>

          {/* Transport */}
          <Section title="Transport">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => requestTransport("pickup_to_service")}
                disabled={saving || service.transportStatus !== "none"}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
              >
                <Package className="w-3 h-3" />
                Zleć odbiór do serwisu
              </button>
              <button
                type="button"
                onClick={() => requestTransport("return_to_customer")}
                disabled={saving || service.status !== "ready"}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-main)",
                }}
              >
                <Package className="w-3 h-3" />
                Zleć zwrot do klienta
              </button>
            </div>
            {service.transportStatus !== "none" && (
              <p
                className="text-[11px] mt-2"
                style={{ color: "var(--text-muted)" }}
              >
                Status transportu: {service.transportStatus}
              </p>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

const LOCK_LABELS: Record<string, string> = {
  none: "Brak blokady",
  pin: "PIN",
  pattern: "Wzór",
  password: "Hasło",
  face: "Face ID",
  fingerprint: "Odcisk palca",
  multi: "Kombinowana",
};

const LOCK_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  pin: Hash,
  pattern: KeyRound,
  password: Lock,
  face: ScanLine,
  fingerprint: Fingerprint,
  multi: Shield,
};

function LockTypeIcon({ lockType }: { lockType: string }) {
  const Icon = LOCK_ICONS[lockType] ?? Lock;
  return (
    <div
      className="w-7 h-7 rounded-lg flex items-center justify-center"
      style={{
        background: "linear-gradient(135deg, #A855F722, #A855F711)",
        color: "#A855F7",
      }}
    >
      <Icon className="w-4 h-4" />
    </div>
  );
}

const ACCESSORY_LABELS: Record<string, string> = {
  kabel: "Kabel",
  ladowarka: "Ładowarka",
  etui: "Etui",
  szklo: "Szkło",
  sluchawki: "Słuchawki",
  pudelko: "Pudełko",
  instrukcja: "Instrukcja",
  tacka_sim: "Tacka SIM",
  rysik: "Rysik",
};

const SCREEN_LABELS: Record<string, { label: string; color: string }> = {
  perfect: { label: "Idealny", color: "#22C55E" },
  minor_scratches: { label: "Lekkie rysy", color: "#F59E0B" },
  cracked: { label: "Pęknięty", color: "#EF4444" },
  shattered: { label: "Roztrzaskany", color: "#991B1B" },
};

const BODY_LABELS: Record<string, { label: string; color: string }> = {
  perfect: { label: "Idealna", color: "#22C55E" },
  minor_wear: { label: "Drobne otarcia", color: "#F59E0B" },
  dents: { label: "Wgniecenia", color: "#EF4444" },
  damaged: { label: "Uszkodzona", color: "#991B1B" },
};

const BATTERY_LABELS: Record<string, { label: string; color: string }> = {
  good: { label: "Dobra", color: "#22C55E" },
  moderate: { label: "Średnia", color: "#F59E0B" },
  poor: { label: "Słaba", color: "#EF4444" },
  swollen: { label: "Spuchnięta", color: "#991B1B" },
  unknown: { label: "Nieznany", color: "#64748B" },
};

const PORT_LABELS: Record<string, { label: string; color: string }> = {
  all_working: { label: "Wszystkie OK", color: "#22C55E" },
  some_loose: { label: "Luźne", color: "#F59E0B" },
  broken: { label: "Uszkodzone", color: "#EF4444" },
  unknown: { label: "Nieznany", color: "#64748B" },
};

function ChecklistDisplay({ checklist }: { checklist: IntakeChecklist }) {
  const rows: { icon: React.ReactNode; label: string; value: React.ReactNode }[] = [];
  if (checklist.screen) {
    const m = SCREEN_LABELS[checklist.screen];
    rows.push({
      icon: <Smartphone className="w-3.5 h-3.5" />,
      label: "Ekran",
      value: m ? <Badge text={m.label} color={m.color} /> : checklist.screen,
    });
  }
  if (checklist.body) {
    const m = BODY_LABELS[checklist.body];
    rows.push({
      icon: <Wrench className="w-3.5 h-3.5" />,
      label: "Obudowa",
      value: m ? <Badge text={m.label} color={m.color} /> : checklist.body,
    });
  }
  if (checklist.battery_health) {
    const m = BATTERY_LABELS[checklist.battery_health];
    rows.push({
      icon: <Battery className="w-3.5 h-3.5" />,
      label: "Bateria",
      value: m ? <Badge text={m.label} color={m.color} /> : checklist.battery_health,
    });
  }
  if (checklist.ports) {
    const m = PORT_LABELS[checklist.ports];
    rows.push({
      icon: <Wrench className="w-3.5 h-3.5" />,
      label: "Porty",
      value: m ? <Badge text={m.label} color={m.color} /> : checklist.ports,
    });
  }
  if (checklist.powers_on != null) {
    rows.push({
      icon: <Zap className="w-3.5 h-3.5" />,
      label: "Włącza się",
      value: <BoolBadge value={checklist.powers_on} />,
    });
  }
  if (checklist.screen_responds != null) {
    rows.push({
      icon: <TouchpadOff className="w-3.5 h-3.5" />,
      label: "Ekran reaguje",
      value: <BoolBadge value={checklist.screen_responds} />,
    });
  }
  if (checklist.water_damage != null) {
    rows.push({
      icon: <Droplets className="w-3.5 h-3.5" />,
      label: "Ślady wody",
      value: <BoolBadge value={checklist.water_damage} invert />,
    });
  }
  if (checklist.customer_backup != null) {
    rows.push({
      icon: <Shield className="w-3.5 h-3.5" />,
      label: "Backup klienta",
      value: <BoolBadge value={checklist.customer_backup} />,
    });
  }
  if (checklist.reset_consent != null) {
    rows.push({
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
      label: "Zgoda na reset",
      value: <BoolBadge value={checklist.reset_consent} />,
    });
  }

  if (rows.length === 0) {
    return (
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Brak danych z checklisty.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
      {rows.map((r, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-2 p-2 rounded-lg"
          style={{ background: "var(--bg-surface)" }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span style={{ color: "var(--text-muted)" }}>{r.icon}</span>
            <span
              className="text-xs truncate"
              style={{ color: "var(--text-muted)" }}
            >
              {r.label}
            </span>
          </div>
          <div className="flex-shrink-0">{r.value}</div>
        </div>
      ))}
      {checklist.notes && (
        <div
          className="col-span-full text-xs p-2 rounded-lg"
          style={{
            background: "var(--bg-surface)",
            color: "var(--text-main)",
          }}
        >
          <span
            className="text-[10px] uppercase font-semibold mr-1"
            style={{ color: "var(--text-muted)" }}
          >
            Notatki:
          </span>
          {checklist.notes}
        </div>
      )}
    </div>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[10px] font-bold"
      style={{ background: `${color}22`, color }}
    >
      {text}
    </span>
  );
}

function BoolBadge({ value, invert }: { value: boolean; invert?: boolean }) {
  // invert=true → "true" jest negatywne (np. water_damage=true to źle)
  const isPositive = invert ? !value : value;
  const color = isPositive ? "#22C55E" : "#EF4444";
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[10px] font-bold"
      style={{ background: `${color}22`, color }}
    >
      {value ? "TAK" : "NIE"}
    </span>
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
      className="p-3 rounded-xl border"
      style={{ borderColor: "var(--border-subtle)" }}
    >
      <h3
        className="text-[11px] uppercase tracking-wider font-semibold mb-2"
        style={{ color: "var(--text-muted)" }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <p
        className="text-[10px] uppercase tracking-wider"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </p>
      <p
        className={`text-sm ${mono ? "font-mono" : ""}`}
        style={{ color: value ? "var(--text-main)" : "var(--text-muted)" }}
      >
        {value ?? "—"}
      </p>
    </div>
  );
}
