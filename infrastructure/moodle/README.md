# Moodle LMS — MyPerformance Academy

**Usługa:** `moodle` (Coolify service, UUID `upzcjtn9rcswer2vg2vey5d3`)
**Domena docelowa:** `https://moodle.myperformance.pl`
**Kontener:** `bitnami/moodle:4.5` + `mariadb:10.11` (compose → `docker-compose.yml` obok)
**Realm Keycloak:** `MyPerformance`, klient `moodle` (seed przez `scripts/keycloak-seed.mjs`)
**Role realm:** `moodle_student`, `moodle_teacher`, `moodle_admin` (non-default — admin przypisuje ręcznie w `/admin/users`)

## `local_mpkc_sync` plugin

In-repo copy at `./local_mpkc_sync/` ships Moodle's Keycloak-sync observer.
On each OIDC login it:

- mirrors `email_verified` claim → `user.confirmed`
- promotes/demotes Moodle siteadmin based on realm role `moodle_admin`
  (guards against demoting the last remaining admin)

Install-time copy into Moodle and run upgrade:
```bash
cp -r infrastructure/moodle/local_mpkc_sync /bitnami/moodle/local/
chown -R daemon:daemon /bitnami/moodle/local/mpkc_sync
php /bitnami/moodle/admin/cli/upgrade.php --non-interactive
```

After install always reset perms because CLI scripts run as root:
```bash
chown -R daemon:daemon /bitnami/moodledata
find /bitnami/moodledata -type d -exec chmod 02775 {} \;
```

## Status

- [x] Compose w repo
- [x] Coolify service utworzony przez API (`POST /api/v1/applications/dockercompose`)
- [x] Env vars ustawione (hasła losowe, SMTP przez Postal)
- [x] KC realm role utworzone
- [x] KC klient `moodle` utworzony (secret zapisany w Coolify przy deployu Moodle)
- [x] Kafelki Moodle w dashboardzie (gated rolami)
- [ ] **FQDN ustawiony w Coolify UI** — ręcznie, API nie obsługuje service-nested FQDN (patrz `feedback_coolify_api_fqdn`)
- [ ] **Pierwszy deploy** — z UI Coolify po ustawieniu FQDN
- [ ] Plugin `auth_oidc` zainstalowany (ręcznie w Moodle admin)
- [ ] OIDC discovery ustawione na `https://auth.myperformance.pl/realms/MyPerformance/.well-known/openid-configuration`
- [ ] Role mapping w Moodle (manual assignment albo `local_oauth2rolemapping`)

## Next steps (user w UI)

1. **FQDN:** Coolify → Projects → myperformance → moodle service → edytuj kontener `moodle` → Domains → `https://moodle.myperformance.pl:8080`. Zapisz.
2. **Deploy:** kliknij Deploy. Pierwszy boot trwa 5–10 min (Moodle instaluje schemat).
3. **Login:** zaloguj się jako `admin` / `$MOODLE_ADMIN_PASSWORD` (zapisane w envs Coolify — kliknij "ukryj" żeby podejrzeć).
4. **Plugin OIDC:** Site administration → Plugins → Install plugins → wpisz `auth_oidc` → Install from Moodle plugins directory. Po instalacji: Site administration → Plugins → Authentication → Manage authentication → Enable OIDC.
5. **OIDC config** (Plugins → Authentication → OIDC):
   - Application ID: `moodle`
   - Application secret: (z Coolify env Moodle — zostanie dostarczony przez skrypt seed KC; sprawdź `scripts/keycloak-seed.mjs` stdout)
   - Authority URL: `https://auth.myperformance.pl/realms/MyPerformance`
   - Authorization endpoint: `https://auth.myperformance.pl/realms/MyPerformance/protocol/openid-connect/auth`
   - Token endpoint: `https://auth.myperformance.pl/realms/MyPerformance/protocol/openid-connect/token`
   - OIDC resource: `openid profile email`
6. **Role mapping:** dla każdej roli z realmu (`moodle_student`, `moodle_teacher`, `moodle_admin`) — Site administration → Users → Permissions → Assign system roles, albo zainstaluj plugin `local_oauth2rolemapping` i zmapuj claim `roles` na Moodle system roles.

## Testowe logowanie

Po wszystkim:
1. Dashboard → kafelek "Akademia" (widoczny tylko jeśli masz rolę `moodle_*`).
2. Przekierowanie na `moodle.myperformance.pl` → OIDC → KC → zalogowany w Moodle jako ten sam użytkownik (SSO).
