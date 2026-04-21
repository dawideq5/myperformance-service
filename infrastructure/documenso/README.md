# Documenso — SSO & restricted end-user UI

Documenso jest trzymany "as-is" z obrazu `documenso/documenso:latest`. Stosujemy
trzy warstwy ograniczeń, żeby zwykły user widział tylko przepływ podpisywania:

## 1. Keycloak OIDC (w Coolify envach serwisu)

```
NEXT_PRIVATE_OIDC_PROVIDER_LABEL=MyPerformance SSO
NEXT_PRIVATE_OIDC_WELL_KNOWN=https://auth.myperformance.pl/realms/MyPerformance/.well-known/openid-configuration
NEXT_PRIVATE_OIDC_CLIENT_ID=documenso
NEXT_PRIVATE_OIDC_CLIENT_SECRET=<z Keycloak>
NEXT_PRIVATE_OIDC_ALLOW_SIGNUP=true
NEXT_PUBLIC_DISABLE_SIGNUP=true   # blokuje rejestrację lokalną (hasłem)
```

Rola sync (`USER`/`ADMIN`) jest obsługiwana przez dashboard, który na kliknięcie
kafelka „Documenso — administrator" wywołuje UPDATE przez DOCUMENSO_DB_URL.

## 2. Traefik redirect dla `/signin` / `/signup`

Plik `infrastructure/documenso/traefik-redirects.yml` jest kopiowany ręcznie na
VPS do `/data/coolify/proxy/dynamic/documenso-redirects.yml`, ale
**nie wdrażamy** go domyślnie, bo Documenso ma customowy `/signin`, a
automatyczny redirect do `/api/auth/signin/oidc` nie działa w Documenso
(NextAuth routes są zamaskowane). Jeśli w przyszłości Documenso wystawi stabilny
GET-endpoint dla OIDC, włącz ten plik.

## 3. `nginx.conf` (frontdoor sidecar)

`nginx.conf` + odpowiadający mu `frontdoor` service z `docker-compose.yml`
ukrywa w UI zbędne zakładki (Tokeny API / Webhooki / Organizacje / Branding
itp.) i przekierowuje `/signin` na OIDC **zakładając, że FQDN zostanie
przeniesiony z `documenso` na `frontdoor`**.

Z uwagi na
[Coolify API FQDN limitation](../../../.claude/projects/-Users-dawidpaluska-myperformance-service-myperformance-service/memory/feedback_coolify_api_fqdn.md),
operacja „przestaw FQDN" musi być zrobiona **ręcznie w Coolify UI**:

1. W Coolify → Documenso service → edytuj `docker-compose.yml`, wklej zawartość
   aktualnego pliku `infrastructure/documenso/docker-compose.yml`.
2. W zakładce **Domains** usuń `sign.myperformance.pl` z `documenso:3000`
   i przypnij do `frontdoor:3000`.
3. Redeploy serwisu — pojawi się nowy kontener `frontdoor-<hash>`, a Traefik
   będzie kierował cały ruch przez nginxa.

Do tego czasu Documenso serwuje swój natywny `/signin` (hasło + przycisk
„MyPerformance SSO"), a zakładki ustawień są widoczne dla wszystkich.
Zwykli użytkownicy (bez roli `documenso_admin`) nadal nie wejdą w obszar
`/admin/`, co ogranicza wpływ widocznych tabów.

## Stan aktualny (2026-04-21)

- `NEXT_PUBLIC_DISABLE_SIGNUP=true` — potwierdzone w prod.
- `AUTH_DISABLE_DEFAULT` nie dotyczy Documenso (to env Directusa).
- `frontdoor` nie jest włączony — wymaga kroku ręcznego z p. 3.
- Traefik override usunięty (nie działał z Documenso auth API).
