import { getOptionalEnv } from "@/lib/env";
import { log } from "@/lib/logger";

/**
 * Postal historia wiadomości — outbound (sent przez Postal) + inbound
 * (delivery dla skrzynek Postal). Używa Postal Web API (server-scoped).
 *
 * Endpoints:
 *   POST /api/v1/send/messages    → query po recipient/sender/from/to (paginated)
 *   POST /api/v1/messages/message → szczegóły jednego message (HTML+plain+headers)
 *
 * Best-effort: gdy Postal nie skonfigurowany albo API zwraca błąd —
 * zwracamy pustą listę + log warning. Konsument decyduje jak reagować.
 */

const logger = log.child({ module: "postal-history" });

export type Direction = "outbound" | "inbound";

export interface EmailMessageSummary {
  id: number;
  token: string;
  subject: string;
  from: string;
  to: string;
  status: string;
  direction: Direction;
  /** unix seconds (from Postal API). */
  timestamp: number;
  spamScore?: number;
  bounce?: boolean;
}

export interface EmailMessageDetail extends EmailMessageSummary {
  htmlBody: string | null;
  textBody: string | null;
  /** Surowe nagłówki do debug. */
  headers?: Record<string, string[]>;
  attachments: Array<{
    id?: string;
    filename: string;
    contentType: string;
    size: number;
  }>;
}

interface PostalConfig {
  baseUrl: string;
  apiKey: string;
  serverId: number;
}

function getConfig(): PostalConfig | null {
  const baseUrl = getOptionalEnv("POSTAL_API_URL");
  const apiKey = getOptionalEnv("POSTAL_SERVER_API_KEY");
  const sid = getOptionalEnv("POSTAL_SERVER_ID");
  if (!baseUrl || !apiKey || !sid) return null;
  const serverId = Number(sid);
  if (!Number.isFinite(serverId)) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey, serverId };
}

export function isPostalHistoryConfigured(): boolean {
  return getConfig() !== null;
}

async function callPostal<T = unknown>(
  cfg: PostalConfig,
  path: string,
  body: Record<string, unknown>,
): Promise<T | null> {
  try {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "X-Server-API-Key": cfg.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ ...body, server_id: cfg.serverId }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      logger.warn("postal API error", { path, status: res.status });
      return null;
    }
    const json = (await res.json()) as { data?: T; status?: string };
    return (json.data ?? null) as T | null;
  } catch (err) {
    logger.warn("postal request failed", {
      path,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

interface PostalMessageRow {
  id: number;
  token: string;
  status: string;
  to: string;
  from: string;
  subject: string;
  timestamp: number;
  bounce?: boolean;
  spam_score?: number;
}

function mapRow(row: PostalMessageRow, direction: Direction): EmailMessageSummary {
  return {
    id: row.id,
    token: row.token,
    subject: row.subject ?? "",
    from: row.from ?? "",
    to: row.to ?? "",
    status: row.status ?? "",
    direction,
    timestamp: row.timestamp ?? 0,
    spamScore: row.spam_score,
    bounce: row.bounce,
  };
}

/**
 * Outbound: pobierz mail wysłane Z `email` (mail_from / sender) — Postal
 * `/api/v1/send/messages` używa filtrów `from` / `to`. Tu szukamy wiadomości
 * gdzie email = nadawca (outbound) ALBO odbiorca (inbound) — łączymy oba.
 */
export async function listMessagesForAddress(
  email: string,
  opts: { limit?: number } = {},
): Promise<EmailMessageSummary[]> {
  const cfg = getConfig();
  if (!cfg || !email) return [];
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);

  const [out, inb] = await Promise.all([
    callPostal<{ messages?: PostalMessageRow[] }>(cfg, "/api/v1/send/messages", {
      per_page: limit,
      from: email,
    }),
    callPostal<{ messages?: PostalMessageRow[] }>(cfg, "/api/v1/send/messages", {
      per_page: limit,
      to: email,
    }),
  ]);

  const merged: EmailMessageSummary[] = [];
  (out?.messages ?? []).forEach((r) => merged.push(mapRow(r, "outbound")));
  (inb?.messages ?? []).forEach((r) => merged.push(mapRow(r, "inbound")));

  // Deduplikuj po id (gdyby wiadomość trafiła w obu zapytaniach).
  const byId = new Map<number, EmailMessageSummary>();
  for (const m of merged) {
    if (!byId.has(m.id)) byId.set(m.id, m);
  }
  const list = Array.from(byId.values());
  list.sort((a, b) => b.timestamp - a.timestamp);
  return list.slice(0, limit);
}

interface PostalMessageDetailRow {
  id: number;
  token: string;
  status: string;
  to: string;
  from: string;
  subject: string;
  timestamp: number;
  message_id?: string;
  plain_body?: string | null;
  html_body?: string | null;
  attachments?: Array<{
    id?: string;
    filename?: string;
    content_type?: string;
    size?: number;
  }>;
  headers?: Record<string, string[]>;
}

/**
 * Pełna treść wiadomości (HTML + text + headers + attachments).
 * Postal expects POST /api/v1/messages/message with `_expansions` żeby
 * dostać body — `["plain_body","html_body","attachments","headers"]`.
 */
export async function getMessageDetail(
  id: number,
): Promise<EmailMessageDetail | null> {
  const cfg = getConfig();
  if (!cfg) return null;
  const data = await callPostal<PostalMessageDetailRow>(
    cfg,
    "/api/v1/messages/message",
    {
      id,
      _expansions: ["plain_body", "html_body", "attachments", "headers", "status"],
    },
  );
  if (!data) return null;
  // Direction nieznana z samego /messages/message — caller dostarczy via
  // listMessagesForAddress lookup. Tu zostawiamy default "outbound" i
  // pozwalamy konsumentowi nadpisać.
  const summary = mapRow(
    {
      id: data.id,
      token: data.token,
      status: data.status,
      to: data.to,
      from: data.from,
      subject: data.subject,
      timestamp: data.timestamp,
    },
    "outbound",
  );
  return {
    ...summary,
    htmlBody: data.html_body ?? null,
    textBody: data.plain_body ?? null,
    headers: data.headers,
    attachments: (data.attachments ?? []).map((a) => ({
      id: a.id,
      filename: a.filename ?? "attachment",
      contentType: a.content_type ?? "application/octet-stream",
      size: a.size ?? 0,
    })),
  };
}

/**
 * Pobierz binary attachment Postal po `messageId` + `attachmentId`. Postal
 * API zwraca attachment jako base64 w `_expansions=attachments` — nie ma
 * dedykowanego download endpointa. Zwracamy ArrayBuffer + meta.
 *
 * Best-effort: gdy nie znaleziono albo Postal nie skonfigurowany — null.
 */
export async function downloadAttachment(
  messageId: number,
  attachmentId: string,
): Promise<{
  filename: string;
  contentType: string;
  data: Buffer;
} | null> {
  const cfg = getConfig();
  if (!cfg) return null;
  interface PostalAttachmentBlob {
    id?: string;
    filename?: string;
    content_type?: string;
    size?: number;
    data?: string; // base64
  }
  const data = await callPostal<{ attachments?: PostalAttachmentBlob[] }>(
    cfg,
    "/api/v1/messages/message",
    {
      id: messageId,
      _expansions: ["attachments"],
    },
  );
  if (!data) return null;
  const att = (data.attachments ?? []).find((a) => a.id === attachmentId);
  if (!att || !att.data) return null;
  try {
    const buf = Buffer.from(att.data, "base64");
    return {
      filename: att.filename ?? "attachment",
      contentType: att.content_type ?? "application/octet-stream",
      data: buf,
    };
  } catch (err) {
    logger.warn("attachment decode failed", {
      messageId,
      attachmentId,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
