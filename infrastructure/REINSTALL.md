# Enterprise clean reinstall — MyPerformance ekosystem

Procedura krok po kroku do wyczyszczenia i rekonfiguracji wszystkich
natywnych aplikacji (Chatwoot, Moodle, Documenso, Outline, Directus,
Postal) z **pustymi bazami** i **OIDC SSO do Keycloaka** od pierwszego
startu.

**Keycloak, step-ca i dashboard (myperformance-service) NIE są czyszczone**
— tożsamość userów + PKI zostają nienaruszone.

## Kolejność

```
1. Pre-flight: upewnij się że masz backup (jeśli chcesz)
   → Apka w fazie budowy = brak backupu konieczny

2. Wipe wszystkich 6 apek:
   ssh vps
   cd /root/myperformance-service
   git pull origin main
   IAM_WIPE_CONFIRM=1 sudo bash scripts/infrastructure/wipe-all.sh

3. Coolify: Redeploy Keycloak (re-importuje realm.json z nowymi clientami)
   → auth.myperformance.pl/realms/MyPerformance/.well-known/openid-configuration
     musi zwrócić JSON

4. Ustaw *_CLIENT_SECRET w Coolify envach dashboardu (myperformance-service):
   CHATWOOT_OIDC_CLIENT_SECRET / CHATWOOT_CLIENT_SECRET
   MOODLE_OIDC_CLIENT_SECRET   / MOODLE_CLIENT_SECRET
   OUTLINE_OIDC_CLIENT_SECRET  / OUTLINE_CLIENT_SECRET
   DOCUMENSO_OIDC_CLIENT_SECRET / DOCUMENSO_CLIENT_SECRET
   POSTAL_OIDC_CLIENT_SECRET   / POSTAL_CLIENT_SECRET
   DIRECTUS_OIDC_CLIENT_SECRET / DIRECTUS_CLIENT_SECRET
   → w Keycloak Admin UI (Clients → <client> → Credentials) musisz
     wygenerować secret i wkleić go w OBU miejscach (compose apki + envy
     dashbordu używane przez providery `lib/permissions/providers/*.ts`)

5. Coolify: Redeploy poszczególnych serwisów w kolejności (patrz
   scripts/infrastructure/bootstrap.sh):
   - postal (najpierw — inni potrzebują SMTP relay)
   - directus
   - outline
   - documenso
   - chatwoot
   - moodle (najdłużej — 5–10 min install.php)

6. Post-install per apka (krytyczne — BEZ tego dashboard nie widzi apki):

   CHATWOOT
     - docker logs <chatwoot-bootstrap>
     - skopiuj token + account_id + url do envów myperformance-service:
         CHATWOOT_URL=https://chat.myperformance.pl
         CHATWOOT_PLATFORM_TOKEN=<token z logów>
         CHATWOOT_ACCOUNT_ID=1

   MOODLE
     - Zaloguj się na moodle.myperformance.pl jako admin (env
       MOODLE_USERNAME/PASSWORD)
     - Administracja → Server → Web services → Overview → Enable
       web services
     - External services → Moodle mobile additional features → Enable
     - Manage tokens → Create → user=admin, service=Moodle mobile
     - Skopiuj token do envów:
         MOODLE_URL=https://moodle.myperformance.pl
         MOODLE_API_TOKEN=<token>

   DOCUMENSO
     - Zaloguj przez SSO jako keycloak_admin (otrzymasz documenso_admin
       gdy dashboard /admin/users przypisze)
     - W /admin stwórz Organisation "MyPerformance" (UUID zapisz)
     - Skopiuj do envów:
         DOCUMENSO_DB_URL=<z Coolify secrets — connection string do
           wewnętrznego database usługi documenso>
         DOCUMENSO_ORGANISATION_ID=<UUID nowo-utworzonej org>
         (opcjonalnie) DOCUMENSO_TEAM_ID=<int ID jeśli utworzysz team>

   OUTLINE
     - Pierwszy zalogowany user SSO dostaje rolę admin (global).
     - Konfiguracja po stronie dashboardu:
         OUTLINE_URL=https://knowledge.myperformance.pl
         OUTLINE_API_TOKEN=<wygeneruj w Settings → API & Apps → Personal
           access tokens>

   DIRECTUS
     - Zaloguj hasłem (DIRECTUS_ADMIN_EMAIL/PASSWORD) — fallback w razie
       gdyby OIDC padło. Konto to nie uczestniczy w SSO.
     - Settings → Access Control → stwórz rolę "Administrator"
     - Wróć do Coolify env:
         DIRECTUS_DEFAULT_ROLE_ID=<UUID roli Administrator>
     - Redeploy Directusa żeby OIDC_DEFAULT_ROLE się załadował
     - Ustaw w envach myperformance-service:
         DIRECTUS_URL=https://cms.myperformance.pl
         DIRECTUS_ADMIN_TOKEN=<wygeneruj w Settings → Access Tokens
           przy user admin>

   POSTAL
     - Zaloguj przez SSO (pierwszy user OIDC zostanie pełnym adminem)
     - Dla dashboardu:
         POSTAL_DB_HOST=<host MariaDB z Coolify compose>
         POSTAL_DB_USER=postal
         POSTAL_DB_PASSWORD=${SERVICE_PASSWORD_MARIADB}  (sama z Coolify
           magic env)

7. Dashboard MyPerformance (/admin/users → Narzędzia IAM):
   - "Synchronizuj role z Keycloak" — utworzy missing realm roles +
     composite groups `app-<areaId>` (powinno być no-op jeśli
     realm.json już ma pełny seed, ale uruchom na wypadek gdyby
     dynamiczne role Moodle się rozmijały)
   - "Testuj wszystkich" → wpisz swój email → sprawdź że każdy provider:
       - skonfigurowany (nie offline)
       - widzi listę ról (liczba >= 1)
       - znajduje cię po email (po pierwszym zalogowaniu w każdej apce)
   - Zaproś samemu siebie przez "Zaproś użytkownika" i nadaj rolę
     `documenso_admin`, `moodle_manager`, `chatwoot_admin`, itp. żeby
     zweryfikować end-to-end provisioning.

8. Smoke test ręczny — dla każdej apki po kolei:
   - Otwórz https://<subdomena>.myperformance.pl
   - Zaloguj przez SSO "MyPerformance ID"
   - Sprawdź że user ma oczekiwaną rolę
     (Chatwoot: administrator w /app/accounts/1/agents;
      Documenso: /admin dostępne;
      Moodle: tile "Administracja witryny" widoczny;
      Outline: settings widoczne;
      Directus: Data Studio widoczne;
      Postal: /servers widoczne)
```

## Troubleshooting

### Keycloak realm.json nie importuje się
Jeśli Coolify nie wywołuje import przy redeployu KC (realm już istnieje):
```bash
# Wejdź do kontenera KC, zaimportuj ręcznie
docker exec -it <kc-container> bash
/opt/keycloak/bin/kc.sh import --file /opt/keycloak/data/import/realm.json \
  --override true
```

### Chatwoot logowanie OIDC zwraca 500
Sprawdź env `OIDC_CLIENT_SECRET` w chatwoot-rails — musi pasować do
wygenerowanego w Keycloak Clients → chatwoot → Credentials.

### Moodle auth_oidc nie pojawia się w Authentication list
```bash
docker exec -it <moodle-container> bash
cd /bitnami/moodle
php admin/cli/upgrade.php --non-interactive --allow-unstable
php admin/cli/purge_caches.php
```

### Documenso: OIDC button nie pokazuje się
Documenso wymaga `NEXT_PRIVATE_OIDC_WELL_KNOWN` dostępnego podczas
build'u — re-deploy po pierwszym starcie żeby wczytał nową wartość.

### Outline: "No user found" przy pierwszym logowaniu
Outline JIT-provisioning wymaga `OIDC_USERNAME_CLAIM=preferred_username`
— sprawdź że KC wysyła ten claim (realm.json ma domyślnie).

### Directus: SSO button nie pokazuje się
Directus 11 wymaga `AUTH_PROVIDERS=keycloak` (nazwa używana w URL).
Restart kontenera po dodaniu envów żeby config się wczytał.

## Verify end-to-end

```bash
# Z VPS
cd /root/myperformance-service
bash scripts/infrastructure/bootstrap.sh
```

Powinno przejść przez healthchecks każdej apki + wypisać post-install
instrukcje.

## Post-reinstall checklist

- [ ] Wszystkie 6 apek healthy w Coolify
- [ ] Każda apka ma OIDC SSO button widoczny na stronie logowania
- [ ] Pierwszy zalogowany user przez SSO otrzymuje domyślną rolę
- [ ] /admin/users → Narzędzia IAM → "Testuj wszystkich" zwraca
      `skonfigurowany` dla każdego providera
- [ ] Zmiana roli w dashboardzie (/admin/users/[id] → Uprawnienia) od
      razu propaguje do natywnej apki (weryfikacja: ponownie "Testuj"
      z emailem usera)
