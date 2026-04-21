# Konfiguracja mTLS dla paneli cert-gated

**Status:** wymagany manualny krok na VPS (brak Coolify API do zapisu Traefik dynamic config).

Traefik uruchomiony przez Coolify odczytuje konfigurację dynamiczną z `/data/coolify/proxy/dynamic/`. Aby włączyć wzajemną weryfikację TLS dla paneli `panelsprzedawcy.*`, `panelserwisanta.*`, `panelkierowcy.*`, `dokumenty.*` należy wykonać:

## Kroki (SSH do VPS)

```bash
# 1. Zbuduj trust bundle (root + intermediate) — wymagane,
#    bo .p12 nie zawiera chain, a intermediate podpisuje leafa.
sudo bash scripts/update-mtls-bundle.sh

# 2. Skopiuj konfigurację
cp infrastructure/traefik/dynamic-mtls.yml /data/coolify/proxy/dynamic/mtls.yml

# 3. Konfiguracja routerów per-panel (labels na kontenerach Coolify):
#    - traefik.http.routers.<name>.tls.options=mtls-<rola>@file
#    - traefik.http.routers.<name>.middlewares=mtls-required@file,<inne>@docker
#
#    Ustaw to przez edycję Docker Compose w Coolify UI dla każdej aplikacji
#    panel-sprzedawca / panel-serwisant / panel-kierowca.

# 4. Skrypt HUPuje Traefika automatycznie; przy dodawaniu samego mtls.yml:
docker kill --signal=HUP $(docker ps -qf name=coolify-proxy)
```

## Po aktywacji mTLS

Próba wejścia bez certyfikatu klienckiego zwróci `400 Bad Request — no valid client certificate`. Wydawanie certyfikatów: `https://myperformance.pl/admin/certificates` (plik `.p12` importowany do systemu/przeglądarki przez użytkownika).

Header `X-Forwarded-Tls-Client-Cert-Info` zawiera dane certyfikatu — middleware w panelach (`middleware.ts`) może z niego odczytać `role=<sprzedawca|serwisant|...>` i wymusić dopasowanie do sesji Keycloak.
