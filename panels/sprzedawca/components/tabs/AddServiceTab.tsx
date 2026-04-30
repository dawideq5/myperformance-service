"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Box as BoxIcon,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Lock,
  Smartphone,
  Sparkles,
  User as UserIcon,
  Wrench,
} from "lucide-react";
import { BrandPicker, BRANDS } from "../intake/BrandPicker";
import { ImeiField } from "../intake/ImeiField";
import { ColorPicker, NAMED_COLORS } from "../intake/ColorPicker";
import { LockSection } from "../intake/LockSection";
import { PhoneInputWithFlags } from "../intake/PhoneInputWithFlags";
// ChecklistSection — pytania przeniesione do konfiguratora 3D (P21).
import {
  PhoneConfigurator3D,
  type VisualConditionState,
} from "../intake/PhoneConfigurator3D";
import {
  DescriptionPicker,
  EXPERTISE_VALUE,
  CLEANING_VALUE,
  deserializeRepairTypes,
  serializeRepairTypes,
} from "../intake/DescriptionPicker";
import { QuotePreview } from "../intake/QuotePreview";
import {
  openServiceReceipt,
  sendElectronicReceipt,
} from "../../lib/receipt";

export function AddServiceTab({
  locationId,
  editingServiceId,
  onEditDone,
}: {
  locationId: string;
  editingServiceId?: string | null;
  onEditDone?: () => void;
}) {
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [imei, setImei] = useState("");
  const [color, setColor] = useState("");
  // Lock: pusty default — user musi aktywnie wybrać. "none/pin/pattern" pojawi
  // się dopiero po kliknięciu opcji.
  const [lockType, setLockType] = useState("");
  const [lockCode, setLockCode] = useState("");
  // Checklist + charging są teraz częścią VisualConditionState — pytania
  // zadawane wewnątrz konfiguratora 3D, nie w osobnej sekcji formularza.
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
  // Gdy klient podpisał elektronicznie, blokujemy edycję emaila —
  // zmiana po podpisie znaczyłaby że dokument trafił na inny adres
  // niż osoba która zaakceptowała warunki.
  const [emailLocked, setEmailLocked] = useState(false);
  // Potwierdzenie odbioru (P29-C2): jeden wybór — albo "bez dodatków"
  // albo "wpisz pobrane przedmioty" + textarea.
  type HandoverChoice = "none" | "items" | null;
  const [handoverChoice, setHandoverChoice] = useState<HandoverChoice>(null);
  const [handoverItems, setHandoverItems] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ID + handover snapshot ostatniego utworzonego zlecenia — używane do
  // otwierania potwierdzenia po stworzeniu. Reset po Wyczyść.
  const [lastCreated, setLastCreated] = useState<{
    id: string;
    handover: { choice: "none" | "items"; items: string };
  } | null>(null);
  const [cleaningPrice, setCleaningPrice] = useState<number | null>(null);
  const [expertisePrice, setExpertisePrice] = useState<number>(100);
  const [cleaningOptions, setCleaningOptions] = useState<
    Array<{
      code: string;
      name: string;
      price: number;
      description: string | null;
    }>
  >([]);
  // Dialog "Wystawić aneks?" pokazywany po edycji która zmieniła pole
  // significant (kwota wyceny, diagnoza, gwarancja). Decyzja: pobierz PDF
  // (przyciski drukuj/wyślij), albo pomiń.
  const [annexPrompt, setAnnexPrompt] = useState<{
    serviceId: string;
    ticketNumber: string;
  } | null>(null);

  // Punkt serwisowy: lista wszystkich service-locations + auto-prefill
  // domyślnego (powiązanego z punktem sprzedaży locationId).
  const [serviceLocations, setServiceLocations] = useState<
    Array<{ id: string; name: string; address: string | null }>
  >([]);
  const [defaultServiceLocationId, setDefaultServiceLocationId] = useState<
    string | null
  >(null);
  const [chosenServiceLocationId, setChosenServiceLocationId] = useState<
    string | null
  >(null);
  const [salesRequiresTransport, setSalesRequiresTransport] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await fetch(
          `/api/relay/service-locations?salesLocationId=${encodeURIComponent(locationId)}`,
        );
        if (!r.ok) return;
        const j = (await r.json()) as {
          services: Array<{
            id: string;
            name: string;
            address: string | null;
          }>;
          defaultServiceId: string | null;
          requiresTransport: boolean;
        };
        if (!alive) return;
        setServiceLocations(j.services ?? []);
        setDefaultServiceLocationId(j.defaultServiceId ?? null);
        setSalesRequiresTransport(j.requiresTransport === true);
        setChosenServiceLocationId((prev) => prev ?? j.defaultServiceId ?? null);
      } catch {
        /* ignore — backend ustawi domyślny serwis przy create */
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  // Sekcje rozwijane — sekwencyjne gating: tylko pierwsza sekcja otwarta na
  // start; kolejne odblokowują się gdy poprzednia jest complete.
  const [open, setOpen] = useState<Record<string, boolean>>({
    device: true,
    lock: false,
    visual: false,
    description: false,
    customer: false,
    service: false,
    handover: false,
  });

  const SECTION_ORDER = [
    "device",
    "lock",
    "visual",
    "description",
    "customer",
    "service",
    "handover",
  ] as const;

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

  // Ekspertyza: NIE auto-fill kwoty. Cena pojawia się dopiero po
  // zaznaczeniu w sekcji SUGESTIE CEN Z CENNIKA — pracownik świadomie
  // wybiera czy zastosować cenę z cennika.
  const isExpertise = repairTypes.includes(EXPERTISE_VALUE);
  void isExpertise;

  // Edit mode: gdy editingServiceId, pobierz service detail i prefill formularz.
  useEffect(() => {
    if (!editingServiceId) return;
    void (async () => {
      try {
        const r = await fetch(`/api/relay/services/${editingServiceId}`);
        const j = await r.json();
        const s = j.service ?? j.data?.service;
        if (!s) return;
        setBrand(s.brand ?? "");
        setModel(s.model ?? "");
        setImei(s.imei ?? "");
        setColor(s.color ?? "");
        setLockType(s.lockType ?? "");
        setLockCode(s.lockCode ?? "");
        if (s.visualCondition || s.intakeChecklist) {
          setVisualCondition({
            ...(s.visualCondition ?? {}),
            ...(s.intakeChecklist ?? {}),
            charging_current: s.chargingCurrent ?? undefined,
          });
          setVisualCompleted(true);
        }
        // Deserialize description "Wymiana wyświetlacza · Bateria · Inne: ..."
        // do tablicy kodów + customText, żeby chips były pre-zaznaczone.
        const desc = s.description ?? "";
        if (desc) {
          const { codes, customText } = deserializeRepairTypes(desc);
          if (codes.length > 0) {
            setRepairTypes(codes);
            setCustomDescription(customText);
          } else {
            setCustomDescription(desc);
          }
        }
        setAmountEstimate(s.amountEstimate?.toString() ?? "");
        // Edit mode: prefill chosenServiceLocationId z istniejącego serwisu.
        // Nie nadpisuj defaultem (sales.serviceId) bo user wcześniej mógł
        // wybrać inny punkt — wybór musi być persistent.
        if (s.serviceLocationId) {
          setChosenServiceLocationId(s.serviceLocationId);
        }
        setCustomerFirstName(s.customerFirstName ?? "");
        setCustomerLastName(s.customerLastName ?? "");
        setContactPhone(s.contactPhone ?? "");
        setContactEmail(s.contactEmail ?? "");
        // Lock email when customer has signed (electronically).
        const docStatus = s.visualCondition?.documenso?.status;
        setEmailLocked(docStatus === "signed");
        // Handover from visualCondition.handover
        const h = s.visualCondition?.handover;
        if (h?.choice) {
          setHandoverChoice(h.choice);
          setHandoverItems(h.items ?? "");
        }
        // Open all sections in edit mode.
        setOpen({
          device: true,
          lock: true,
          visual: true,
          description: true,
          customer: true,
          handover: true,
        });
      } catch {
        /* ignore */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingServiceId]);

  // Pobierz cennik: wszystkie warianty CLEANING_* + EXPERTISE.
  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/relay/pricelist");
        const json = await r.json();
        const items = (json.items ?? []) as {
          code: string;
          name: string;
          price: number;
          description?: string | null;
        }[];
        const cleanings = items
          .filter((i) => i.code.startsWith("CLEANING_"))
          .map((i) => ({
            code: i.code,
            name: i.name,
            price: Number(i.price),
            description: i.description ?? null,
          }));
        setCleaningOptions(cleanings);
        const intake = cleanings.find((i) => i.code === "CLEANING_INTAKE");
        if (intake) setCleaningPrice(intake.price);
        else if (cleanings[0]) setCleaningPrice(cleanings[0].price);
        const expertise = items.find((i) => i.code === "EXPERTISE");
        if (expertise) setExpertisePrice(Number(expertise.price));
      } catch {
        /* ignore */
      }
    })();
  }, []);

  // Body color dla 3D modelu — z ColorPicker (priorytet) lub fallback na
  // brand color z BRANDS palette.
  const brandColorHex = (() => {
    // Wyszukaj wybrany kolor z NAMED_COLORS po nazwie.
    if (color.trim()) {
      const named = NAMED_COLORS.find(
        (c) => c.name.toLowerCase() === color.trim().toLowerCase(),
      );
      if (named) return named.hex;
      // Jeśli user wpisał ręcznie nazwę — fallback na default.
    }
    return (
      BRANDS.find((b) => b.value.toLowerCase() === brand.toLowerCase())?.color ??
      "#1f2937"
    );
  })();

  // Per-section completion (wszystkie wymagane pola wypełnione).
  const deviceComplete = !!(
    brand.trim() &&
    model.trim() &&
    imei.trim().length === 15 &&
    color.trim()
  );
  // Lock: pusty type = nie complete (user musi wybrać). "none" = complete.
  // pin/pattern = complete tylko z kodem.
  const lockComplete =
    lockType === "none" ||
    ((lockType === "pin" || lockType === "pattern") && !!lockCode.trim());
  const visualComplete = visualCompleted;
  const descriptionComplete = repairTypes.length > 0;
  // Phone w tym formacie zawsze ma prefix; minimum 6 cyfr lokalnego numeru.
  const phoneLocalDigits = contactPhone.replace(/^\+\d+\s*/, "").replace(/\D/g, "");
  const customerComplete = !!(
    customerFirstName.trim() &&
    customerLastName.trim() &&
    phoneLocalDigits.length >= 6
  );
  // Handover: wybór musi być dokonany. Jeśli "items" — textarea wymagana.
  const handoverComplete =
    handoverChoice === "none" ||
    (handoverChoice === "items" && handoverItems.trim().length > 0);
  // W trybie edycji nie wymuszamy ponownego "complete" wszystkich sekcji —
  // serwis już istnieje, user zmienia konkretne pola. Na zapisie wymagamy
  // tylko żeby device + customer były minimum wypełnione (bez ich PATCH
  // backend i tak by zignorował, ale to UX guard żeby nie wysłać śmieci).
  const allComplete = editingServiceId
    ? deviceComplete && customerComplete
    : deviceComplete &&
      lockComplete &&
      visualComplete &&
      descriptionComplete &&
      customerComplete &&
      handoverComplete;

  // Sequential gating — sekcja jest dostępna gdy wszystkie poprzednie
  // complete. W trybie edycji wszystko otwarte (user już wcześniej
  // utworzył zlecenie, może edytować dowolny fragment).
  const serviceComplete = chosenServiceLocationId != null;
  const sectionUnlocked: Record<string, boolean> = editingServiceId
    ? {
        device: true,
        lock: true,
        visual: true,
        description: true,
        customer: true,
        service: true,
        handover: true,
      }
    : {
        device: true,
        lock: deviceComplete,
        visual: deviceComplete && lockComplete,
        description: deviceComplete && lockComplete && visualComplete,
        customer:
          deviceComplete && lockComplete && visualComplete && descriptionComplete,
        service:
          deviceComplete &&
          lockComplete &&
          visualComplete &&
          descriptionComplete &&
          customerComplete,
        handover:
          deviceComplete &&
          lockComplete &&
          visualComplete &&
          descriptionComplete &&
          customerComplete &&
          serviceComplete,
      };

  // Toggle sekcji — tylko gdy odblokowana. Zablokowane sekcje nie reagują.
  const toggle = (k: string) => {
    if (!sectionUnlocked[k]) return;
    setOpen((s) => ({ ...s, [k]: !s[k] }));
  };

  // Auto-collapse usunięty — user chce klikać "Kontynuuj" sam, bez
  // automatycznego zwijania sekcji (czasem auto-collapse był za szybko
  // i przerywał edycję).

  const reset = () => {
    setBrand("");
    setModel("");
    setImei("");
    setColor("");
    setLockType("");
    setLockCode("");
    setVisualCondition({});
    setVisualCompleted(false);
    setRepairTypes([]);
    setCustomDescription("");
    setAmountEstimate("");
    setCustomerFirstName("");
    setCustomerLastName("");
    setContactPhone("");
    setContactEmail("");
    setHandoverChoice(null);
    setHandoverItems("");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      // Split visualCondition na pola DB:
      //   visualCondition (DB column visual_condition) — pola wizualne + cleaning
      //   intakeChecklist (DB column intake_checklist) — pytania funkcjonalne
      //   chargingCurrent (DB column charging_current) — osobna kolumna
      const v = visualCondition;
      const intakeChecklist = visualCompleted
        ? {
            powers_on: v.powers_on,
            cracked_front: v.cracked_front,
            cracked_back: v.cracked_back,
            bent: v.bent,
            face_touch_id: v.face_touch_id,
            water_damage: v.water_damage,
          }
        : {};
      const visualOnly = visualCompleted
        ? {
            display_rating: v.display_rating,
            display_notes: v.display_notes,
            back_rating: v.back_rating,
            back_notes: v.back_notes,
            camera_rating: v.camera_rating,
            camera_notes: v.camera_notes,
            frames_rating: v.frames_rating,
            frames_notes: v.frames_notes,
            cleaning_accepted: v.cleaning_accepted,
            damage_markers: v.damage_markers,
            additional_notes: v.additional_notes,
            // Persist handover w JSON visual_condition — bez schema migration.
            handover: {
              choice: handoverChoice ?? "none",
              items: handoverItems.trim(),
            },
          }
        : {
            handover: {
              choice: handoverChoice ?? "none",
              items: handoverItems.trim(),
            },
          };
      // W trybie edit: gdy user nie wybrał żadnego typu naprawy z pickera
      // (selected = []), zachowujemy customDescription jako opis (inaczej
      // serializeRepairTypes zwróciłby "" i wykasowało opis z DB).
      const descriptionPayload = (() => {
        const serialized = serializeRepairTypes(repairTypes, customDescription);
        if (serialized) return serialized;
        if (editingServiceId && customDescription.trim()) return customDescription.trim();
        return null;
      })();
      const body = {
        locationId,
        serviceLocationId: chosenServiceLocationId,
        type: "phone",
        brand: brand.trim() || null,
        model: model.trim() || null,
        imei: imei.trim() || null,
        color: color.trim() || null,
        lockType,
        lockCode: lockCode.trim() || null,
        intakeChecklist,
        chargingCurrent: v.charging_current ?? null,
        visualCondition: visualOnly,
        // Description = TYLKO wybrane typy napraw + custom text. Markery
        // mają osobne pole w DB (visual_condition.damage_markers) i są
        // renderowane w sekcji LOKALIZACJA USZKODZEŃ na PDF — nie miksuj
        // ich z opisem usterki.
        description: descriptionPayload,
        amountEstimate: amountEstimate ? Number(amountEstimate) : null,
        customerFirstName: customerFirstName.trim() || null,
        customerLastName: customerLastName.trim() || null,
        contactPhone: contactPhone.trim() || null,
        contactEmail: contactEmail.trim() || null,
      };
      // POST = utworzenie nowego zlecenia. PATCH = edycja istniejącego.
      const isEdit = !!editingServiceId;
      const url = isEdit
        ? `/api/relay/services/${editingServiceId}`
        : "/api/relay/services";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      const ticketNumber = json.service.ticketNumber as string;
      const serviceId = json.service.id as string;
      // Auto-flow: po utworzeniu/edycji od razu prowadzimy user'a do
      // dedykowanego widoku /serwis/[id]?action=sign — tam podpisuje,
      // wybiera druk/email, widzi historię. Bez pośredniego "wybierz
      // potwierdzenie" dialog.
      const significant = isEdit ? json.revision?.significant === true : false;
      // Zapisz handover w sessionStorage żeby dedykowany widok mógł
      // przekazać go do PDF/Documenso (handover nie jest persistowany
      // w DB, tylko w query).
      try {
        sessionStorage.setItem(
          `mp_handover:${serviceId}`,
          JSON.stringify({
            choice: handoverChoice ?? "none",
            items: handoverItems.trim(),
          }),
        );
      } catch {
        /* localStorage may be disabled */
      }
      // BEZ auto-flow: redirect do widoku serwisu, user decyduje co robić
      // (drukuj papier, wyślij elektronicznie, edytuj). Bez auto-trigger
      // wysyłki Documenso.
      const target = `/serwis/${serviceId}${significant ? "?resign=1" : ""}`;
      window.location.href = target;
      return;
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
            className="p-4 rounded-2xl border animate-fade-in shadow-lg"
            style={{
              background:
                "linear-gradient(135deg, rgba(34, 197, 94, 0.12), rgba(34, 197, 94, 0.04))",
              borderColor: "rgba(34, 197, 94, 0.35)",
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(34, 197, 94, 0.18)", color: "#22c55e" }}
              >
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="font-semibold" style={{ color: "#22c55e" }}>
                  Sukces
                </p>
                <p
                  className="text-xs opacity-80"
                  style={{ color: "var(--text-main)" }}
                >
                  {success}
                </p>
              </div>
            </div>
            {lastCreated && (
              <div className="mt-3 pt-3 border-t border-emerald-500/20">
                <p
                  className="text-xs uppercase tracking-wide font-semibold mb-2"
                  style={{ color: "var(--text-muted)" }}
                >
                  Wybierz potwierdzenie
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      openServiceReceipt(lastCreated.id, lastCreated.handover);
                    }}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 shadow-md transition-all hover:scale-[1.01]"
                    style={{
                      background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                      color: "#fff",
                    }}
                  >
                    Otwórz potwierdzenie
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const r = await sendElectronicReceipt(
                        lastCreated.id,
                        lastCreated.handover,
                      );
                      if (r.ok) {
                        setSuccess(
                          `Potwierdzenie elektroniczne wysłane (Documenso doc ${r.documentId})`,
                        );
                      } else {
                        setError(r.error ?? "Błąd wysyłki");
                      }
                    }}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 shadow-md transition-all hover:scale-[1.01]"
                    style={{
                      background: "linear-gradient(135deg, #06B6D4, #0891B2)",
                      color: "#fff",
                    }}
                  >
                    Wyślij elektroniczne potwierdzenie
                  </button>
                </div>
              </div>
            )}
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
          unlocked={sectionUnlocked.device}
          open={open.device}
          onToggle={() => toggle("device")}
          onContinue={editingServiceId ? undefined : () => continueToNext("device")}
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
            lockType === ""
              ? "Wybierz typ blokady"
              : lockType === "none"
                ? "Brak blokady"
                : lockType === "pin"
                  ? "Hasło / PIN"
                  : "Wzór"
          }
          accent="#A855F7"
          complete={lockComplete}
          unlocked={sectionUnlocked.lock}
          open={open.lock}
          onToggle={() => toggle("lock")}
          onContinue={editingServiceId ? undefined : () => continueToNext("lock")}
        >
          <LockSection
            lockType={lockType}
            lockCode={lockCode}
            onChangeType={setLockType}
            onChangeCode={setLockCode}
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
          accent="#9C8869"
          complete={visualComplete}
          unlocked={sectionUnlocked.visual}
          open={open.visual}
          onToggle={() => toggle("visual")}
          onContinue={editingServiceId ? undefined : () => continueToNext("visual")}
        >
          <VisualConditionSummary
            completed={visualCompleted}
            condition={visualCondition}
            cleaningPrice={cleaningPrice}
            onOpen={() => setShowConfigurator(true)}
          />
        </Section>
        </div>

        <div data-section="description">
        <Section
          icon={<Wrench className="w-5 h-5" />}
          title="Opis usterki"
          subtitle="Wybierz typy napraw + opcjonalna wycena"
          accent="#06B6D4"
          complete={descriptionComplete}
          unlocked={sectionUnlocked.description}
          open={open.description}
          onToggle={() => toggle("description")}
          onContinue={editingServiceId ? undefined : () => continueToNext("description")}
        >
          <div className="space-y-3">
            <DescriptionPicker
              selected={
                visualCondition.cleaning_accepted &&
                !repairTypes.includes(CLEANING_VALUE)
                  ? [...repairTypes, CLEANING_VALUE]
                  : repairTypes
              }
              customDescription={customDescription}
              onChange={(next) => {
                // Czyszczenie chip ↔ visualCondition.cleaning_accepted
                // (back-compat: cleaning_accepted to istniejący flag w
                // intakeChecklist używany przez QuotePreview/PDF). Toggle
                // chipa CLEANING aktualizuje visualCondition.
                const cleaningOn = next.includes(CLEANING_VALUE);
                if (cleaningOn !== !!visualCondition.cleaning_accepted) {
                  setVisualCondition((v) => ({
                    ...v,
                    cleaning_accepted: cleaningOn,
                  }));
                }
                setRepairTypes(next.filter((c) => c !== CLEANING_VALUE));
              }}
              onChangeCustom={setCustomDescription}
            />
            <QuotePreview
              brand={brand}
              model={model}
              repairTypes={repairTypes}
              cleaningSelected={!!visualCondition.cleaning_accepted}
              cleaningPrice={cleaningPrice}
              onApplyTotal={(t) => setAmountEstimate(t.toFixed(2))}
            />
            <EstimateBlock
              amountEstimate={amountEstimate}
              onChangeEstimate={setAmountEstimate}
              cleaningPrice={cleaningPrice}
              cleaningAccepted={!!visualCondition.cleaning_accepted}
            />
          </div>
        </Section>
        </div>

        <div data-section="customer">
        <Section
          icon={<UserIcon className="w-5 h-5" />}
          title="Dane klienta"
          subtitle="Imię, nazwisko, telefon, email"
          accent="#22C55E"
          complete={customerComplete}
          unlocked={sectionUnlocked.customer}
          open={open.customer}
          onToggle={() => toggle("customer")}
          onContinue={editingServiceId ? undefined : () => continueToNext("customer")}
        >
          <div className="space-y-3">
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
            </div>
            <PhoneInputWithFlags
              value={contactPhone}
              onChange={setContactPhone}
            />
            <div>
              <Input
                icon={<UserIcon className="w-4 h-4" />}
                label="Email (zalecany)"
                value={contactEmail}
                onChange={emailLocked ? () => {} : setContactEmail}
                type="email"
                placeholder="adres@example.pl"
                disabled={emailLocked}
              />
              {emailLocked && (
                <p
                  className="text-[10px] mt-1.5 px-2"
                  style={{ color: "#f59e0b" }}
                >
                  Adres zablokowany — klient już zaakceptował dokument na
                  ten adres. Aby zmienić, anuluj podpis i wyślij ponownie.
                </p>
              )}
            </div>
            <div
              className="rounded-xl border p-3 text-xs"
              style={{
                background:
                  "linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(59, 130, 246, 0.02))",
                borderColor: "rgba(59, 130, 246, 0.3)",
                color: "rgba(255, 255, 255, 0.85)",
              }}
            >
              <p
                className="font-semibold mb-1"
                style={{ color: "#3B82F6" }}
              >
                Po co adres email?
              </p>
              <ul
                className="space-y-0.5 list-disc list-inside"
                style={{ color: "var(--text-muted)" }}
              >
                <li>Elektroniczne potwierdzenie odbioru z podpisem.</li>
                <li>Powiadomienia o zmianie statusu zlecenia.</li>
                <li>Kontakt w razie pytań do diagnostyki.</li>
              </ul>
            </div>
          </div>
        </Section>
        </div>

        <div data-section="service">
        <Section
          icon={<Wrench className="w-5 h-5" />}
          title="Punkt serwisowy"
          subtitle={
            chosenServiceLocationId
              ? serviceLocations.find((s) => s.id === chosenServiceLocationId)
                  ?.name ?? "Wybrany"
              : "Wybierz punkt serwisowy realizujący naprawę"
          }
          accent="#06B6D4"
          complete={serviceComplete}
          unlocked={sectionUnlocked.service}
          open={open.service}
          onToggle={() => toggle("service")}
          onContinue={editingServiceId ? undefined : () => continueToNext("service")}
        >
          <ServiceLocationPicker
            services={serviceLocations}
            chosen={chosenServiceLocationId}
            defaultId={defaultServiceLocationId}
            requiresTransport={salesRequiresTransport}
            onChange={setChosenServiceLocationId}
          />
        </Section>
        </div>

        <div data-section="handover">
        <Section
          icon={<BoxIcon className="w-5 h-5" />}
          title="Potwierdzenie odbioru"
          subtitle="Karty pamięci, SIM, etui — zaznacz zanim oddasz urządzenie"
          accent="#F59E0B"
          complete={handoverComplete}
          unlocked={sectionUnlocked.handover}
          open={open.handover}
          onToggle={() => toggle("handover")}
        >
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                setHandoverChoice("none");
                setHandoverItems("");
              }}
              className="w-full text-left rounded-xl border p-3 transition-all"
              style={{
                background:
                  handoverChoice === "none"
                    ? "linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(34, 197, 94, 0.04))"
                    : "var(--bg-surface)",
                borderColor:
                  handoverChoice === "none"
                    ? "rgba(34, 197, 94, 0.5)"
                    : "var(--border-subtle)",
              }}
            >
              <p
                className="text-sm font-semibold mb-0.5"
                style={{
                  color:
                    handoverChoice === "none"
                      ? "#22c55e"
                      : "var(--text-main)",
                }}
              >
                Potwierdzam, że przyjmowane urządzenie nie posiada:
              </p>
              <p
                className="text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                Karty SIM · Karty SD · Etui
              </p>
            </button>

            <button
              type="button"
              onClick={() => setHandoverChoice("items")}
              className="w-full text-left rounded-xl border p-3 transition-all"
              style={{
                background:
                  handoverChoice === "items"
                    ? "linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(245, 158, 11, 0.04))"
                    : "var(--bg-surface)",
                borderColor:
                  handoverChoice === "items"
                    ? "rgba(245, 158, 11, 0.5)"
                    : "var(--border-subtle)",
              }}
            >
              <p
                className="text-sm font-semibold"
                style={{
                  color:
                    handoverChoice === "items"
                      ? "#F59E0B"
                      : "var(--text-main)",
                }}
              >
                Wpisz pobrane przedmioty od klienta
              </p>
            </button>

            {handoverChoice === "items" && (
              <div
                className="rounded-xl border p-3 space-y-2 animate-fade-in"
                style={{
                  background: "rgba(59, 130, 246, 0.06)",
                  borderColor: "rgba(59, 130, 246, 0.3)",
                }}
              >
                <p
                  className="text-xs"
                  style={{ color: "var(--text-main)", lineHeight: 1.5 }}
                >
                  Pamiętaj, do przyjęcia serwisowego powinniśmy pobrać
                  jedynie naprawiane urządzenie. Jeżeli jednak w celu
                  realizacji naprawy (np. kopii danych) lub w innym
                  uzasadnionym przypadku musisz pobrać od klienta
                  dodatkowe przedmioty — wpisz je poniżej.
                </p>
                <textarea
                  value={handoverItems}
                  onChange={(e) => setHandoverItems(e.target.value)}
                  rows={3}
                  placeholder="np. ładowarka oryginalna Apple, etui Spigen, karta SIM"
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-[var(--accent)] resize-none"
                  style={{
                    background: "var(--bg-surface)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-main)",
                  }}
                />
              </div>
            )}
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
            onClick={() => {
              if (editingServiceId && onEditDone) {
                onEditDone();
              } else {
                reset();
              }
            }}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-medium border transition-colors hover:bg-[var(--bg-surface)]"
            style={{
              background: "transparent",
              borderColor: "var(--border-subtle)",
              color: "var(--text-muted)",
            }}
          >
            {editingServiceId ? "Anuluj" : "Wyczyść"}
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
            {saving
              ? "Zapisywanie…"
              : editingServiceId
                ? "Zapisz edycję"
                : "Utwórz zlecenie"}
          </button>
        </div>
      </form>

      {showConfigurator && (
        <PhoneConfigurator3D
          brand={brand || "Telefon"}
          brandColorHex={brandColorHex}
          cleaningPrice={cleaningPrice}
          cleaningOptions={cleaningOptions}
          initial={visualCondition}
          onCancel={() => setShowConfigurator(false)}
          onComplete={(state) => {
            setVisualCondition(state);
            setVisualCompleted(true);
            setShowConfigurator(false);
          }}
        />
      )}
      {annexPrompt && (
        <AnnexPromptDialog
          ticketNumber={annexPrompt.ticketNumber}
          serviceId={annexPrompt.serviceId}
          onClose={() => {
            setAnnexPrompt(null);
            reset();
            onEditDone?.();
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
  unlocked = true,
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
  /** Czy sekcja jest dostępna. Zablokowane sekcje są wyszarzone i nie reagują
   * na klik (gating: poprzednie muszą być complete). */
  unlocked?: boolean;
  /** Show "Kontynuuj" button when section complete + collapse + open next. */
  onContinue?: () => void;
  children: React.ReactNode;
}) {
  const locked = !unlocked;
  return (
    <div
      className="rounded-2xl border overflow-hidden transition-all"
      style={{
        background: "var(--bg-card)",
        borderColor: complete
          ? "rgba(34,197,94,0.4)"
          : locked
            ? "rgba(120,120,135,0.18)"
            : "var(--border-subtle)",
        opacity: locked ? 0.55 : 1,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={locked}
        title={
          locked
            ? "Najpierw uzupełnij poprzednie sekcje"
            : open
              ? "Zwiń"
              : "Rozwiń"
        }
        className="w-full px-4 py-3 flex items-center gap-3 transition-colors hover:bg-[var(--bg-surface)]/50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: locked
              ? "rgba(120,120,135,0.12)"
              : `linear-gradient(135deg, ${accent}22, ${accent}11)`,
            color: locked ? "var(--text-muted)" : accent,
          }}
        >
          {locked ? <Lock className="w-4 h-4" /> : icon}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-semibold" style={{ color: "var(--text-main)" }}>
            {title}
          </p>
          {subtitle && (
            <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
              {locked ? "Zablokowane — uzupełnij poprzednie sekcje" : subtitle}
            </p>
          )}
        </div>
        {complete && (
          <CheckCircle2
            className="w-4 h-4 flex-shrink-0"
            style={{ color: "#22C55E" }}
          />
        )}
        {!locked &&
          (open ? (
            <ChevronDown className="w-4 h-4 ml-1" style={{ color: "var(--text-muted)" }} />
          ) : (
            <ChevronRight className="w-4 h-4 ml-1" style={{ color: "var(--text-muted)" }} />
          ))}
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

/** Buduje pełen opis usterki łącząc: typy napraw + custom opis + listę
 * markerów uszkodzeń (gdzie + opis) + dodatkowe uwagi z konfiguratora.
 * To trafia jako description do DB — jeden tekst zawiera cały kontekst. */
function buildFullDescription(
  repairTypes: string[],
  customDescription: string,
  markers: { surface?: string; description?: string }[],
  additionalNotes: string | undefined,
): string {
  const parts: string[] = [];
  const repairs = serializeRepairTypes(repairTypes, customDescription);
  if (repairs) parts.push(repairs);

  if (markers.length > 0) {
    const lines = markers.map((m, i) => {
      const surface = m.surface?.trim() || "powierzchnia";
      const desc = m.description?.trim() || "(brak opisu)";
      return `  ${i + 1}. ${surface} — ${desc}`;
    });
    parts.push(`\nUszkodzenia (${markers.length}):\n${lines.join("\n")}`);
  }

  if (additionalNotes?.trim()) {
    parts.push(`\nUwagi: ${additionalNotes.trim()}`);
  }

  return parts.join("\n").trim();
}

/** Wycena finalna sprzedawcy. Pole pojedyncze + label PLN. Rozbicie cen
 * po usługach renderuje QuotePreview (powyżej w sekcji Opis usterki). */
function EstimateBlock({
  amountEstimate,
  onChangeEstimate,
}: {
  amountEstimate: string;
  onChangeEstimate: (v: string) => void;
  /* eslint-disable @typescript-eslint/no-unused-vars */
  cleaningPrice?: number | null;
  cleaningAccepted?: boolean;
  /* eslint-enable @typescript-eslint/no-unused-vars */
}) {
  return (
    <div
      className="rounded-2xl border p-4 space-y-2"
      style={{
        background:
          "linear-gradient(135deg, rgba(14, 165, 233, 0.08), rgba(14, 165, 233, 0.02))",
        borderColor: "rgba(14, 165, 233, 0.35)",
      }}
    >
      <div className="flex items-center justify-between">
        <p
          className="text-xs uppercase tracking-wider font-semibold"
          style={{ color: "#0EA5E9" }}
        >
          Wycena
        </p>
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          PLN brutto
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="0.01"
          min="0"
          value={amountEstimate}
          onChange={(e) => onChangeEstimate(e.target.value)}
          placeholder="0.00"
          className="flex-1 px-3 py-2.5 rounded-xl border text-lg font-semibold outline-none focus:border-[var(--accent)] text-right no-spinner"
          style={{
            background: "var(--bg-surface)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-main)",
          }}
        />
        <span
          className="text-base font-semibold"
          style={{ color: "var(--text-muted)" }}
        >
          PLN
        </span>
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
  disabled = false,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
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
          disabled={disabled}
          readOnly={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full ${icon ? "pl-9" : "pl-3"} pr-3 py-2 rounded-xl border text-sm outline-none transition-colors focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-70`}
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
            background: "linear-gradient(135deg, #9C886933, #B8A88033)",
            color: "#B8A880",
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
        <ChecklistInfoCompact condition={condition} />
        {markerCount > 0 && (
          <div
            className="rounded-lg border p-2 space-y-1.5"
            style={{
              borderColor: "rgba(239, 68, 68, 0.3)",
              background: "rgba(239, 68, 68, 0.05)",
            }}
          >
            <p
              className="text-[10px] uppercase tracking-wide font-semibold"
              style={{ color: "#EF4444" }}
            >
              Markery uszkodzeń ({markerCount})
            </p>
            <ul className="space-y-1">
              {(condition.damage_markers ?? []).map((m, idx) => (
                <li key={m.id} className="flex items-start gap-1.5 text-xs">
                  <span
                    className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
                    style={{ background: "#EF4444", color: "#fff" }}
                  >
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[10px] uppercase tracking-wide"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {m.surface ?? "powierzchnia"}
                    </p>
                    <p style={{ color: "var(--text-main)" }}>
                      {m.description?.trim() || "(brak opisu)"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {cleaningSelected > 0 && (
          <div className="text-xs" style={{ color: "#22c55e" }}>
            ✓ Czyszczenie urządzenia
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

/** Mini-summary checklisty pod ratingami w VisualConditionSummary. Pokazuje
 * kluczowe odpowiedzi z testu funkcjonalnego. */
function ChecklistInfoCompact({ condition }: { condition: VisualConditionState }) {
  const items: { label: string; value: string; tone: "ok" | "bad" | "warn" }[] = [];
  if (condition.powers_on != null) {
    const labels: Record<string, string> = {
      yes: "Tak",
      no: "Nie",
      vibrates: "Wibruje",
    };
    items.push({
      label: "Włącza się",
      value: labels[condition.powers_on] ?? condition.powers_on,
      tone:
        condition.powers_on === "yes"
          ? "ok"
          : condition.powers_on === "no"
            ? "bad"
            : "warn",
    });
  }
  if (condition.cracked_front) items.push({ label: "Pęknięty z przodu", value: "Tak", tone: "bad" });
  if (condition.cracked_back) items.push({ label: "Pęknięty z tyłu", value: "Tak", tone: "bad" });
  if (condition.bent) items.push({ label: "Wygięty", value: "Tak", tone: "bad" });
  if (condition.face_touch_id === false) {
    items.push({ label: "Face / Touch ID", value: "Nie działa", tone: "bad" });
  }
  if (condition.water_damage === "yes") {
    items.push({ label: "Zalany", value: "Tak", tone: "bad" });
  } else if (condition.water_damage === "unknown") {
    items.push({ label: "Zalany", value: "Nie wiadomo", tone: "warn" });
  }
  if (condition.charging_current != null) {
    items.push({
      label: "Prąd ładowania",
      value: `${condition.charging_current.toFixed(2)} A`,
      tone: "ok",
    });
  }

  if (items.length === 0) return null;
  return (
    <div className="space-y-0.5 pt-1">
      {items.map((it) => (
        <div
          key={it.label}
          className="flex items-center justify-between text-[11px]"
          style={{ color: "var(--text-muted)" }}
        >
          <span>{it.label}</span>
          <span
            className="font-semibold"
            style={{
              color:
                it.tone === "ok"
                  ? "#22C55E"
                  : it.tone === "bad"
                    ? "#EF4444"
                    : "#F59E0B",
            }}
          >
            {it.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Dialog po edycji znaczącej (cena, diagnoza). Pyta co zrobić z aneksem:
 * pobrać/wydrukować PDF, lub pomiń. */
function AnnexPromptDialog({
  ticketNumber,
  serviceId,
  onClose,
}: {
  ticketNumber: string;
  serviceId: string;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openPdf = async (mode: "view" | "print") => {
    setBusy(true);
    setError(null);
    try {
      const url = `/api/relay/services/${serviceId}/annex`;
      const res = await fetch(url);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const w = window.open(blobUrl, "_blank");
      if (!w) {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `aneks-${ticketNumber}.pdf`;
        a.click();
      } else if (mode === "print") {
        w.addEventListener("load", () => {
          try {
            w.focus();
            w.print();
          } catch {
            /* ignore */
          }
        });
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się pobrać aneksu");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div
        className="rounded-2xl border shadow-2xl max-w-md w-full p-5"
        style={{
          background: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <h3
          className="text-lg font-semibold mb-1"
          style={{ color: "var(--text-main)" }}
        >
          Wystawić aneks?
        </h3>
        <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
          Edycja zlecenia <strong>{ticketNumber}</strong> dotyczy istotnych
          warunków (kwota / diagnoza / gwarancja). Możesz wystawić aneks dla
          klienta — dokument PDF z porównaniem stanu przed i po.
        </p>
        {error && (
          <div
            className="text-xs mb-3 px-3 py-2 rounded-lg"
            style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444" }}
          >
            {error}
          </div>
        )}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => openPdf("view")}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
            style={{
              background: "linear-gradient(135deg, var(--accent), #2563eb)",
              color: "#fff",
            }}
          >
            Otwórz aneks (PDF)
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => openPdf("print")}
            className="px-4 py-2.5 rounded-xl text-sm font-medium border"
            style={{
              background: "transparent",
              borderColor: "var(--border-subtle)",
              color: "var(--text-main)",
            }}
          >
            Otwórz i wydrukuj
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            Pomiń
          </button>
        </div>
      </div>
    </div>
  );
}

/** Dropdown wyboru punktu serwisowego (destination zlecenia). Default =
 * powiązany serwis z punktem sprzedaży (mp_locations.service_id).
 * Komunikat info: gdy wybrany inny niż default LUB sales.requires_transport,
 * urządzenie odbierze kierowca (transport job created automatically). */
function ServiceLocationPicker({
  services,
  chosen,
  defaultId,
  requiresTransport,
  onChange,
}: {
  services: Array<{ id: string; name: string; address: string | null }>;
  chosen: string | null;
  defaultId: string | null;
  requiresTransport: boolean;
  onChange: (next: string | null) => void;
}) {
  if (services.length === 0) return null;
  const isCustom = chosen != null && chosen !== defaultId;
  const showTransportNotice = isCustom || requiresTransport;
  return (
    <div
      className="rounded-2xl border p-4 space-y-3"
      style={{
        background: "var(--bg-card)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <div className="flex items-center gap-2">
        <Wrench className="w-4 h-4" style={{ color: "#06B6D4" }} />
        <span
          className="font-semibold text-sm"
          style={{ color: "var(--text-main)" }}
        >
          Punkt serwisowy
        </span>
      </div>
      <select
        value={chosen ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full px-3 py-2 rounded-xl border text-sm outline-none focus:border-[var(--accent)]"
        style={{
          background: "var(--bg-surface)",
          borderColor: "var(--border-subtle)",
          color: "var(--text-main)",
        }}
      >
        <option value="">— Wybierz punkt serwisowy —</option>
        {services.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.id === defaultId ? " (domyślny)" : ""}
            {s.address ? ` — ${s.address}` : ""}
          </option>
        ))}
      </select>
      {showTransportNotice && (
        <div
          className="rounded-xl border p-3 text-xs flex items-start gap-2"
          style={{
            background: "rgba(245, 158, 11, 0.1)",
            borderColor: "rgba(245, 158, 11, 0.4)",
            color: "#F59E0B",
          }}
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">
              {isCustom
                ? "Wybrano serwis niepowiązany z punktem zlecenia."
                : "Punkt sprzedaży wymaga transportu kurierskiego."}
            </p>
            <p style={{ color: "rgba(245, 158, 11, 0.85)" }}>
              Przygotuj urządzenie do wysyłki — zostanie odebrane przez
              kierowcę.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
