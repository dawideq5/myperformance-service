<?php
namespace local_mpkc_sync;

defined('MOODLE_INTERNAL') || die();

/**
 * Syncs two things from the Keycloak ID token on every OIDC login:
 *
 *   1. user.confirmed ← email_verified claim
 *   2. siteadmins     ← realm role `moodle_manager`
 *
 * The realm roles live in the JWT's realm_access.roles array. We promote
 * a user to Moodle siteadmin iff they have `moodle_manager`, and demote them
 * if they lose it. Teachers/students are handled at course-level enrolment
 * by Moodle admins — Moodle's "Manager" role isn't a useful system-wide
 * proxy for `moodle_editingteacher`.
 */
class observer {

    private const KC_ADMIN_ROLE = 'moodle_manager';

    public static function on_login(\core\event\user_loggedin $event): void {
        global $DB, $CFG;

        $userid = (int) $event->objectid;
        if ($userid <= 0) {
            return;
        }

        $user = $DB->get_record('user', ['id' => $userid, 'deleted' => 0]);
        if (!$user || $user->auth !== 'oidc') {
            return;
        }

        $tokenrec = $DB->get_record(
            'auth_oidc_token',
            ['userid' => $userid],
            '*',
            IGNORE_MULTIPLE
        );
        if (!$tokenrec || empty($tokenrec->idtoken)) {
            return;
        }

        $claims = self::decode_payload($tokenrec->idtoken);
        if ($claims === null) {
            return;
        }

        self::sync_email_verified($user, $claims);
        self::sync_siteadmin($user, $claims);
    }

    private static function sync_email_verified(\stdClass $user, array $claims): void {
        global $DB;
        if (!array_key_exists('email_verified', $claims)) {
            return;
        }
        $target = !empty($claims['email_verified']) ? 1 : 0;
        if ((int) $user->confirmed === $target) {
            return;
        }
        $DB->update_record(
            'user',
            (object)['id' => $user->id, 'confirmed' => $target]
        );
    }

    private static function sync_siteadmin(\stdClass $user, array $claims): void {
        global $CFG;
        $roles = self::extract_realm_roles($claims);
        $shouldBeAdmin = in_array(self::KC_ADMIN_ROLE, $roles, true);

        $admins = array_filter(
            array_map('intval', explode(',', (string) $CFG->siteadmins))
        );
        $isAdmin = in_array((int) $user->id, $admins, true);

        if ($shouldBeAdmin === $isAdmin) {
            return;
        }

        if ($shouldBeAdmin) {
            $admins[] = (int) $user->id;
        } else {
            // Guard: never demote the last remaining site admin.
            if (count($admins) <= 1) {
                return;
            }
            $admins = array_values(array_diff($admins, [(int) $user->id]));
        }

        set_config('siteadmins', implode(',', array_unique($admins)));
    }

    /**
     * Realm roles in KC land inside `realm_access.roles` on the ID token.
     */
    private static function extract_realm_roles(array $claims): array {
        $ra = $claims['realm_access'] ?? null;
        if (!is_array($ra)) return [];
        $roles = $ra['roles'] ?? null;
        return is_array($roles) ? array_values(array_filter($roles, 'is_string')) : [];
    }

    private static function decode_payload(string $idtoken): ?array {
        $parts = explode('.', $idtoken);
        if (count($parts) < 2) {
            return null;
        }
        $payload = base64_decode(strtr($parts[1], '-_', '+/'));
        if ($payload === false) {
            return null;
        }
        $data = json_decode($payload, true);
        return is_array($data) ? $data : null;
    }
}
