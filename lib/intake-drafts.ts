/**
 * Intake draft store — Wave 24 / dashboard-app overlay.
 *
 * Sprzedawca wypełnia formularz intake i równolegle prowadzi rozmowę
 * w Chatwoocie. Zanim zlecenie zostanie zapisane (`mp_services` row),
 * agent obsługujący conversation chce widzieć stan formularza w iframe
 * Dashboard App. Klucz po stronie dashboard app to `conversation_id`
 * (Chatwoot zna go zawsze — `{{conversation.id}}`), nie `service_id`
 * (który nie istnieje przed zapisem).
 *
 * Flow:
 *   1. AddServiceForm w panelu sprzedawcy publikuje stan POST'em do
 *      /api/panel/intake-drafts ~co 2 s gdy `chatwoot:on-message`
 *      ujawnił `conversationId` (idle skip — tylko gdy zmienił się
 *      payload).
 *   2. Dashboard App polluje GET /api/livekit/conversation-snapshot
 *      ?conversation_id=X co 4 s i renderuje sanitized payload.
 *   3. TTL 24 h — stale drafty usuwa cron (`/api/cron/cleanup-drafts`)
 *      lub manual purge.
 *
 * NOT a SoT: rzeczywisty service zapisuje się dopiero przy submit
 * formularza i staje się właścicielem snapshotu (intake-snapshot
 * endpoint). Draft to ephemeral co-edit log.
 */

import { withClient } from "@/lib/db";
import { log } from "@/lib/logger";

const logger = log.child({ module: "intake-drafts" });

/**
 * Sanitized payload — pola bezpieczne do pokazania agentowi Chatwoota.
 * NIGDY nie wkładamy tu `lockCode`, `patternLock`, ani innych wrażliwych.
 * AddServiceForm filtruje na serializacji.
 */
export interface IntakeDraftPayload {
  brand?: string | null;
  model?: string | null;
  imei?: string | null;
  color?: string | null;
  lockType?: string | null;
  description?: string | null;
  amountEstimate?: number | null;
  customerFirstName?: string | null;
  customerLastName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  repairTypes?: string[] | null;
  /** Display flag — true gdy formularz spełnia walidację submit. */
  readyToSubmit?: boolean;
  /** Po zapisie ticketu — link do already-saved service. */
  serviceId?: string | null;
  ticketNumber?: string | null;
}

export interface IntakeDraft {
  conversationId: number;
  payload: IntakeDraftPayload;
  locationId: string | null;
  salesEmail: string | null;
  serviceId: string | null;
  updatedAt: string;
  createdAt: string;
}

interface Row {
  conversation_id: string;
  payload: IntakeDraftPayload;
  location_id: string | null;
  sales_email: string | null;
  service_id: string | null;
  updated_at: string;
  created_at: string;
}

function mapRow(r: Row): IntakeDraft {
  return {
    conversationId: Number(r.conversation_id),
    payload: r.payload,
    locationId: r.location_id,
    salesEmail: r.sales_email,
    serviceId: r.service_id,
    updatedAt: r.updated_at,
    createdAt: r.created_at,
  };
}

let schemaReady = false;

/**
 * Idempotent schema bootstrap. Konwersacja jest unique key — sprzedawca
 * w jednej conversation Chatwoota nadpisuje tę samą wiersz.
 */
export async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await withClient(async (c) => {
    await c.query(`
      CREATE TABLE IF NOT EXISTS mp_intake_drafts (
        conversation_id  BIGINT PRIMARY KEY,
        payload          JSONB NOT NULL DEFAULT '{}'::jsonb,
        location_id      TEXT,
        sales_email      TEXT,
        service_id       TEXT,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await c.query(`
      CREATE INDEX IF NOT EXISTS mp_intake_drafts_updated_idx
        ON mp_intake_drafts (updated_at DESC);
    `);
    await c.query(`
      CREATE INDEX IF NOT EXISTS mp_intake_drafts_service_idx
        ON mp_intake_drafts (service_id) WHERE service_id IS NOT NULL;
    `);
  });
  schemaReady = true;
}

export interface UpsertDraftInput {
  conversationId: number;
  payload: IntakeDraftPayload;
  locationId: string | null;
  salesEmail: string | null;
  serviceId?: string | null;
}

export async function upsertDraft(input: UpsertDraftInput): Promise<IntakeDraft> {
  await ensureSchema();
  return withClient(async (c) => {
    const r = await c.query<Row>(
      `
        INSERT INTO mp_intake_drafts
          (conversation_id, payload, location_id, sales_email, service_id, updated_at)
        VALUES ($1, $2::jsonb, $3, $4, $5, now())
        ON CONFLICT (conversation_id) DO UPDATE
          SET payload     = EXCLUDED.payload,
              location_id = COALESCE(EXCLUDED.location_id, mp_intake_drafts.location_id),
              sales_email = COALESCE(EXCLUDED.sales_email, mp_intake_drafts.sales_email),
              service_id  = COALESCE(EXCLUDED.service_id,  mp_intake_drafts.service_id),
              updated_at  = now()
        RETURNING *;
      `,
      [
        input.conversationId,
        JSON.stringify(input.payload ?? {}),
        input.locationId,
        input.salesEmail,
        input.serviceId ?? null,
      ],
    );
    logger.info("intake draft upserted", {
      conversationId: input.conversationId,
      hasServiceId: !!input.serviceId,
    });
    return mapRow(r.rows[0]);
  });
}

export async function getDraft(conversationId: number): Promise<IntakeDraft | null> {
  await ensureSchema();
  return withClient(async (c) => {
    const r = await c.query<Row>(
      `SELECT * FROM mp_intake_drafts WHERE conversation_id = $1 LIMIT 1;`,
      [conversationId],
    );
    if (r.rowCount === 0) return null;
    return mapRow(r.rows[0]);
  });
}

/**
 * Bind a saved service to an existing draft after submit. Used by
 * intake submit handler so Dashboard App polling continues seamlessly
 * (snapshot returns service_id and IntakePreviewClient swaps to
 * `intake-snapshot` data source on next tick).
 */
export async function bindServiceToDraft(
  conversationId: number,
  serviceId: string,
): Promise<void> {
  await ensureSchema();
  await withClient(async (c) => {
    await c.query(
      `
        UPDATE mp_intake_drafts
           SET service_id = $1, updated_at = now()
         WHERE conversation_id = $2;
      `,
      [serviceId, conversationId],
    );
  });
}

/**
 * Purge stale drafts older than `ttlHours`. Idempotent — bezpiecznie
 * wywoływać z crona co kilka godzin.
 */
export async function purgeStaleDrafts(ttlHours = 24): Promise<number> {
  await ensureSchema();
  return withClient(async (c) => {
    const r = await c.query(
      `DELETE FROM mp_intake_drafts WHERE updated_at < now() - ($1 || ' hours')::interval;`,
      [String(ttlHours)],
    );
    return r.rowCount ?? 0;
  });
}
