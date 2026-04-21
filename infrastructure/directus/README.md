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
