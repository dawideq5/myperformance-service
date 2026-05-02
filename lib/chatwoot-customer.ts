/**
 * Chatwoot customer-facing integration — tworzenie kontaktów i rozmów dla
 * klientów serwisowych (mp_services). Używa Platform API (CHATWOOT_PLATFORM_TOKEN)
 * + account-scoped Application API endpoints.
 *
 * Opt-in: pełna integracja (auto create conversation przy POST mp_services)
 * aktywuje się tylko gdy ustawione `CHATWOOT_SERVICE_INBOX_ID`. Bez tej zmiennej
 * `notifyServiceStatusChange` i `createServiceConversation` zwracają null bez
 * błędu — service module działa bez Chatwoota.
 */
import { getOptionalEnv } from "@/lib/env";
import { log } from "@/lib/logger";

const logger = log.child({ module: "chatwoot-customer" });

interface ChatwootConfig {
  baseUrl: string;
  platformToken: string;
  accountId: number;
  serviceInboxId: number | null;
}

function getConfig(): ChatwootConfig | null {
  const baseUrl = getOptionalEnv("CHATWOOT_URL").trim().replace(/\/$/, "");
  const platformToken = getOptionalEnv("CHATWOOT_PLATFORM_TOKEN").trim();
  const accountIdRaw = getOptionalEnv("CHATWOOT_ACCOUNT_ID", "1").trim();
  if (!baseUrl || !platformToken) return null;
  const accountId = Number(accountIdRaw);
  if (!Number.isFinite(accountId)) return null;
  const inboxRaw = getOptionalEnv("CHATWOOT_SERVICE_INBOX_ID").trim();
  const serviceInboxId = inboxRaw ? Number(inboxRaw) : null;
  return {
    baseUrl,
    platformToken,
    accountId,
    serviceInboxId: Number.isFinite(serviceInboxId) ? serviceInboxId : null,
  };
}

async function chatwootFetch(
  cfg: ChatwootConfig,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      "api_access_token": cfg.platformToken,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
}

interface ChatwootContact {
  id: number;
  name: string;
  email: string | null;
  phone_number: string | null;
}

/**
 * Find lub create kontakt po telefonie albo email. Zwraca contactId.
 * Najpierw szuka po identifier — jeśli brak, tworzy. Identifier =
 * `service-{phone||email}` żeby kolejne serwisy tego samego klienta wpadały
 * pod ten sam contact.
 */
async function findOrCreateContact(
  cfg: ChatwootConfig,
  args: {
    name: string;
    phone?: string | null;
    email?: string | null;
  },
): Promise<number | null> {
  const identifier = (args.phone || args.email || "").trim();
  if (!identifier) return null;
  // Search po identifier:
  try {
    const r = await chatwootFetch(
      cfg,
      `/api/v1/accounts/${cfg.accountId}/contacts/search?q=${encodeURIComponent(identifier)}&include=contact_inboxes`,
    );
    if (r.ok) {
      const data = (await r.json()) as { payload?: ChatwootContact[] };
      const found = data.payload?.[0];
      if (found?.id) return found.id;
    }
  } catch (err) {
    logger.warn("contact search failed", { err: String(err) });
  }
  // Create:
  try {
    const r = await chatwootFetch(
      cfg,
      `/api/v1/accounts/${cfg.accountId}/contacts`,
      {
        method: "POST",
        body: JSON.stringify({
          name: args.name,
          phone_number: args.phone ?? undefined,
          email: args.email ?? undefined,
          identifier: `mp-svc-${identifier}`,
        }),
      },
    );
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      logger.warn("contact create failed", { status: r.status, body: text.slice(0, 200) });
      return null;
    }
    const data = (await r.json()) as { payload?: { contact?: ChatwootContact } };
    return data.payload?.contact?.id ?? null;
  } catch (err) {
    logger.warn("contact create error", { err: String(err) });
    return null;
  }
}

interface ChatwootConversation {
  id: number;
}

/**
 * Tworzy rozmowę w Chatwoot dla nowego serwisu. Zwraca conversation_id albo
 * null gdy chatwoot nie jest skonfigurowany (CHATWOOT_SERVICE_INBOX_ID nieset).
 *
 * Pierwsza wiadomość = info z numerem zgłoszenia + opisem usterki.
 */
export async function createServiceConversation(args: {
  ticketNumber: string;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  brand?: string | null;
  model?: string | null;
  description?: string | null;
}): Promise<number | null> {
  const cfg = getConfig();
  if (!cfg || !cfg.serviceInboxId) return null;

  const contactId = await findOrCreateContact(cfg, {
    name: args.customerName,
    phone: args.customerPhone,
    email: args.customerEmail,
  });
  if (!contactId) return null;

  const initialMessage = [
    `Cześć! Twoje urządzenie ${[args.brand, args.model].filter(Boolean).join(" ") || "(brak detali)"} zostało przyjęte do serwisu.`,
    `Numer zgłoszenia: ${args.ticketNumber}.`,
    args.description
      ? `Zgłoszony problem: ${args.description}`
      : null,
    `Będziemy informować Cię o postępach. W razie pytań odpisz tutaj.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const r = await chatwootFetch(
      cfg,
      `/api/v1/accounts/${cfg.accountId}/conversations`,
      {
        method: "POST",
        body: JSON.stringify({
          source_id: `mp-svc-${args.ticketNumber}`,
          inbox_id: cfg.serviceInboxId,
          contact_id: contactId,
          status: "open",
          message: { content: initialMessage, message_type: "outgoing" },
          additional_attributes: {
            ticket_number: args.ticketNumber,
            source: "mp-services",
          },
        }),
      },
    );
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      logger.warn("conversation create failed", {
        status: r.status,
        body: text.slice(0, 200),
      });
      return null;
    }
    const data = (await r.json()) as ChatwootConversation;
    return data?.id ?? null;
  } catch (err) {
    logger.warn("conversation create error", { err: String(err) });
    return null;
  }
}

/**
 * Wysyła wiadomość do istniejącej rozmowy (np. powiadomienie o zmianie statusu).
 * No-op gdy conversationId null albo Chatwoot nieconfigurowany.
 */
export async function sendServiceMessage(
  conversationId: number | null,
  message: string,
): Promise<boolean> {
  if (!conversationId) return false;
  const cfg = getConfig();
  if (!cfg) return false;
  try {
    const r = await chatwootFetch(
      cfg,
      `/api/v1/accounts/${cfg.accountId}/conversations/${conversationId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          content: message,
          message_type: "outgoing",
        }),
      },
    );
    return r.ok;
  } catch (err) {
    logger.warn("sendServiceMessage failed", { err: String(err) });
    return false;
  }
}

const STATUS_MESSAGES: Record<string, string> = {
  diagnosing:
    "Twoje urządzenie zostało przekazane technikowi do diagnozy. Damy znać, gdy będziemy mieli wyniki.",
  awaiting_quote:
    "Mamy dla Ciebie wycenę naprawy. Sprawdź szczegóły i daj nam znać, czy akceptujesz zlecenie.",
  awaiting_parts:
    "Czekamy na dostawę części niezbędnych do naprawy Twojego urządzenia. Poinformujemy, gdy ruszymy z pracą.",
  repairing:
    "Rozpoczęliśmy naprawę Twojego urządzenia. Damy znać, gdy będzie gotowe.",
  testing:
    "Naprawa zakończona — testujemy działanie urządzenia. Wkrótce będzie gotowe do odbioru.",
  ready:
    "Twoje urządzenie jest gotowe do odbioru! Zapraszamy do naszego punktu w godzinach otwarcia.",
  delivered:
    "Dziękujemy za skorzystanie z naszego serwisu! Mamy nadzieję, że jesteś zadowolony/a z naprawy.",
  on_hold:
    "Realizacja zlecenia została chwilowo wstrzymana. Odezwiemy się, gdy będziemy mogli kontynuować.",
  rejected_by_customer:
    "Zgodnie z Twoją decyzją wstrzymaliśmy naprawę. Urządzenie jest przygotowywane do zwrotu.",
  returned_no_repair:
    "Twoje urządzenie zostało zwrócone bez przeprowadzenia naprawy. Dziękujemy za kontakt z nami.",
  closed:
    "Zlecenie zostało zamknięte. W razie pytań pozostajemy do dyspozycji.",
  cancelled:
    "Niestety zlecenie zostało anulowane. W razie pytań odpisz tutaj.",
};

export interface CustomerConversationSummary {
  id: number;
  status: string;
  unreadCount: number;
  lastMessageAt: number | null;
  lastMessagePreview: string | null;
}

/**
 * Wyszukuje rozmowy Chatwoot przypisane do klienta (po telefonie / emailu).
 * Wewnętrznie:
 *   1. Search po identifier (phone, potem email).
 *   2. Dla pierwszego pasującego kontaktu pobiera listę conversations.
 *
 * Zwraca pustą tablicę gdy:
 *   - Chatwoot nieconfigurowany,
 *   - brak phone/email,
 *   - kontakt nie istnieje w Chatwoocie,
 *   - błąd API (best-effort, błąd loggowany).
 */
export async function findCustomerConversations(args: {
  customerEmail?: string | null;
  customerPhone?: string | null;
  limit?: number;
}): Promise<CustomerConversationSummary[]> {
  const cfg = getConfig();
  if (!cfg) return [];
  const candidates = [args.customerPhone, args.customerEmail]
    .map((v) => (v ?? "").trim())
    .filter((v) => v.length > 0);
  if (candidates.length === 0) return [];

  let contactId: number | null = null;
  for (const ident of candidates) {
    try {
      const r = await chatwootFetch(
        cfg,
        `/api/v1/accounts/${cfg.accountId}/contacts/search?q=${encodeURIComponent(ident)}`,
      );
      if (!r.ok) continue;
      const data = (await r.json()) as { payload?: ChatwootContact[] };
      const found = data.payload?.[0];
      if (found?.id) {
        contactId = found.id;
        break;
      }
    } catch (err) {
      logger.warn("findCustomerConversations search failed", {
        ident,
        err: String(err),
      });
    }
  }
  if (!contactId) return [];

  try {
    const r = await chatwootFetch(
      cfg,
      `/api/v1/accounts/${cfg.accountId}/contacts/${contactId}/conversations`,
    );
    if (!r.ok) return [];
    interface ConvRow {
      id: number;
      status: string;
      unread_count?: number;
      last_activity_at?: number | string | null;
      messages?: Array<{
        content?: string | null;
        created_at?: number | string | null;
      }>;
    }
    const data = (await r.json()) as { payload?: ConvRow[] } | ConvRow[];
    const rows = Array.isArray(data) ? data : (data.payload ?? []);
    const max = Math.min(args.limit ?? 20, 50);
    return rows.slice(0, max).map((c) => {
      const lastMsg = (c.messages ?? [])[0];
      const lastTimestamp =
        typeof c.last_activity_at === "number"
          ? c.last_activity_at * 1000
          : c.last_activity_at
            ? new Date(c.last_activity_at).getTime()
            : null;
      return {
        id: c.id,
        status: c.status,
        unreadCount: c.unread_count ?? 0,
        lastMessageAt: Number.isFinite(lastTimestamp ?? NaN)
          ? lastTimestamp
          : null,
        lastMessagePreview:
          typeof lastMsg?.content === "string"
            ? lastMsg.content.slice(0, 200)
            : null,
      };
    });
  } catch (err) {
    logger.warn("findCustomerConversations list failed", {
      err: String(err),
      contactId,
    });
    return [];
  }
}

/**
 * Powiadomienie klienta o zmianie statusu — zwraca true gdy wysłano.
 */
export async function notifyServiceStatusChange(args: {
  conversationId: number | null;
  ticketNumber: string;
  newStatus: string;
}): Promise<boolean> {
  const template = STATUS_MESSAGES[args.newStatus];
  if (!template) return false;
  const msg = `${template}\n\nZgłoszenie: ${args.ticketNumber}`;
  return sendServiceMessage(args.conversationId, msg);
}
