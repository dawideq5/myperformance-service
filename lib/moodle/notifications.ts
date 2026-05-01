/**
 * Moodle — polling job dla nowych ocen.
 *
 * Stan obecny: SZKIELET. Pełna implementacja wymaga:
 *   - per-user cursor (tabela `mp_moodle_grade_cursor` z user_id +
 *     last_grade_id) — analogicznie do `mp_chatwoot_inbox_cursor`.
 *   - SELECT z mdl_grade_grades joined z mdl_grade_items + mdl_user
 *     filtrujący po `id > cursor` per usera.
 *   - mapping moodle.user.email → KC userId (już dostępne w
 *     lib/notify.ts: `getUserIdByEmail`).
 *
 * Real-time delivery jest pokrywane przez webhook
 * /api/webhooks/moodle (event \core\event\user_graded). Ten polling job
 * jest TYLKO bezpiecznikiem na wypadek gdyby webhook delivery zawiódł
 * (Moodle external listener config / network).
 *
 * TODO:
 *  - [ ] CREATE TABLE mp_moodle_grade_cursor (kc_user_id, last_grade_id)
 *  - [ ] SQL: SELECT g.id, gi.itemname, gi.iteminstance, c.fullname,
 *        u.email, g.finalgrade FROM mdl_grade_grades g JOIN mdl_grade_items gi
 *        JOIN mdl_user u JOIN mdl_course c WHERE g.id > $cursor AND
 *        g.finalgrade IS NOT NULL ORDER BY g.id LIMIT 200
 *  - [ ] notifyUser per row z event "moodle.new_grade"
 *  - [ ] Wire scheduler w instrumentation.ts (interval 5 min)
 *  - [ ] Graceful degrade gdy MOODLE_DB_URL nieskonfigurowane
 */
import { log } from "@/lib/logger";

const logger = log.child({ module: "moodle-notifications" });

export async function pollMoodleNewGrades(): Promise<{ processed: number }> {
  // TODO: implement — patrz docstring powyżej
  logger.debug("pollMoodleNewGrades skeleton — not implemented yet");
  return { processed: 0 };
}
