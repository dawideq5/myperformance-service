/**
 * Documenso — fallback polling dla pending signing requests.
 *
 * Webhook /api/webhooks/documenso już obsługuje real-time DOCUMENT_SENT
 * → documents.signature.requested. Ten plik jest SKELETONEM dla recovery
 * job na wypadek gdyby webhook był miss (np. dashboard down podczas wysyłki).
 *
 * TODO:
 *  - [ ] Cursor: `mp_documenso_pending_cursor` (kc_user_id, doc_id).
 *  - [ ] Documenso API: GET /api/v1/documents?status=PENDING — wymaga
 *        per-user API tokena (Documenso API key per user). Alternatywa:
 *        DOCUMENSO_DATABASE_URL — query bezpośrednio do Documenso DB:
 *        SELECT d.id, d.title, r.email, r.name FROM documents d
 *          JOIN recipients r ON r.document_id = d.id
 *         WHERE r.signed_at IS NULL AND d.status = 'PENDING'
 *           AND d.created_at > now() - interval '7 days'
 *  - [ ] Per-recipient: getUserIdByEmail + notifyUser z event
 *        "documenso.signing_request".
 */
import { log } from "@/lib/logger";

const logger = log.child({ module: "documenso-notifications" });

export async function pollDocumensoSigningRequests(): Promise<{ processed: number }> {
  // TODO: implement — patrz docstring powyżej
  logger.debug("pollDocumensoSigningRequests skeleton — not implemented yet");
  return { processed: 0 };
}
