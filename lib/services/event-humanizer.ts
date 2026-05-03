/**
 * Wave 22 / F7 — single source of truth do humanizacji wpisów event logu
 * (mp_service_actions). Przyjmuje surowy `action` (technical name) +
 * payload + opcjonalną tabelę etykiet statusów; zwraca parę
 * { label, description } w pełni po polsku, gotową do renderu.
 *
 * Pure function, brak server deps (logger, db, fs) — bezpieczny do
 * importu z paneli (sprzedawca/serwisant/kierowca) oraz z customer
 * portala. Plik mirrorowany do `panels/<x>/lib/services/event-humanizer.ts`
 * (panele to niezależne Next.js apps z własnym `node_modules` i alias
 * `@/*` wskazującym na ich root).
 *
 * Zasada designu:
 *   - `label` — krótki, ludzki tytuł (Title Case lub pierwsza litera duża),
 *     bez polskich kropek na końcu, bez technicznych nazw.
 *   - `description` — rozszerzona linia (mid-detail), używa danych z
 *     `payload` jeśli ma sensowne pola; fallback do `summary` z DB.
 *   - Gdy nic się nie zgadza — fallback do `summary` (już zazwyczaj jest po
 *     polsku, bo serwer go formatuje przy `logServiceAction`), a w
 *     ostateczności do bardzo ogólnego "Zdarzenie systemowe".
 */

export interface HumanizedEvent {
  /** Krótki tytuł — np. "Niepoprawny kod wydania". */
  label: string;
  /** Linia szczegółów — np. "Pozostało prób: 4". Może być pustym stringiem. */
  description: string;
}

/**
 * Mapa labeli statusów (ServiceStatus → polska etykieta). Wstrzykujemy ją
 * jako parametr (zamiast importować `getStatusLabel` bezpośrednio), żeby:
 *   1) `event-humanizer.ts` nie ciągnął `lucide-react` (status-meta.ts go
 *      ma) do czystych testów Vitest,
 *   2) panele mogły podstawić swój `getStatusLabel` (mimo że w praktyce
 *      pochodzi z tej samej kanonicznej tabeli).
 */
export type StatusLabelLookup = (status: string) => string;

const DEFAULT_STATUS_LABELS: StatusLabelLookup = (s) => s;

function pickString(
  payload: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!payload) return null;
  const v = payload[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function pickNumber(
  payload: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  if (!payload) return null;
  const v = payload[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function formatPLN(value: number): string {
  return `${value.toFixed(2)} PLN`;
}

/**
 * Próbuje wyciągnąć liczbę "pozostało prób: N" z surowego summary
 * `release_code_failed` — payload nie zawiera `attemptsLeft`, więc to
 * jedyna ścieżka. Wzorzec dopasowany do summary w
 * `app/api/panel/services/[id]/release/route.ts`.
 */
function extractAttemptsLeftFromSummary(summary: string): number | null {
  const m = summary.match(/pozostało prób:\s*(\d+)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

const PHOTO_STAGE_LABEL: Record<string, string> = {
  intake: "przyjęcia",
  diagnosis: "diagnozy",
  in_repair: "naprawy",
  before_delivery: "przed wydaniem",
  other: "inne",
};

const RELEASE_CHANNEL_LABEL: Record<string, string> = {
  email: "e-mail",
  sms: "SMS",
  paper: "papierowo",
  chatwoot: "czat Chatwoot",
};

const MESSAGE_CHANNEL_LABEL: Record<string, string> = {
  email: "e-mail",
  sms: "SMS",
  chatwoot: "czat",
};

const NOTE_VISIBILITY_LABEL: Record<string, string> = {
  team: "zespół",
  service_only: "tylko serwis",
  sales_only: "tylko sprzedaż",
  your_role_only: "tylko Twoja rola",
};

const DOCUMENT_KIND_LABEL: Record<string, string> = {
  receipt: "potwierdzenie odbioru",
  annex: "aneks do wyceny",
  handover: "protokół wydania",
  release_code: "kod wydania",
  warranty: "kartę gwarancyjną",
  electronic: "dokument elektroniczny",
  paper: "dokument papierowy",
};

/**
 * Główna funkcja — zhumanizuj action z mp_service_actions.
 *
 * Wszystkie obsługiwane action_types (źródło: `lib/service-actions.ts`
 * `ServiceActionKind` + plan F7):
 *
 *   status_change, quote_changed, annex_created, annex_accepted,
 *   annex_rejected, annex_resend, annex_expired, annex_issued,
 *   photo_uploaded, photo_deleted, employee_sign, print, send_electronic,
 *   resend_electronic, client_signed, client_rejected, transport_requested,
 *   transport_updated, transport_cancelled, release_code_generated,
 *   release_code_sent, release_code_resent, release_code_failed,
 *   release_completed, upload_bridge_token_issued, document_invalidated,
 *   live_view_started, live_view_ended, note_added, note_deleted,
 *   component_added, component_updated, component_deleted, part_ordered,
 *   part_received, part_updated, part_deleted, customer_data_updated,
 *   device_condition_updated, damage_marker_added, damage_marker_removed,
 *   damage_marker_updated, customer_message_sent, customer_contact_recorded,
 *   service_created_quick, repair_type_changed, visual_notes_updated,
 *   other.
 */
export function humanizeAction(
  action: string,
  payload: Record<string, unknown> | null | undefined,
  summary: string | null | undefined,
  statusLabels: StatusLabelLookup = DEFAULT_STATUS_LABELS,
): HumanizedEvent {
  const safeSummary = (summary ?? "").trim();

  switch (action) {
    case "status_change": {
      const from = pickString(payload, "from");
      const to = pickString(payload, "to");
      if (from && to) {
        return {
          label: "Zmiana statusu zlecenia",
          description: `${statusLabels(from)} → ${statusLabels(to)}`,
        };
      }
      return { label: "Zmiana statusu zlecenia", description: safeSummary };
    }

    case "quote_changed": {
      const oldA = pickNumber(payload, "oldAmount") ?? pickNumber(payload, "previousAmount");
      const newA = pickNumber(payload, "newAmount");
      if (oldA != null && newA != null) {
        return {
          label: "Zmiana wyceny",
          description: `Wycena z ${formatPLN(oldA)} do ${formatPLN(newA)}`,
        };
      }
      return { label: "Zmiana wyceny", description: safeSummary };
    }

    case "annex_created": {
      const oldA = pickNumber(payload, "previousAmount") ?? pickNumber(payload, "oldAmount");
      const newA = pickNumber(payload, "newAmount");
      const description =
        oldA != null && newA != null
          ? `Documenso — wycena ${
              newA > oldA ? "zwiększona" : "zmniejszona"
            } z ${formatPLN(oldA)} do ${formatPLN(newA)}`
          : safeSummary || "Aneks wystawiony do podpisu klienta.";
      return { label: "Utworzono aneks", description };
    }

    case "annex_accepted": {
      const oldA = pickNumber(payload, "previousAmount") ?? pickNumber(payload, "oldAmount");
      const newA = pickNumber(payload, "newAmount");
      const description =
        oldA != null && newA != null
          ? `Klient zaakceptował zmianę wyceny: ${formatPLN(oldA)} → ${formatPLN(newA)}`
          : safeSummary || "Klient zaakceptował aneks.";
      return { label: "Aneks zaakceptowany", description };
    }

    case "annex_rejected":
      return {
        label: "Aneks odrzucony",
        description: safeSummary || "Klient odrzucił aneks do wyceny.",
      };

    case "annex_resend":
      return {
        label: "Aneks wysłany ponownie",
        description: safeSummary || "Wysłano ponownie aneks do podpisu.",
      };

    case "annex_expired":
      return {
        label: "Aneks wygasł",
        description:
          safeSummary ||
          "Aneks unieważniony automatycznie (zmiana wyceny lub adresu e-mail).",
      };

    case "annex_issued":
      return {
        label: "Aneks wystawiony",
        description: safeSummary || "Aneks wprowadzony do obiegu.",
      };

    case "photo_uploaded": {
      const stage = pickString(payload, "stage");
      const stageLabel = stage ? PHOTO_STAGE_LABEL[stage] ?? stage : null;
      return {
        label: "Dodano zdjęcie",
        description: stageLabel
          ? `Etap: ${stageLabel}`
          : safeSummary || "Zdjęcie dodane do zlecenia.",
      };
    }

    case "photo_deleted":
      return {
        label: "Usunięto zdjęcie",
        description: safeSummary || "Zdjęcie skasowane z galerii zlecenia.",
      };

    case "employee_sign":
      return {
        label: "Podpis pracownika",
        description: safeSummary || "Pracownik podpisał dokument.",
      };

    case "print":
      return {
        label: "Wydrukowano dokument",
        description: safeSummary || "Dokument wysłany do drukarki.",
      };

    case "send_electronic": {
      const channel = pickString(payload, "channel");
      const channelLabel = channel
        ? RELEASE_CHANNEL_LABEL[channel] ?? channel
        : null;
      return {
        label: "Wysłano elektronicznie",
        description: channelLabel
          ? `Kanał: ${channelLabel}`
          : safeSummary || "Dokument wysłany do podpisu elektronicznego.",
      };
    }

    case "resend_electronic":
      return {
        label: "Ponowna wysyłka elektroniczna",
        description: safeSummary || "Dokument wysłany ponownie do klienta.",
      };

    case "client_signed":
      return {
        label: "Klient podpisał dokument",
        description: safeSummary || "Klient zaakceptował i podpisał dokument.",
      };

    case "client_rejected":
      return {
        label: "Klient odrzucił dokument",
        description: safeSummary || "Klient odmówił podpisu.",
      };

    case "transport_requested": {
      const dest =
        pickString(payload, "destinationName") ??
        pickString(payload, "targetLocationName") ??
        pickString(payload, "targetLocationId");
      const reason = pickString(payload, "reason");
      const description = dest
        ? reason
          ? `Cel: ${dest} — ${reason}`
          : `Cel: ${dest}`
        : safeSummary || "Wnioskowano transport międzylokalny.";
      return { label: "Wnioskowano transport", description };
    }

    case "transport_updated":
      return {
        label: "Zaktualizowano transport",
        description: safeSummary || "Zmieniono dane zlecenia transportu.",
      };

    case "transport_cancelled":
      return {
        label: "Anulowano transport",
        description: safeSummary || "Zlecenie transportu anulowane.",
      };

    case "transport_status_changed": {
      const fromStatus = pickString(payload, "fromStatus");
      const toStatus = pickString(payload, "toStatus");
      const jobNumber = pickString(payload, "jobNumber");
      const STATUS_LABELS: Record<string, string> = {
        queued: "W kolejce",
        assigned: "Przypisane",
        in_transit: "Rozpoczęto transport",
        delivered: "Dostarczone",
        cancelled: "Anulowane",
      };
      const toLabel = toStatus ? (STATUS_LABELS[toStatus] ?? toStatus) : null;
      const ref = jobNumber ? `Transport #${jobNumber}` : "Transport";
      return {
        label: `${ref}${toLabel ? `: ${toLabel}` : ""}`,
        description: safeSummary || "",
      };
    }

    case "transport_status_changed": {
      const fromStatus = pickString(payload, "fromStatus");
      const toStatus = pickString(payload, "toStatus");
      const jobNumber = pickString(payload, "jobNumber");
      const hasSignature =
        payload && typeof payload === "object" && "hasSignature" in payload
          ? Boolean((payload as Record<string, unknown>).hasSignature)
          : false;
      const STATUS_LABELS: Record<string, string> = {
        queued: "W kolejce",
        assigned: "Przypisane",
        in_transit: "Rozpoczęto transport",
        delivered: "Dostarczone",
        cancelled: "Anulowane",
      };
      const toLabel = toStatus ? (STATUS_LABELS[toStatus] ?? toStatus) : null;
      const fromLabel = fromStatus
        ? (STATUS_LABELS[fromStatus] ?? fromStatus)
        : null;
      const ref = jobNumber ? `Transport #${jobNumber}` : "Transport";
      const transition =
        toLabel && fromLabel
          ? `${fromLabel} → ${toLabel}`
          : (toLabel ?? safeSummary);
      const sigSuffix = hasSignature ? " (z podpisem odbiorcy)" : "";
      return {
        label: `${ref}: ${transition}${sigSuffix}`,
        description:
          safeSummary && safeSummary !== transition ? safeSummary : "",
      };
    }

    case "transport_status_changed": {
      const fromStatus = pickString(payload, "fromStatus");
      const toStatus = pickString(payload, "toStatus");
      const jobNumber = pickString(payload, "jobNumber");
      const hasSignature =
        payload && typeof payload === "object" && "hasSignature" in payload
          ? Boolean((payload as Record<string, unknown>).hasSignature)
          : false;
      const STATUS_LABELS: Record<string, string> = {
        queued: "W kolejce",
        assigned: "Przypisane",
        in_transit: "Rozpoczęto transport",
        delivered: "Dostarczone",
        cancelled: "Anulowane",
      };
      const toLabel = toStatus ? (STATUS_LABELS[toStatus] ?? toStatus) : null;
      const fromLabel = fromStatus
        ? (STATUS_LABELS[fromStatus] ?? fromStatus)
        : null;
      const ref = jobNumber ? `Transport #${jobNumber}` : "Transport";
      const transition =
        toLabel && fromLabel
          ? `${fromLabel} → ${toLabel}`
          : (toLabel ?? safeSummary);
      const sigSuffix = hasSignature ? " (z podpisem odbiorcy)" : "";
      return {
        label: `${ref}: ${transition}${sigSuffix}`,
        description:
          safeSummary && safeSummary !== transition ? safeSummary : "",
      };
    }

    case "release_code_generated": {
      const channel = pickString(payload, "channel");
      const channelLabel = channel
        ? RELEASE_CHANNEL_LABEL[channel] ?? channel
        : null;
      return {
        label: "Wygenerowano kod wydania",
        description: channelLabel
          ? `Kanał: ${channelLabel}`
          : safeSummary || "Kod wydania urządzenia został wygenerowany.",
      };
    }

    case "release_code_sent": {
      const channel = pickString(payload, "channel");
      const channelLabel = channel
        ? RELEASE_CHANNEL_LABEL[channel] ?? channel
        : null;
      return {
        label: "Wysłano kod wydania",
        description: channelLabel
          ? `Kanał: ${channelLabel}`
          : safeSummary || "Kod wydania wysłany do klienta.",
      };
    }

    case "release_code_resent": {
      const channel = pickString(payload, "channel");
      const channelLabel = channel
        ? RELEASE_CHANNEL_LABEL[channel] ?? channel
        : null;
      return {
        label: "Ponowna wysyłka kodu wydania",
        description: channelLabel
          ? `Kanał: ${channelLabel}`
          : safeSummary || "Kod wydania wysłany ponownie do klienta.",
      };
    }

    case "release_code_failed": {
      // Preferujemy `payload.attemptsLeft` (kontrakt strukturalny). Obecny
      // serwer (`app/api/panel/services/[id]/release/route.ts`) nie ustawia
      // tego pola — dlatego fallback parsuje summary regexem ("pozostało
      // prób: N"). Gdy ktoś w przyszłości doda `attemptsLeft` do payload
      // — dostaniemy go bez zmiany humanizera.
      const attemptsLeft =
        pickNumber(payload, "attemptsLeft") ??
        extractAttemptsLeftFromSummary(safeSummary);
      const channel = pickString(payload, "channel");
      const channelLabel = channel
        ? RELEASE_CHANNEL_LABEL[channel] ?? channel
        : null;
      let description = "";
      if (attemptsLeft != null) {
        description = `Pozostało prób: ${attemptsLeft}`;
      } else if (channelLabel) {
        description = `Nie udało się wysłać kodu (${channelLabel})`;
      } else if (safeSummary) {
        description = safeSummary;
      } else {
        description = "Nieprawidłowy kod lub błąd dostarczenia.";
      }
      return { label: "Niepoprawny kod wydania", description };
    }

    case "release_completed":
      return {
        label: "Wydano urządzenie",
        description:
          safeSummary || "Kod wydania potwierdzony — zlecenie zamknięte.",
      };

    case "upload_bridge_token_issued": {
      const stage = pickString(payload, "stage");
      const stageLabel = stage ? PHOTO_STAGE_LABEL[stage] ?? stage : null;
      return {
        label: "Wygenerowano kod do uploadu zdjęć",
        description: stageLabel
          ? `Etap: ${stageLabel}`
          : safeSummary || "Kod QR / link do mobilnego uploadu wystawiony.",
      };
    }

    case "document_invalidated": {
      const kind = pickString(payload, "kind");
      const kindLabel = kind ? DOCUMENT_KIND_LABEL[kind] ?? kind : null;
      const reason = pickString(payload, "reason");
      const description = kindLabel
        ? reason
          ? `Unieważniono ${kindLabel} — ${reason}`
          : `Unieważniono ${kindLabel}.`
        : safeSummary || "Dokument oznaczony jako unieważniony.";
      return { label: "Dokument unieważniony", description };
    }

    case "live_view_started": {
      const role = pickString(payload, "viewerRole");
      return {
        label: "Rozpoczęto podgląd live",
        description: role
          ? `Rola obserwatora: ${role}`
          : safeSummary || "Klient lub pracownik dołączył do sesji live view.",
      };
    }

    case "live_view_ended": {
      const duration = pickNumber(payload, "durationSec");
      return {
        label: "Zakończono podgląd live",
        description:
          duration != null
            ? `Czas trwania: ${Math.round(duration)} s`
            : safeSummary || "Sesja live view zakończona.",
      };
    }

    // ——— Sekcja "minor" — działania edycyjne, mapowane na bazie istniejącej
    // logiki z HistoriaTab `humanizeSummary`. Zachowujemy szczegółowe etykiety,
    // bo są dobrze osadzone w UX.
    case "note_added": {
      const visibility = pickString(payload, "visibility");
      const visLabel = visibility
        ? NOTE_VISIBILITY_LABEL[visibility] ?? visibility
        : null;
      return {
        label: "Dodano notatkę",
        description: visLabel
          ? `Widoczność: ${visLabel}`
          : safeSummary || "Notatka dodana do zlecenia.",
      };
    }

    case "note_deleted":
      return {
        label: "Usunięto notatkę",
        description: safeSummary || "Notatka skasowana ze zlecenia.",
      };

    case "component_added": {
      const name = pickString(payload, "name");
      return {
        label: "Dodano komponent",
        description: name
          ? `Pozycja: ${name}`
          : safeSummary || "Komponent dodany do wyceny.",
      };
    }

    case "component_updated":
      return {
        label: "Zaktualizowano komponent",
        description: safeSummary || "Zmieniono dane komponentu w wycenie.",
      };

    case "component_deleted":
      return {
        label: "Usunięto komponent",
        description: safeSummary || "Komponent usunięty z wyceny.",
      };

    case "part_ordered":
      return {
        label: "Zamówiono część",
        description: safeSummary || "Zlecenie zamówienia części wprowadzone.",
      };

    case "part_received":
      return {
        label: "Otrzymano część",
        description: safeSummary || "Część dostarczona do serwisu.",
      };

    case "part_updated":
      return {
        label: "Zaktualizowano część",
        description: safeSummary || "Zmieniono dane zamówienia części.",
      };

    case "part_deleted":
      return {
        label: "Usunięto część",
        description: safeSummary || "Zamówienie części anulowane.",
      };

    case "customer_data_updated":
      return {
        label: "Zaktualizowano dane klienta",
        description: safeSummary || "Zmieniono dane kontaktowe klienta.",
      };

    case "device_condition_updated":
      return {
        label: "Zaktualizowano stan urządzenia",
        description:
          safeSummary || "Stan techniczny urządzenia zaktualizowany.",
      };

    case "damage_marker_added":
      return {
        label: "Dodano marker uszkodzenia",
        description: safeSummary || "Oznaczono uszkodzenie na schemacie urządzenia.",
      };

    case "damage_marker_removed":
      return {
        label: "Usunięto marker uszkodzenia",
        description: safeSummary || "Marker uszkodzenia skasowany.",
      };

    case "damage_marker_updated":
      return {
        label: "Edytowano marker uszkodzenia",
        description: safeSummary || "Zaktualizowano marker uszkodzenia.",
      };

    case "visual_notes_updated":
      return {
        label: "Zaktualizowano notatki wizualne",
        description: safeSummary || "Zmieniono notatki na schemacie urządzenia.",
      };

    case "customer_message_sent": {
      const channel = pickString(payload, "channel");
      const channelLabel = channel
        ? MESSAGE_CHANNEL_LABEL[channel] ?? channel
        : null;
      return {
        label: "Wiadomość do klienta",
        description: channelLabel
          ? `Kanał: ${channelLabel}`
          : safeSummary || "Wysłano wiadomość do klienta.",
      };
    }

    case "customer_contact_recorded": {
      const via = pickString(payload, "via");
      return {
        label: "Kontakt z klientem",
        description: via
          ? `Sposób: ${via}`
          : safeSummary || "Zarejestrowano ręczny kontakt z klientem.",
      };
    }

    case "service_created_quick":
      return {
        label: "Utworzono zlecenie",
        description: safeSummary || "Zlecenie zarejestrowane (szybkie przyjęcie).",
      };

    case "repair_type_changed": {
      const from = pickString(payload, "from");
      const to = pickString(payload, "to");
      if (from && to) {
        return {
          label: "Zmieniono typ naprawy",
          description: `${from} → ${to}`,
        };
      }
      return {
        label: "Zmieniono typ naprawy",
        description: safeSummary || "Typ naprawy zaktualizowany.",
      };
    }

    case "other":
      return {
        label: "Zdarzenie",
        description: safeSummary || "Zarejestrowano zdarzenie w historii.",
      };

    default: {
      // Nieznany action — nie pokazuj surowego technicznego stringa userowi.
      // Pierwsza litera dużą + zamiana _ na spacje, jako lekka humanizacja
      // last-resort. Typeczek w app-codzie zazwyczaj wyłapie nieobsłużone
      // gałęzie wcześniej.
      const pretty = action
        .replace(/_/g, " ")
        .replace(/^./, (c) => c.toUpperCase());
      const isStillTechnical = pretty === action;
      return {
        label: isStillTechnical ? "Zdarzenie" : pretty,
        description: safeSummary || "Zarejestrowano zdarzenie systemowe.",
      };
    }
  }
}

/**
 * Format autora — preferujemy `actorName`, fallback do local-part z e-maila,
 * a w ostateczności "System".
 */
export function formatActor(input: {
  actorName?: string | null;
  actorEmail?: string | null;
}): string {
  const name = input.actorName?.trim();
  if (name) return name;
  const email = input.actorEmail?.trim();
  if (email) {
    const at = email.indexOf("@");
    return at > 0 ? email.slice(0, at) : email;
  }
  return "System";
}

/**
 * "3.05.2026, 14:30:25" — preferowany format daty event logu (zgodny z
 * referencyjnym screenshotem od user'a).
 */
export function formatEventTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // toLocaleString(pl-PL) z preferowanym formatem 24h.
  // Wynik: "3.05.2026, 14:30:25" — dla dwucyfrowych dni.
  // toLocaleString bywa różnie sformatowany w różnych ICU (np.
  // Node 18 vs 20). Składamy ręcznie żeby mieć stabilny output, który
  // też wygodnie testować.
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${day}.${String(month).padStart(2, "0")}.${year}, ${hh}:${mm}:${ss}`;
}
