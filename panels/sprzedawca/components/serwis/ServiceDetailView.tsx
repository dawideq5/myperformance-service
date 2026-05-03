"use client";

import { useCallback, useEffect, useState } from "react";
import { subscribeToService } from "@/lib/sse-client";
import {
  ArrowLeft,
  Box,
  CheckCircle2,
  Download,
  FileText,
  Files,
  Mail,
  MapPin,
  MessageSquare,
  Printer,
  Loader2,
  AlertCircle,
  Phone,
  AtSign,
  Wrench,
  History,
  Send,
  Edit3,
} from "lucide-react";
import Link from "next/link";
import { ToastProvider, useToast } from "../ToastProvider";
import { sendElectronicReceipt } from "../../lib/receipt";
import { StatusBadge } from "@/components/StatusBadge";
import { DeviceLocationMap } from "@/components/serwis/DeviceLocationMap";
import { CzatZespoluPanel } from "@/components/serwis/CzatZespoluPanel";
import { PhoneConfigurator3D } from "@/components/intake/PhoneConfigurator3D";
import type { DamageMarker } from "@/components/intake/PhoneConfigurator3D";
import {
  formatActor,
  formatEventTimestamp,
  humanizeAction,
} from "@/lib/services/event-humanizer";
import { getStatusLabel } from "@/lib/services/status-meta";

interface ServiceDetail {
  id: string;
  ticketNumber: string;
  status: string;
  brand: string | null;
  model: string | null;
  imei: string | null;
  color: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  description: string | null;
  amountEstimate: number | null;
  locationId: string | null;
  serviceLocationId: string | null;
  assignedTechnician?: string | null;
  receivedBy?: string | null;
  createdAt: string | null;
  visualCondition?: {
    /** Markery uszkodzeń z 3D walkthrough (intake) — sprzedawca może
     *  obejrzeć je read-only w PhoneConfigurator3D viewer mode. */
    damage_markers?: DamageMarker[];
    additional_notes?: string;
    documenso?: {
      docId: number;
      status:
        | "sent"
        | "employee_signed"
        | "signed"
        | "paper_pending"
        | "paper_signed"
        | "rejected"
        | "expired";
      sentAt: string;
      employeeSignedAt?: string;
      completedAt?: string;
      previousDocIds?: number[];
      employeeSigningUrl?: string;
      signedPdfUrl?: string;
    };
    paperSigned?: {
      signedAt: string;
      signedBy: string;
      invalidatedDocId?: number;
    };
    handover?: { choice: "none" | "items"; items: string };
  };
}

interface ServiceAnnex {
  id: string;
  serviceId: string;
  ticketNumber: string | null;
  deltaAmount: number;
  reason: string;
  acceptanceMethod: string;
  acceptanceStatus: string;
  documensoDocId: number | null;
  documensoSigningUrl: string | null;
  customerName: string | null;
  note: string | null;
  pdfHash: string | null;
  createdAt: string;
  acceptedAt: string | null;
  rejectedAt: string | null;
}

const DOCUMENSO_STATUS_PHRASES: Record<
  string,
  { label: string; color: string; description: string }
> = {
  sent: {
    label: "Oczekiwanie na podpis klienta",
    color: "#06B6D4",
    description: "",
  },
  employee_signed: {
    label: "Oczekiwanie na podpis klienta",
    color: "#06B6D4",
    description: "",
  },
  signed: {
    label: "Klient podpisał",
    color: "#22C55E",
    description: "",
  },
  rejected: {
    label: "Klient odrzucił dokument",
    color: "#EF4444",
    description: "",
  },
  expired: {
    label: "Unieważnione po edycji",
    color: "#F59E0B",
    description: "",
  },
};

interface Revision {
  id: string;
  summary: string;
  isSignificant: boolean;
  changeKind: string;
  editedByName: string | null;
  createdAt: string;
  changes?: Record<string, { before: unknown; after: unknown }>;
}

interface ServiceActionEntry {
  id: string;
  action: string;
  summary: string;
  actorName: string | null;
  actorEmail?: string | null;
  createdAt: string;
  payload?: Record<string, unknown> | null;
}

interface MailMessage {
  id: number;
  status: string;
  rcptTo: string;
  subject: string;
  timestamp: number;
  bounce?: boolean;
}

export function ServiceDetailView({
  serviceId,
  initialAction,
}: {
  serviceId: string;
  initialAction: string | null;
}) {
  return (
    <ToastProvider>
      <ServiceDetailInner serviceId={serviceId} initialAction={initialAction} />
    </ToastProvider>
  );
}

function ServiceDetailInner({
  serviceId,
  initialAction,
}: {
  serviceId: string;
  initialAction: string | null;
}) {
  const toast = useToast();
  const [service, setService] = useState<ServiceDetail | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [actions, setActions] = useState<ServiceActionEntry[]>([]);
  const [mailMessages, setMailMessages] = useState<MailMessage[]>([]);
  const [annexes, setAnnexes] = useState<ServiceAnnex[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Wave 21 Faza 1A — modal 3D viewer (read-only). Pokazuje markery
  // uszkodzeń zarejestrowane przy intake.
  const [show3D, setShow3D] = useState(false);
  // Bumpowane przy SSE transport_job_* żeby DeviceLocationMap zrobił
  // re-fetch transport-jobs/locations bez full page refresh.
  const [mapRefreshKey, setMapRefreshKey] = useState(0);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [r1, r2, r3, r4, r5] = await Promise.all([
        fetch(`/api/relay/services/${serviceId}`),
        fetch(`/api/relay/services/${serviceId}/revisions`),
        fetch(`/api/relay/services/${serviceId}/actions`),
        fetch(`/api/relay/services/${serviceId}/mail-history`),
        fetch(`/api/relay/services/${serviceId}/annexes`),
      ]);
      const j1 = await r1.json();
      const j2 = await r2.json();
      const j3 = await r3.json().catch(() => ({ actions: [] }));
      const j4 = await r4.json().catch(() => ({ messages: [] }));
      const j5 = (await r5.json().catch(() => ({ annexes: [] }))) as {
        annexes?: ServiceAnnex[];
      };
      if (!r1.ok) throw new Error(j1?.error ?? `HTTP ${r1.status}`);
      const fetched = (j1.service ?? j1.data?.service) as ServiceDetail;
      // Handover z sessionStorage — przeniesiony z AddServiceTab po
      // create. Persiste'owany w visualCondition.handover (przez backend
      // przy create/edit), ale fresh transfer po create wyciągamy też
      // z session żeby PDF przy pierwszym otwarciu miał dane.
      try {
        const raw = sessionStorage.getItem(`mp_handover:${serviceId}`);
        if (raw && !fetched.visualCondition?.handover) {
          const ho = JSON.parse(raw) as {
            choice: "none" | "items";
            items: string;
          };
          fetched.visualCondition = {
            ...(fetched.visualCondition ?? {}),
            handover: ho,
          };
        }
      } catch {
        /* ignore */
      }
      setService(fetched);
      setRevisions((j2.revisions ?? []) as Revision[]);
      setActions((j3.actions ?? []) as ServiceActionEntry[]);
      setMailMessages((j4.messages ?? []) as MailMessage[]);
      setAnnexes(Array.isArray(j5.annexes) ? j5.annexes : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Błąd pobierania");
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  // Mapa wszystkich lokalizacji (sales + service) dla resolvera UUID w
  // historii edycji oraz sekcji Dostawa.
  const [serviceLocationsById, setServiceLocationsById] = useState<
    Record<string, string>
  >({});
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await fetch("/api/relay/service-locations");
        if (!r.ok) return;
        const j = (await r.json()) as {
          services?: Array<{ id: string; name: string }>;
          lookup?: Array<{ id: string; name: string; type: string }>;
        };
        if (!alive) return;
        const m: Record<string, string> = {};
        // Preferuj `lookup` (zawiera sales+service), fallback na `services`.
        const all = j.lookup ?? j.services ?? [];
        for (const s of all) m[s.id] = s.name;
        setServiceLocationsById(m);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Polling 5s w aktywnym widoku — real-time tracking statusu Documenso.
  // Pause gdy tab nieaktywny + instant refresh przy focus.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void refresh();
    };
    const id = setInterval(tick, 5_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  // Real-time SSE bus (Wave 19/Phase 1D) — uzupełnia polling instant
  // refreshem gdy serwisant/system emituje event tego serwisu.
  useEffect(() => {
    const unsub = subscribeToService(serviceId, (evt) => {
      if (
        evt.type === "status_changed" ||
        evt.type === "service_updated" ||
        evt.type === "annex_created" ||
        evt.type === "annex_accepted" ||
        evt.type === "annex_rejected" ||
        evt.type === "annex_completed" ||
        evt.type === "photo_uploaded" ||
        evt.type === "photo_deleted" ||
        evt.type === "internal_note_added" ||
        evt.type === "action_logged" ||
        evt.type === "chat_message_received" ||
        evt.type === "customer_message_sent" ||
        // Wave 21 Faza 1A — transport job events forcują re-fetch w
        // DeviceLocationMap przez bump mapRefreshKey (poniżej).
        evt.type === "transport_job_created" ||
        evt.type === "transport_job_updated"
      ) {
        void refresh();
        if (
          evt.type === "transport_job_created" ||
          evt.type === "transport_job_updated" ||
          evt.type === "status_changed" ||
          evt.type === "service_updated"
        ) {
          setMapRefreshKey((n) => n + 1);
        }
      }
    });
    return unsub;
  }, [serviceId, refresh]);

  const eDocStatus = service?.visualCondition?.documenso?.status ?? "none";
  const employeeSigningUrl =
    service?.visualCondition?.documenso?.employeeSigningUrl;
  // Backend ustawia signedPdfUrl="available" gdy dokument podpisany —
  // panel-side budujemy URL do relay endpointa.
  const signedPdfUrl = service?.visualCondition?.documenso?.signedPdfUrl
    ? `/api/relay/services/${service.id}/signed-pdf`
    : undefined;

  // Auto-flow USUNIĘTY — sprzedawca decyduje kiedy wysłać dokument.
  // Bez automatycznej wysyłki bez user gestu.
  void initialAction;

  // Detect ?signed=employee w URL (po powrocie z Documenso po podpisie
  // pracownika) — toast confirmation + clean param + force refresh.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const signed = params.get("signed");
    if (signed === "employee") {
      toast.push({
        kind: "success",
        title: "Podpis pracownika złożony",
        message: "Klient otrzyma email z prośbą o podpis.",
      });
      params.delete("signed");
      const newUrl =
        window.location.pathname +
        (params.toString() ? `?${params.toString()}` : "") +
        window.location.hash;
      window.history.replaceState({}, "", newUrl);
      void refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignPaper = useCallback(async () => {
    if (!service) return;
    setBusy(true);
    try {
      const handover = service.visualCondition?.handover;
      const params = new URLSearchParams();
      if (handover) {
        params.set("handover_choice", handover.choice);
        if (handover.items) params.set("handover_items", handover.items);
      }
      const qs = params.toString();
      const r = await fetch(
        `/api/relay/services/${service.id}/sign-paper${qs ? `?${qs}` : ""}`,
        { method: "POST" },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      // Otwórz podpisany PDF w nowej karcie do druku.
      window.open(j.signedPdfUrl, "_blank", "noopener");
      toast.push({
        kind: "success",
        title: "Dokument gotowy do druku",
        message: "Pracownik podpisany. Wydrukuj i daj klientowi do podpisu.",
      });
      await refresh();
    } catch (e) {
      toast.push({
        kind: "error",
        message: e instanceof Error ? e.message : "Błąd przygotowania PDF",
      });
    } finally {
      setBusy(false);
    }
  }, [refresh, service, toast]);

  const handleInvalidate = useCallback(async () => {
    if (!service) return;
    if (
      !window.confirm(
        "Unieważnić podpisany dokument? Po tym możesz wysłać nowy z aktualnymi danymi.",
      )
    )
      return;
    setBusy(true);
    try {
      const r = await fetch(
        `/api/relay/services/${service.id}/invalidate-electronic`,
        { method: "POST" },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      toast.push({
        kind: "success",
        message: "Dokument unieważniony. Możesz wysłać nowy.",
      });
      await refresh();
    } catch (e) {
      toast.push({
        kind: "error",
        message: e instanceof Error ? e.message : "Błąd unieważnienia",
      });
    } finally {
      setBusy(false);
    }
  }, [refresh, service, toast]);

  const handleInvalidatePaper = useCallback(async () => {
    if (!service) return;
    if (
      !window.confirm(
        "Unieważnić podpis papierowy? Wrócisz do wyboru wersji papierowej / elektronicznej.",
      )
    )
      return;
    setBusy(true);
    try {
      const r = await fetch(
        `/api/relay/services/${service.id}/invalidate-paper`,
        { method: "POST" },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      toast.push({
        kind: "success",
        message: "Wersja papierowa unieważniona.",
      });
      await refresh();
    } catch (e) {
      toast.push({
        kind: "error",
        message: e instanceof Error ? e.message : "Błąd unieważnienia",
      });
    } finally {
      setBusy(false);
    }
  }, [refresh, service, toast]);

  const handlePaperSigned = useCallback(async () => {
    if (!service) return;
    setBusy(true);
    const tid = toast.push({
      kind: "progress",
      message: "Oznaczam jako podpisane papierowo…",
      sticky: true,
    });
    try {
      const r = await fetch(`/api/relay/services/${service.id}/paper-signed`, {
        method: "POST",
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      toast.update(tid, {
        kind: "success",
        title: "Podpisano papierowo",
        message: j.invalidatedDocId
          ? `Wersja elektroniczna #${j.invalidatedDocId} została unieważniona.`
          : "Zlecenie zatwierdzone.",
        sticky: false,
      });
      await refresh();
    } catch (e) {
      toast.update(tid, {
        kind: "error",
        message: e instanceof Error ? e.message : "Błąd zapisu",
        sticky: false,
      });
    } finally {
      setBusy(false);
    }
  }, [refresh, service, toast]);

  const handleEmail = useCallback(
    async (force = false) => {
      if (!service) return;
      setBusy(true);
      try {
        const r = await sendElectronicReceipt(
          service.id,
          service.visualCondition?.handover,
          force,
        );
        if (r.ok) {
          toast.push({
            kind: "success",
            message: r.reminder
              ? "Wysłano przypomnienie do klienta."
              : "Wysłano potwierdzenie do klienta.",
          });
          await refresh();
        } else {
          toast.push({
            kind: "error",
            message: r.error ?? "Nie udało się wysłać",
          });
        }
      } catch (e) {
        toast.push({
          kind: "error",
          message: e instanceof Error ? e.message : "Nie udało się wysłać",
        });
      } finally {
        setBusy(false);
      }
    },
    [refresh, service, toast],
  );

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--bg-main)" }}
      >
        <Loader2
          className="w-8 h-8 animate-spin"
          style={{ color: "var(--text-muted)" }}
        />
      </div>
    );
  }

  if (error || !service) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ background: "var(--bg-main)" }}
      >
        <div
          className="max-w-md w-full p-6 rounded-2xl border text-center"
          style={{
            background: "var(--bg-card)",
            borderColor: "var(--border-subtle)",
            color: "var(--text-main)",
          }}
        >
          <AlertCircle className="w-10 h-10 mx-auto mb-3 text-red-400" />
          <p className="font-semibold mb-2">Nie udało się pobrać zlecenia</p>
          <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
            {error ?? "Nieznany błąd"}
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm"
            style={{ color: "var(--accent)" }}
          >
            <ArrowLeft className="w-4 h-4" />
            Powrót
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--bg-main)" }}
    >
      <header
        className="border-b backdrop-blur-md sticky top-0 z-10"
        style={{
          background: "var(--bg-header)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="flex-shrink-0 p-2 rounded-lg flex items-center gap-2 text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="hidden sm:inline">Lista zleceń</span>
          </Link>
          <div className="flex items-center gap-3 min-w-0">
            {/* StatusBadge — Wave 21 Faza 1A. Spójne PL etykiety + ikona +
             *  tone color z `lib/serwisant/status-meta`. Mirror panelu
             *  serwisanta. */}
            <StatusBadge status={service.status} size="md" />
            <p
              className="font-mono font-bold truncate"
              style={{ color: "var(--text-main)" }}
            >
              {service.ticketNumber}
            </p>
          </div>
          <span />

        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEWA — info + akcje */}
        <section className="lg:col-span-2 space-y-4">
          {(eDocStatus === "sent" || eDocStatus === "employee_signed") &&
            !service.visualCondition?.paperSigned && (
              <DocumentSigningCard
                status={eDocStatus}
                signedPdfUrl={signedPdfUrl}
                employeeSigningUrl={employeeSigningUrl}
              />
            )}

          <ActionsCard
            eDocStatus={eDocStatus}
            hasEmail={!!service.contactEmail}
            busy={busy}
            onSignPaper={() => void handleSignPaper()}
            onEmail={() => void handleEmail(false)}
            onResend={() => void handleEmail(true)}
            onInvalidateElectronic={() => void handleInvalidate()}
            onInvalidatePaper={() => void handleInvalidatePaper()}
            signedPdfUrl={signedPdfUrl}
            paperSigned={!!service.visualCondition?.paperSigned}
            paperSignedAt={service.visualCondition?.paperSigned?.signedAt}
            onPaperSigned={() => void handlePaperSigned()}
          />

          <Card icon={<Wrench className="w-4 h-4" />} title="Urządzenie">
            <Row label="Marka" value={service.brand} />
            <Row label="Model" value={service.model} />
            <Row label="IMEI" value={service.imei} mono />
            <Row label="Kolor" value={service.color} />
          </Card>

          <Card icon={<Phone className="w-4 h-4" />} title="Klient">
            <Row
              label="Imię i nazwisko"
              value={
                [service.customerFirstName, service.customerLastName]
                  .filter(Boolean)
                  .join(" ") || "—"
              }
            />
            <Row label="Telefon" value={service.contactPhone} />
            <Row label="Email" value={service.contactEmail} />
          </Card>

          <Card icon={<Edit3 className="w-4 h-4" />} title="Opis usterki">
            <p
              className="text-sm whitespace-pre-wrap"
              style={{ color: "var(--text-main)" }}
            >
              {service.description ?? "—"}
            </p>
            {service.amountEstimate != null && (
              <div
                className="mt-3 pt-3 border-t flex justify-between items-center"
                style={{
                  borderColor: "var(--border-subtle)",
                }}
              >
                <span
                  className="text-xs uppercase tracking-wider font-semibold"
                  style={{ color: "var(--text-muted)" }}
                >
                  Wycena
                </span>
                <span
                  className="text-2xl font-bold"
                  style={{ color: "#ffffff" }}
                >
                  {service.amountEstimate.toFixed(2)} PLN
                </span>
              </div>
            )}
          </Card>

          {(service.serviceLocationId || service.locationId) && (
            <Card icon={<Send className="w-4 h-4" />} title="Dostawa">
              {service.locationId && (
                <Row
                  label="Punkt sprzedaży"
                  value={
                    serviceLocationsById[service.locationId] ??
                    service.locationId
                  }
                />
              )}
              {service.serviceLocationId && (
                <Row
                  label="Punkt serwisowy"
                  value={
                    serviceLocationsById[service.serviceLocationId] ??
                    service.serviceLocationId
                  }
                />
              )}
              {service.locationId &&
                service.serviceLocationId &&
                service.serviceLocationId !== service.locationId && (
                  <p
                    className="text-[11px] mt-2"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Zlecenie zostało skierowane na punkt serwisowy inny niż
                    domyślny — odbiór realizuje kierowca.
                  </p>
                )}
            </Card>
          )}

          {/* Wave 21 Faza 1A — Stan urządzenia (3D viewer read-only). */}
          <Device3DCard
            hasMarkers={
              (service.visualCondition?.damage_markers?.length ?? 0) > 0
            }
            onShow={() => setShow3D(true)}
          />

          {/* Wave 21 Faza 1A — Mapa lokalizacji urządzenia. Pokazuje
           *  marker w lokacji obecnego pobytu lub trasę transportu. */}
          <Card
            icon={<MapPin className="w-4 h-4" />}
            title="Lokalizacja urządzenia"
          >
            <DeviceLocationMap
              serviceId={service.id}
              locationId={service.locationId}
              serviceLocationId={service.serviceLocationId}
              refreshKey={mapRefreshKey}
            />
          </Card>

          {/* Wave 21 Faza 1A — Dokumenty zlecenia (aneksy MVP; receipt +
           *  handover są pokazywane w sekcji Documenso obok). Faza 1B
           *  rozszerzy o pełną tabelę mp_service_documents. */}
          <DocumentsCard
            serviceId={service.id}
            annexes={annexes}
          />
        </section>

        {/* PRAWA — historia, status documenso */}
        <aside className="space-y-4">
          {!service.visualCondition?.paperSigned && (
            <DocumensoStatusCard
              documenso={service.visualCondition?.documenso}
            />
          )}
          <ActionsLogCard actions={actions} />
          <MailHistoryCard messages={mailMessages} />
          <HistoryCard
            revisions={revisions}
            serviceLocationsById={serviceLocationsById}
          />
        </aside>

        {/* Wave 21 Faza 1A — Czat zespołu (sprzedawca↔serwisant). Embedded
         *  ze sprzedawca panelu, port `CzatZespoluTab` z serwisanta bez
         *  zależności od `ServiceTicket`. Full-width pod gridem. */}
        <section className="lg:col-span-3">
          <div
            className="text-xs uppercase font-bold tracking-wider mb-2 flex items-center gap-2"
            style={{ color: "var(--text-muted)" }}
          >
            <MessageSquare className="w-4 h-4" />
            Czat zespołu
          </div>
          <CzatZespoluPanel
            serviceId={service.id}
            technicianLabel={service.assignedTechnician ?? null}
            salesLabel={service.receivedBy ?? null}
            defaultRole="sales"
          />
        </section>
      </main>

      {/* Modal 3D viewer (read-only). Pokazuje markery uszkodzeń + dodatkowe
       *  notatki z intake. Sprzedawca nie edytuje markerów. */}
      {show3D && (
        <PhoneConfigurator3D
          brand={service.brand ?? ""}
          brandColorHex="#9CA3AF"
          readOnly
          initial={{
            damage_markers:
              service.visualCondition?.damage_markers ?? [],
            additional_notes:
              service.visualCondition?.additional_notes ?? undefined,
          }}
          onCancel={() => setShow3D(false)}
          onComplete={() => setShow3D(false)}
        />
      )}
    </div>
  );
}

/** Karta CTA do otwarcia 3D viewera (read-only). */
function Device3DCard({
  hasMarkers,
  onShow,
}: {
  hasMarkers: boolean;
  onShow: () => void;
}) {
  return (
    <Card icon={<Box className="w-4 h-4" />} title="Stan urządzenia (3D)">
      <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
        {hasMarkers
          ? "Otwórz interaktywny model 3D z zaznaczonymi miejscami uszkodzeń."
          : "Otwórz interaktywny model 3D urządzenia (markery uszkodzeń mogą być puste, jeśli intake przeszedł bez zaznaczeń)."}
      </p>
      <button
        type="button"
        onClick={onShow}
        className="px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all hover:scale-[1.01]"
        style={{
          background:
            "linear-gradient(135deg, rgba(168,85,247,0.2), rgba(59,130,246,0.15))",
          color: "#fff",
          border: "1px solid rgba(168,85,247,0.4)",
        }}
        aria-label="Pokaż urządzenie w 3D"
      >
        <Box className="w-4 h-4" aria-hidden="true" />
        Pokaż urządzenie
      </button>
    </Card>
  );
}

const ANNEX_STATUS_LABELS: Record<
  string,
  { label: string; color: string }
> = {
  pending: { label: "Oczekuje", color: "#F59E0B" },
  sent: { label: "Wysłany", color: "#06B6D4" },
  accepted: { label: "Zaakceptowany", color: "#22C55E" },
  rejected: { label: "Odrzucony", color: "#EF4444" },
  expired: { label: "Wygasły", color: "#64748B" },
  completed: { label: "Zakończony", color: "#22C55E" },
};

function DocumentsCard({
  serviceId,
  annexes,
}: {
  serviceId: string;
  annexes: ServiceAnnex[];
}) {
  return (
    <Card icon={<Files className="w-4 h-4" />} title="Dokumenty zlecenia">
      {annexes.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Brak aneksów. Dokumenty potwierdzenia odbioru widoczne są w panelu
          po prawej.
        </p>
      ) : (
        <ul className="space-y-2">
          {annexes.map((a) => {
            const meta = ANNEX_STATUS_LABELS[a.acceptanceStatus] ?? {
              label: a.acceptanceStatus,
              color: "#64748b",
            };
            const pdfUrl = `/api/relay/services/${encodeURIComponent(serviceId)}/annexes/${encodeURIComponent(a.id)}/pdf`;
            return (
              <li
                key={a.id}
                className="rounded-lg border p-3 flex items-start gap-3"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <FileText
                  className="w-4 h-4 mt-0.5 flex-shrink-0"
                  style={{ color: "var(--text-muted)" }}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-sm font-semibold"
                      style={{ color: "var(--text-main)" }}
                    >
                      Aneks {a.deltaAmount >= 0 ? "+" : ""}
                      {a.deltaAmount.toFixed(2)} PLN
                    </span>
                    <span
                      className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full"
                      style={{
                        background: meta.color + "22",
                        color: meta.color,
                      }}
                    >
                      {meta.label}
                    </span>
                  </div>
                  {a.reason && (
                    <p
                      className="text-xs mt-1 truncate"
                      style={{ color: "var(--text-muted)" }}
                      title={a.reason}
                    >
                      {a.reason}
                    </p>
                  )}
                  <p
                    className="text-[10px] mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {new Date(a.createdAt).toLocaleString("pl-PL")}
                  </p>
                </div>
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 flex-shrink-0 hover:opacity-80 transition-opacity"
                  style={{
                    background: "var(--bg-card)",
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-main)",
                  }}
                  aria-label="Pobierz PDF aneksu"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  PDF
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}


/** Karta z aktualnym stanem podpisu Documenso + akcje (otwórz signing,
 * pobierz podpisany PDF). Pokazywana gdy potwierdzenie zostało wysłane. */
function DocumentSigningCard({
  status,
  signedPdfUrl,
  employeeSigningUrl,
}: {
  status: string;
  signedPdfUrl?: string;
  employeeSigningUrl?: string;
}) {
  const meta = DOCUMENSO_STATUS_PHRASES[status] ?? {
    label: "Status nieznany",
    color: "#64748B",
    description: "",
  };
  return (
    <div
      className="p-4 rounded-2xl border-2"
      style={{
        background: meta.color + "0d",
        borderColor: meta.color + "55",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: meta.color + "22",
            color: meta.color,
          }}
        >
          {status === "signed" ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : status === "rejected" ? (
            <AlertCircle className="w-5 h-5" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="font-semibold text-sm"
            style={{ color: meta.color }}
          >
            {meta.label}
          </p>
          {void employeeSigningUrl}
        </div>
      </div>
    </div>
  );
}

function Card({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
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
        className="text-xs uppercase font-bold tracking-wider mb-3 flex items-center gap-2"
        style={{ color: "var(--text-muted)" }}
      >
        {icon}
        {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-center text-sm gap-3">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span
        className={`text-right ${mono ? "font-mono" : ""}`}
        style={{ color: value ? "var(--text-main)" : "var(--text-muted)" }}
      >
        {value || "—"}
      </span>
    </div>
  );
}


function ActionsCard({
  eDocStatus,
  hasEmail,
  busy,
  onSignPaper,
  onEmail,
  onResend,
  onInvalidateElectronic,
  onInvalidatePaper,
  signedPdfUrl,
  paperSigned,
  paperSignedAt,
  onPaperSigned,
}: {
  eDocStatus: string;
  hasEmail: boolean;
  busy: boolean;
  onSignPaper: () => void;
  onEmail: () => void;
  onResend: () => void;
  onInvalidateElectronic: () => void;
  onInvalidatePaper: () => void;
  signedPdfUrl?: string;
  paperSigned?: boolean;
  paperSignedAt?: string;
  onPaperSigned: () => void;
}) {
  // State machine — wybiera content na podstawie aktualnego stanu flow.
  // Priorytet: paper_signed > paper_pending > signed > sent/employee_signed > none.
  const flowState: "none" | "paper_pending" | "paper_signed" | "electronic_pending" | "electronic_signed" =
    paperSigned
      ? "paper_signed"
      : eDocStatus === "paper_pending"
        ? "paper_pending"
        : eDocStatus === "signed"
          ? "electronic_signed"
          : eDocStatus === "sent" || eDocStatus === "employee_signed"
            ? "electronic_pending"
            : "none";

  return (
    <div
      className="p-4 rounded-2xl border"
      style={{
        background: "var(--bg-card)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <h3
        className="text-xs uppercase font-bold tracking-wider mb-3 flex items-center gap-2"
        style={{ color: "var(--text-muted)" }}
      >
        <FileText className="w-4 h-4" />
        Potwierdzenie odbioru
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {flowState === "none" && (
          <>
            <ActionButton
              icon={<Printer className="w-4 h-4" />}
              label="Wersja papierowa"
              hint="Pracownik podpisuje, wydruk dla klienta do podpisu ręcznego"
              onClick={onSignPaper}
              disabled={busy}
              color="#6366f1"
            />
            <ActionButton
              icon={<Mail className="w-4 h-4" />}
              label="Wersja elektroniczna"
              hint={
                hasEmail
                  ? "Pracownik podpisuje, klient dostaje email z linkiem"
                  : "Wymagany adres email klienta"
              }
              onClick={onEmail}
              disabled={!hasEmail || busy}
              color="#06B6D4"
            />
          </>
        )}

        {flowState === "paper_pending" && (
          <>
            <ActionButton
              icon={<FileText className="w-4 h-4" />}
              label="Otwórz dokument do druku"
              hint="PDF z podpisem pracownika"
              onClick={() =>
                signedPdfUrl &&
                window.open(signedPdfUrl, "_blank", "noopener")
              }
              disabled={busy || !signedPdfUrl}
              color="#6366f1"
            />
            <ActionButton
              icon={<CheckCircle2 className="w-4 h-4" />}
              label="Podpisano"
              hint="Klient podpisał wersję papierową"
              onClick={onPaperSigned}
              disabled={busy}
              color="#22c55e"
            />
            <ActionButton
              icon={<AlertCircle className="w-4 h-4" />}
              label="Unieważnij dokument"
              hint="Anuluj wersję papierową — wróć do wyboru"
              onClick={onInvalidatePaper}
              disabled={busy}
              color="#ef4444"
            />
          </>
        )}

        {flowState === "paper_signed" && (
          <>
            <ActionButton
              icon={<FileText className="w-4 h-4" />}
              label="Otwórz podpisany dokument"
              hint="PDF z podpisem pracownika"
              onClick={() =>
                signedPdfUrl &&
                window.open(signedPdfUrl, "_blank", "noopener")
              }
              disabled={busy || !signedPdfUrl}
              color="#22c55e"
            />
            <ActionButton
              icon={<AlertCircle className="w-4 h-4" />}
              label="Unieważnij podpisany dokument w wersji papierowej"
              hint="Wróć do wyboru wersji"
              onClick={onInvalidatePaper}
              disabled={busy}
              color="#ef4444"
            />
            {paperSignedAt && (
              <div
                className="p-3 rounded-xl border sm:col-span-2"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))",
                  borderColor: "rgba(34,197,94,0.4)",
                }}
              >
                <div
                  className="flex items-center gap-2"
                  style={{ color: "#22c55e" }}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-sm font-semibold">
                    Podpisano papierowo
                  </span>
                </div>
                <p
                  className="text-[11px] mt-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  {new Date(paperSignedAt).toLocaleString("pl-PL")}
                </p>
              </div>
            )}
          </>
        )}

        {flowState === "electronic_pending" && (
          <>
            <ActionButton
              icon={<Mail className="w-4 h-4" />}
              label="Wyślij ponownie"
              hint="Przypomnienie do klienta"
              onClick={onResend}
              disabled={!hasEmail || busy}
              color="#f59e0b"
            />
            <ActionButton
              icon={<AlertCircle className="w-4 h-4" />}
              label="Unieważnij dokument elektroniczny"
              hint="Anuluj — wróć do wyboru wersji"
              onClick={onInvalidateElectronic}
              disabled={busy}
              color="#ef4444"
            />
          </>
        )}

        {flowState === "electronic_signed" && (
          <>
            <ActionButton
              icon={<FileText className="w-4 h-4" />}
              label="Otwórz podpisany dokument"
              hint="PDF z podpisami pracownika i klienta"
              onClick={() =>
                signedPdfUrl &&
                window.open(signedPdfUrl, "_blank", "noopener")
              }
              disabled={busy || !signedPdfUrl}
              color="#22c55e"
            />
            <ActionButton
              icon={<AlertCircle className="w-4 h-4" />}
              label="Unieważnij podpisany dokument"
              hint="Anuluj — wróć do wyboru wersji"
              onClick={onInvalidateElectronic}
              disabled={busy}
              color="#ef4444"
            />
          </>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  hint,
  onClick,
  disabled,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  color: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="p-3 rounded-xl border text-left transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
      style={{
        background: `linear-gradient(135deg, ${color}22, ${color}11)`,
        borderColor: color + "44",
      }}
    >
      <div className="flex items-center gap-2 mb-1" style={{ color }}>
        {icon}
        <span className="text-sm font-semibold">{label}</span>
      </div>
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        {hint}
      </p>
    </button>
  );
}

function DocumensoStatusCard({
  documenso,
}: {
  documenso?: NonNullable<ServiceDetail["visualCondition"]>["documenso"];
}) {
  if (!documenso) {
    return (
      <Card icon={<Send className="w-4 h-4" />} title="Status Documenso">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Potwierdzenie elektroniczne nie zostało jeszcze wysłane.
        </p>
      </Card>
    );
  }
  const STATUS_TXT: Record<string, { label: string; color: string }> = {
    sent: { label: "Oczekiwanie na podpis klienta", color: "#06B6D4" },
    employee_signed: { label: "Oczekiwanie na podpis klienta", color: "#06B6D4" },
    signed: { label: "Podpisane elektronicznie", color: "#22C55E" },
    paper_pending: { label: "Wersja papierowa — do druku", color: "#6366F1" },
    paper_signed: { label: "Podpisane papierowo", color: "#22C55E" },
    rejected: { label: "Odrzucone przez klienta", color: "#EF4444" },
    expired: { label: "Unieważnione", color: "#F59E0B" },
  };
  const s = STATUS_TXT[documenso.status] ?? {
    label: documenso.status,
    color: "#64748B",
  };
  return (
    <Card icon={<Send className="w-4 h-4" />} title="Status Documenso">
      <div
        className="text-sm font-semibold flex items-center gap-2"
        style={{ color: s.color }}
      >
        <span
          className="w-2 h-2 rounded-full"
          style={{ background: s.color }}
        />
        {s.label}
      </div>
      <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
        Wysłano {new Date(documenso.sentAt).toLocaleString("pl-PL")}
      </p>
      {documenso.completedAt && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Zakończono {new Date(documenso.completedAt).toLocaleString("pl-PL")}
        </p>
      )}
      <p
        className="text-[10px] mt-2 font-mono"
        style={{ color: "var(--text-muted)" }}
      >
        Doc #{documenso.docId}
        {documenso.previousDocIds && documenso.previousDocIds.length > 0
          ? ` (poprzednie: ${documenso.previousDocIds.join(", ")})`
          : ""}
      </p>
    </Card>
  );
}

/**
 * Wave 22 / F7 — paleta kropek per action_type. Treść (label/description)
 * pochodzi z `humanizeAction` (single source of truth w
 * `lib/services/event-humanizer.ts`); ta mapa zachowuje wyłącznie
 * kolorystykę dotów żeby UI nie zgubił wizualnej hierarchii.
 */
const ACTION_DOT_COLORS: Record<string, string> = {
  employee_sign: "#22c55e",
  print: "#6366f1",
  send_electronic: "#06b6d4",
  resend_electronic: "#f59e0b",
  client_signed: "#22c55e",
  client_rejected: "#ef4444",
  annex_issued: "#a855f7",
  annex_created: "#a855f7",
  annex_accepted: "#22c55e",
  annex_rejected: "#ef4444",
  annex_resend: "#f59e0b",
  annex_expired: "#64748b",
  status_change: "#0ea5e9",
  quote_changed: "#a855f7",
  release_code_generated: "#0ea5e9",
  release_code_sent: "#06b6d4",
  release_code_resent: "#f59e0b",
  release_code_failed: "#ef4444",
  release_completed: "#22c55e",
  transport_requested: "#f59e0b",
  transport_updated: "#0ea5e9",
  transport_cancelled: "#64748b",
  upload_bridge_token_issued: "#06b6d4",
  document_invalidated: "#ef4444",
  customer_message_sent: "#06b6d4",
  photo_uploaded: "#22c55e",
  photo_deleted: "#64748b",
};

function ActionsLogCard({ actions }: { actions: ServiceActionEntry[] }) {
  return (
    <Card icon={<Send className="w-4 h-4" />} title="Historia akcji">
      {actions.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Brak akcji.
        </p>
      ) : (
        <ul className="space-y-2">
          {actions.slice(0, 20).map((a) => {
            const dotColor = ACTION_DOT_COLORS[a.action] ?? "#64748b";
            const humanized = humanizeAction(
              a.action,
              a.payload ?? null,
              a.summary,
              getStatusLabel,
            );
            const author = formatActor({
              actorName: a.actorName,
              actorEmail: a.actorEmail ?? null,
            });
            const ts = formatEventTimestamp(a.createdAt);
            return (
              <li
                key={a.id}
                className="flex items-start gap-2 text-xs"
                style={{ color: "var(--text-main)" }}
              >
                <span
                  className="mt-1 shrink-0 w-1.5 h-1.5 rounded-full"
                  style={{ background: dotColor }}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold" style={{ color: dotColor }}>
                    {humanized.label}
                  </p>
                  {humanized.description && (
                    <p
                      className="text-[11px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {humanized.description}
                    </p>
                  )}
                  <p
                    className="text-[10px] mt-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {ts}
                    {ts && author ? " · " : ""}
                    {author}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

const MAIL_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  Sent: { label: "Wysłano", color: "#06b6d4" },
  Held: { label: "Wstrzymano", color: "#f59e0b" },
  Bounced: { label: "Zwrot", color: "#ef4444" },
  HardFail: { label: "Błąd dostarczenia", color: "#ef4444" },
  SoftFail: { label: "Tymczasowy błąd", color: "#f59e0b" },
  Pending: { label: "W kolejce", color: "#64748b" },
};

function MailHistoryCard({ messages }: { messages: MailMessage[] }) {
  return (
    <Card icon={<AtSign className="w-4 h-4" />} title="Historia wiadomości">
      {messages.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Brak wysłanych wiadomości.
        </p>
      ) : (
        <ul className="space-y-2">
          {messages.slice(0, 15).map((m) => {
            const meta = MAIL_STATUS_LABELS[m.status] ?? {
              label: m.status,
              color: "#64748b",
            };
            return (
              <li
                key={m.id}
                className="text-xs"
                style={{ color: "var(--text-main)" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="font-semibold truncate"
                    style={{ color: meta.color }}
                  >
                    {meta.label}
                  </span>
                  <span
                    className="text-[10px] flex-shrink-0"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {new Date(m.timestamp * 1000).toLocaleString("pl-PL")}
                  </span>
                </div>
                <p className="truncate text-[11px] mt-0.5">
                  {m.subject}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

const FIELD_LABELS_PL: Record<string, string> = {
  status: "Status",
  diagnosis: "Diagnoza",
  description: "Opis usterki",
  amountEstimate: "Kwota wyceny",
  amountFinal: "Kwota finalna",
  promisedAt: "Obiecana data",
  warrantyUntil: "Gwarancja do",
  customerFirstName: "Imię klienta",
  customerLastName: "Nazwisko klienta",
  contactPhone: "Telefon klienta",
  contactEmail: "Email klienta",
  brand: "Marka urządzenia",
  model: "Model urządzenia",
  imei: "IMEI",
  color: "Kolor",
  lockType: "Typ blokady",
  lockCode: "Kod blokady",
  visualCondition: "Stan wizualny",
  intakeChecklist: "Checklist przyjęcia",
  serviceLocationId: "Punkt serwisowy (Dostawa)",
  locationId: "Punkt sprzedaży",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fmtChangeValue(
  v: unknown,
  resolveUuid?: (id: string) => string | null,
): string {
  if (v == null || v === "") return "—";
  if (typeof v === "string") {
    if (resolveUuid && UUID_RE.test(v)) {
      const resolved = resolveUuid(v);
      if (resolved) return resolved;
    }
    return v.length > 60 ? v.slice(0, 57) + "…" : v;
  }
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "Tak" : "Nie";
  return "[obiekt]";
}

function HistoryCard({
  revisions,
  serviceLocationsById,
}: {
  revisions: Revision[];
  serviceLocationsById?: Record<string, string>;
}) {
  const resolveUuid = (id: string): string | null =>
    serviceLocationsById?.[id] ?? null;
  return (
    <Card icon={<History className="w-4 h-4" />} title="Historia edycji">
      {revisions.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Brak zmian od utworzenia.
        </p>
      ) : (
        <ul className="space-y-3">
          {revisions.slice(0, 15).map((r) => {
            const changeKeys = Object.keys(r.changes ?? {}).filter(
              (k) => k !== "visualCondition" && k !== "intakeChecklist",
            );
            return (
              <li
                key={r.id}
                className="flex items-start gap-2 text-xs"
                style={{ color: "var(--text-main)" }}
              >
                <span
                  className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full"
                  style={{
                    background: r.isSignificant ? "#f59e0b" : "#64748b",
                  }}
                />
                <div className="flex-1 min-w-0">
                  {changeKeys.length === 0 ? (
                    <p className="truncate">{r.summary}</p>
                  ) : (
                    <ul className="space-y-1">
                      {changeKeys.map((k) => {
                        const ch = r.changes![k]!;
                        const label = FIELD_LABELS_PL[k] ?? k;
                        const before = fmtChangeValue(ch.before, resolveUuid);
                        const after = fmtChangeValue(ch.after, resolveUuid);
                        const isDelete = ch.after == null || ch.after === "";
                        const isAdd = ch.before == null || ch.before === "";
                        return (
                          <li key={k} className="leading-snug">
                            <span
                              className="font-semibold"
                              style={{ color: "var(--text-main)" }}
                            >
                              {label}:
                            </span>{" "}
                            {isAdd ? (
                              <>
                                dodano{" "}
                                <span style={{ color: "#22c55e" }}>{after}</span>
                              </>
                            ) : isDelete ? (
                              <>
                                usunięto{" "}
                                <span
                                  className="line-through"
                                  style={{ color: "#ef4444" }}
                                >
                                  {before}
                                </span>
                              </>
                            ) : (
                              <>
                                <span
                                  className="line-through"
                                  style={{ color: "var(--text-muted)" }}
                                >
                                  {before}
                                </span>{" "}
                                →{" "}
                                <span style={{ color: "#22c55e" }}>{after}</span>
                              </>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <p
                    className="text-[10px] mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {new Date(r.createdAt).toLocaleString("pl-PL")}
                    {r.editedByName ? ` · ${r.editedByName}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
