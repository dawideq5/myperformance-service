export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { log } from "@/lib/logger";
import { getUserIdByEmail, notifyUser } from "@/lib/notify";

const logger = log.child({ module: "outline-webhook" });

/**
 * Outline webhook — events: documents.publish, documents.update,
 * comments.create, mentions itd.
 *
 * Konfiguracja po stronie Outline (Settings → Webhooks):
 *   URL: https://myperformance.pl/api/webhooks/outline
 *   Secret: env OUTLINE_WEBHOOK_SECRET (HMAC-SHA256)
 *   Events: comments.create, documents.publish, documents.update,
 *           revisions.create
 *
 * Auth: HMAC sygnatura w `Outline-Signature` header (format:
 * `t=<timestamp>,s=<hex-hmac>` lub plain hex w starszych wersjach).
 * Fail-closed: bez secret zwracamy 503.
 */

interface OutlineEvent {
  id?: string;
  event?: string;
  webhookSubscriptionId?: string;
  payload?: {
    id?: string;
    model?: {
      id?: string;
      title?: string;
      url?: string;
      data?: string;
      collectionId?: string;
      createdById?: string;
      updatedAt?: string;
      // dla comments.create
      documentId?: string;
      // dla mentions wewnątrz body — Outline emituje osobny event mentions.*
    };
  };
  createdById?: string;
  // mentions extracted z body:
  mentions?: Array<{ userId?: string; modelId?: string }>;
}

type VerifyResult = "ok" | "no-secret" | "no-signature" | "bad-signature";

function verifySignature(rawBody: string, headerValue: string | null): VerifyResult {
  const secret = process.env.OUTLINE_WEBHOOK_SECRET?.trim();
  if (!secret) return "no-secret";
  if (!headerValue) return "no-signature";

  // Outline format: "t=1700000000,s=hexhash" lub samo hex.
  let provided = headerValue.trim();
  let timestamp = "";
  if (provided.includes("t=") && provided.includes("s=")) {
    const m = provided.match(/t=(\d+),s=([a-f0-9]+)/i);
    if (!m) return "bad-signature";
    timestamp = m[1];
    provided = m[2];
  }

  const payloadToSign = timestamp ? `${timestamp}.${rawBody}` : rawBody;
  const expected = createHmac("sha256", secret).update(payloadToSign).digest("hex");

  if (provided.length !== expected.length) return "bad-signature";
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"))
      ? "ok"
      : "bad-signature";
  } catch {
    return "bad-signature";
  }
}

interface OutlineUserMin {
  id?: string;
  email?: string;
  name?: string;
}

async function fetchOutlineUserEmail(userId: string): Promise<string | null> {
  const apiUrl = process.env.OUTLINE_URL?.replace(/\/$/, "");
  const apiToken = process.env.OUTLINE_API_TOKEN;
  if (!apiUrl || !apiToken) return null;
  try {
    const res = await fetch(`${apiUrl}/api/users.info`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: userId }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: OutlineUserMin };
    return data.data?.email?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const sig = req.headers.get("outline-signature") ?? req.headers.get("x-outline-signature");
  const verdict = verifySignature(rawBody, sig);

  if (verdict === "no-secret") {
    logger.error("OUTLINE_WEBHOOK_SECRET nie ustawiony — odrzucam (fail-closed)");
    return NextResponse.json(
      { error: "webhook secret not configured" },
      { status: 503 },
    );
  }
  if (verdict !== "ok") {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  let event: OutlineEvent;
  try {
    event = JSON.parse(rawBody) as OutlineEvent;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const eventType = event.event ?? "";
  const model = event.payload?.model;
  const docTitle = model?.title ?? "(bez tytułu)";
  const docUrl = model?.url
    ? `${process.env.OUTLINE_URL?.replace(/\/$/, "") ?? "https://knowledge.myperformance.pl"}${model.url}`
    : `${process.env.OUTLINE_URL?.replace(/\/$/, "") ?? "https://knowledge.myperformance.pl"}/doc/${model?.id ?? ""}`;

  // Extract mentions from comment/document body. Outline embeds mentions
  // jako `<mention type="user" id="...">` w richtext — albo jako payload.mentions.
  const mentionUserIds: string[] = [];
  if (Array.isArray(event.mentions)) {
    for (const m of event.mentions) {
      if (m.userId) mentionUserIds.push(m.userId);
    }
  }
  if (model?.data && typeof model.data === "string") {
    const re = /mention[^>]*\bid="([a-f0-9-]+)"/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(model.data)) !== null) {
      mentionUserIds.push(m[1]);
    }
  }

  // Mentions: notify każdego wspomnianego usera.
  for (const outlineUserId of new Set(mentionUserIds)) {
    const email = await fetchOutlineUserEmail(outlineUserId);
    if (!email) continue;
    const kcUserId = await getUserIdByEmail(email);
    if (!kcUserId) continue;
    await notifyUser(kcUserId, "knowledge.mention", {
      title: `Wspomniano o Tobie: ${docTitle}`,
      body: `Ktoś wspomniał o Tobie w dokumencie „${docTitle}". Otwórz Knowledge, aby zobaczyć kontekst.`,
      severity: "info",
      payload: { docUrl, eventType },
    }).catch((err) =>
      logger.warn("notify mention failed", {
        err: String(err),
        kcUserId,
      }),
    );
  }

  // Per-event notifications.
  if (eventType === "comments.create") {
    // Komentarz pod dokumentem — notify autora dokumentu (jeśli to nie on
    // skomentował). Outline emituje createdById = autor komentarza.
    const docCreatorId = model?.createdById;
    const commenterId = event.createdById;
    if (docCreatorId && docCreatorId !== commenterId) {
      const email = await fetchOutlineUserEmail(docCreatorId);
      if (email) {
        const kcUserId = await getUserIdByEmail(email);
        if (kcUserId) {
          await notifyUser(kcUserId, "knowledge.comment.created", {
            title: `Nowy komentarz: ${docTitle}`,
            body: `Pod Twoim dokumentem „${docTitle}" pojawił się nowy komentarz.`,
            severity: "info",
            payload: { docUrl, eventType },
          }).catch(() => undefined);
        }
      }
    }
  } else if (eventType === "documents.publish") {
    const authorId = model?.createdById;
    if (authorId) {
      const email = await fetchOutlineUserEmail(authorId);
      if (email) {
        const kcUserId = await getUserIdByEmail(email);
        if (kcUserId) {
          await notifyUser(kcUserId, "knowledge.document.published", {
            title: `Opublikowano: ${docTitle}`,
            body: `Twój dokument „${docTitle}" został opublikowany w Knowledge.`,
            severity: "success",
            payload: { docUrl, eventType },
          }).catch(() => undefined);
        }
      }
    }
  } else if (eventType === "documents.update" || eventType === "revisions.create") {
    // Update emituje notify TYLKO dla mentioned userów (już obsłużone wyżej)
    // — nie spamujemy autora przy każdym zapisie własnego dokumentu.
  }

  logger.info("outline webhook handled", {
    eventType,
    docTitle,
    mentions: mentionUserIds.length,
  });
  return NextResponse.json({ ok: true });
}
