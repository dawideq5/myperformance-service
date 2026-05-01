/**
 * Outline (knowledge base) — wspomnienia / komentarze.
 *
 * Stan obecny: webhook handler (/api/webhooks/outline) jest pełny i
 * obsługuje:
 *   - mentions (knowledge.mention)
 *   - comments.create (knowledge.comment.created)
 *   - documents.publish (knowledge.document.published)
 *
 * Ten plik jest SKELETONEM dla polling fallback (gdy webhook delivery
 * worker zawiedzie). TODO:
 *  - [ ] Outline API: POST /api/notifications.list (per user) zwraca
 *        userowe powiadomienia. Wymaga per-user API tokena albo admin
 *        token z impersonation header.
 *  - [ ] Cursor: `mp_outline_notif_cursor` (kc_user_id, last_notification_id).
 *  - [ ] Mapping outline.user.email → KC userId (getUserIdByEmail).
 *  - [ ] Wywołanie notifyUser z event "knowledge.mention".
 *
 * Documenso/Moodle/Outline mają różne nominalnie eventy w katalogu
 * (knowledge.mention vs knowledge.comment.created vs
 * knowledge.document.published) — polling wybiera odpowiedni event_key
 * w zależności od kategorii notyfikacji Outline.
 */
import { log } from "@/lib/logger";

const logger = log.child({ module: "outline-notifications" });

export async function pollOutlineNotifications(): Promise<{ processed: number }> {
  // TODO: implement — patrz docstring powyżej
  logger.debug("pollOutlineNotifications skeleton — not implemented yet");
  return { processed: 0 };
}
