import { getOptionalEnv } from "@/lib/env";
import { log } from "@/lib/logger";

const logger = log.child({ module: "postal" });

export interface PostalMessage {
  id: number;
  token: string;
  status: string;
  rcptTo: string;
  mailFrom: string;
  subject: string;
  timestamp: number;
  spamScore?: number;
  bounce?: boolean;
}

function getConfig(): { baseUrl: string; apiKey: string; serverId: number } | null {
  const baseUrl = getOptionalEnv("POSTAL_API_URL") || "https://postal.myperformance.pl";
  const apiKey = getOptionalEnv("POSTAL_SERVER_API_KEY");
  const sid = getOptionalEnv("POSTAL_SERVER_ID");
  if (!apiKey || !sid) return null;
  const serverId = Number(sid);
  if (!Number.isFinite(serverId)) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey, serverId };
}

export function isPostalConfigured(): boolean {
  return getConfig() !== null;
}

/** Lista ostatnich maili wysłanych do `recipientEmail` przez Postal.
 * Best-effort — gdy Postal nie skonfigurowany albo API niedostępne,
 * zwraca [] i loguje ostrzeżenie. */
export async function listMessagesForRecipient(
  recipientEmail: string,
  limit = 20,
): Promise<PostalMessage[]> {
  const cfg = getConfig();
  if (!cfg) return [];
  if (!recipientEmail) return [];
  try {
    const res = await fetch(
      `${cfg.baseUrl}/api/v1/send/messages`,
      {
        method: "POST",
        headers: {
          "X-Server-API-Key": cfg.apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          per_page: limit,
          to: recipientEmail,
          server_id: cfg.serverId,
        }),
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!res.ok) {
      logger.warn("postal messages fetch failed", {
        status: res.status,
        recipient: recipientEmail,
      });
      return [];
    }
    const json = (await res.json()) as { data?: { messages?: unknown[] } };
    const messages = (json.data?.messages ?? []) as Array<{
      id: number;
      token: string;
      status: string;
      to: string;
      from: string;
      subject: string;
      timestamp: number;
      bounce?: boolean;
      spam_score?: number;
    }>;
    return messages.map((m) => ({
      id: m.id,
      token: m.token,
      status: m.status,
      rcptTo: m.to,
      mailFrom: m.from,
      subject: m.subject,
      timestamp: m.timestamp,
      spamScore: m.spam_score,
      bounce: m.bounce,
    }));
  } catch (err) {
    logger.warn("postal request failed", {
      err: String(err),
      recipient: recipientEmail,
    });
    return [];
  }
}
