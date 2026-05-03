# Directus — SSO only (MyPerformance Keycloak)

Directus jest zarządzany przez Coolify (service UUID `pu8b37hw19akg5gx1445j3f2`),
więc plik compose żyje w Coolify, a nie w tym repo. Poniżej jest autoratywne
źródło prawdy o zmiennych środowiskowych + SQL potrzebny do naprawy logowania.

## Objaw: `User belongs to a different auth provider`

Pojawia się, kiedy użytkownik istnieje w `directus_users` z `provider='default'`
(konto lokalne), a Keycloak próbuje go zalogować przez OpenID. Directus sprawdza
`provider` w bazie i odmawia — każdy user ma tylko jedno źródło autentykacji.

## Wymagane envy (Coolify → Directus service)

```
AUTH_PROVIDERS=keycloak
AUTH_KEYCLOAK_DRIVER=openid
AUTH_KEYCLOAK_CLIENT_ID=directus
AUTH_KEYCLOAK_CLIENT_SECRET=<z Keycloak>
AUTH_KEYCLOAK_ISSUER_URL=https://auth.myperformance.pl/realms/MyPerformance/.well-known/openid-configuration
AUTH_KEYCLOAK_IDENTIFIER_KEY=email
AUTH_KEYCLOAK_ALLOW_PUBLIC_REGISTRATION=true
AUTH_KEYCLOAK_DEFAULT_ROLE_ID=<directus_admin_role_id>   # rola musi już istnieć w Directusie
AUTH_KEYCLOAK_SCOPE=openid profile email
AUTH_KEYCLOAK_ICON=shield_lock
AUTH_KEYCLOAK_LABEL=MyPerformance SSO

# Wyłącza endpoint `POST /auth/login` (lokalne hasło) — zostaje tylko OIDC.
AUTH_DISABLE_DEFAULT=true
```

Po zmianie envów zrestartuj usługę Directus w Coolify.

## Naprawa istniejących kont (jednorazowo)

Plik `fix-auth-provider.sql` aktualizuje istniejące konta tak, by były
rozpoznawane jako należące do providera `keycloak`. Użyj `external_identifier`
ustawionego na email — Keycloak przesyła `sub`, ale `AUTH_KEYCLOAK_IDENTIFIER_KEY=email`
wymusza porównanie po mailu.

```bash
# Uwaga: `db` to hostname kontenera Postgresa Directusa w sieci Coolify.
ssh ubuntu@57.128.249.245 \
  docker exec -i directus-db-<hash> \
  psql -U directus -d directus < infrastructure/directus/fix-auth-provider.sql
```

## Reorganizacja schemy (folders + display templates + brand field)

Wave 22 / F18 — `scripts/directus-reorganize.mjs` wymusza:
- foldery nawigacji (`mp_folder_dashboard|email|panele|serwis|business|akademia|system`)
  jako schema-less collections w Directusie,
- `meta.group` per zarządzana kolekcja (kolekcja pojawia się pod folderem),
- `display_template`, `archive_field`, `sort_field`, `icon` per kolekcja,
- pole `brand` na `mp_locations` (Wave 22 / F1 follow-up — brand routing maili).

Skrypt jest idempotentny — re-run na "czystym" Directusie zwraca zero diffów.

### Przepływ pracy

```bash
# 1. Dry-run (pokazuje, co się zmieni — nic nie aplikuje):
node scripts/directus-reorganize.mjs --env staging --dry-run

# 2. Apply na staging:
DIRECTUS_URL=https://cms.staging.myperformance.pl \
DIRECTUS_ADMIN_TOKEN=<staging admin token> \
  node scripts/directus-reorganize.mjs --env staging

# 3. Re-run dry-run (powinien pokazać: same OK, brak diffów):
node scripts/directus-reorganize.mjs --env staging --dry-run

# 4. Apply na prod (po review na staging):
DIRECTUS_URL=https://cms.myperformance.pl \
DIRECTUS_ADMIN_TOKEN=<prod admin token> \
  node scripts/directus-reorganize.mjs --env prod
```

### Permissions (opcjonalnie)

Dodaj `--apply-permissions` aby zaimplementować role-based dostęp (editor:
Dashboard + Email; admin: wszystko). Wymaga ról `editor` i `admin` w Directusie.
Domyślnie pominięte — admin token i tak ma full access.

### Manifest

Skrypt operuje na własnym manifeście (`COLLECTIONS` array w `.mjs`), który
JEST mirrorem `lib/directus-cms/specs/*.ts`. Jeśli zmienisz `group` /
`display_template` / `archive_field` / `sort_field` / `icon` w specs, należy
zaktualizować też manifest w skripcie. Specs pozostają SoT dla runtime'u
dashboardu (`ensureCollection` w `lib/directus-cms/items.ts`); ten skrypt to
ops-only reorg na żywej instancji Directusa.

### Brand field (mp_locations)

Skrypt dodaje pole `brand` (enum: `myperformance` | `zlecenieserwisowe`,
nullable) jeśli nie istnieje. Pole konsumuje `lib/services/brand.ts`
(`resolveBrandFromService(id)`) który decyduje który SMTP profile + layout
emaila użyć dla danej lokacji. `null` = global default
(`mp_branding.default_smtp_profile_slug`).

## Ukrycie formularza hasła

`AUTH_DISABLE_DEFAULT=true` wyłącza endpoint, ale wbudowany formularz logowania
dalej próbuje wywołać POST `/auth/login`. Do pełnego UX potrzeba:

1. Ukryć pola login+hasło przez custom CSS w **Project Settings → Custom CSS**:
   ```css
   .v-form.login-form,
   .v-divider,
   .v-button.default-login { display: none !important; }
   .v-button[href*="/auth/login/keycloak"] { margin-top: 0 !important; }
   ```
2. Alternatywnie: ustawić `PUBLIC_REGISTRATION=false`
   i `AUTH_KEYCLOAK_REDIRECT_ALLOW_LIST` tak, by każdy start sesji
   automatycznie kierował do OIDC (Directus 11+ honoruje parametr `?auto=1`).
