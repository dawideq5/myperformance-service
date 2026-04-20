# MyPerformance — Infrastructure

Reference docker-compose files and Docker build contexts for every self-hosted service that backs myperformance.pl. Coolify holds the canonical copies, but git history in this directory is the human-auditable version.

## Directory layout

| Path | Purpose | Deployment target |
| --- | --- | --- |
| `keycloak/realm.json` | Baseline `MyPerformance` realm export (clients, roles, identity providers). | Manual import into Keycloak admin once per env. |
| `keycloak/Dockerfile` | Custom Keycloak 26.6.1 image with the Keycloakify theme baked in (replaces the runtime `theme-fetcher` pattern). | Build via Coolify Application (Dockerfile build pack) against this repo subpath. |
| `documenso/docker-compose.yml` | Documenso + Postgres sidecar, self-signed signing cert auto-provisioned on volume. Keycloak OIDC SSO + webhook signing envs. Subdomain `sign.myperformance.pl`. | Coolify Service. |
| `chatwoot/docker-compose.yml` | Chatwoot (Rails + Sidekiq) + Postgres (pgvector) + Redis. Subdomain `chat.myperformance.pl`. | Coolify Service. |
| `listmonk/docker-compose.yml` | Listmonk transactional + newsletter sender (+ Postgres sidecar). Subdomain `mail.myperformance.pl`. Replaces the earlier Plunk service, which redirected to the OVHcloud placeholder whenever `APP_URI` drifted from the public FQDN. | Coolify Service. |
| `step-ca/docker-compose.yml` | Smallstep step-ca — internal CA that issues browser client certificates for cert-gated panels. Subdomain `ca.myperformance.pl`. | Coolify Service. |
| `traefik/dynamic-mtls.yml` | Traefik v3 dynamic config enabling mTLS middleware + TLS options for the four cert-gated subdomains (`panelsprzedawcy`, `panelserwisanta`, `panelkierowcy`, `dokumenty`). | Dropped into Traefik's dynamic provider directory on the VPS. |

## Enterprise conventions

- **SSO:** Every service that supports OIDC authenticates against `auth.myperformance.pl/realms/MyPerformance` with a dedicated confidential client. Secrets are stored in Coolify envs only.
- **Postgres:** Each service gets its own Postgres sidecar — no shared DB server. Volumes use named volumes (`<service>-postgres-data`).
- **Secrets:** Generated via Coolify's `SERVICE_*` magic envs (e.g. `${SERVICE_PASSWORD_64_*}`) so every deployment has strong, unique values and we never check secrets into git.
- **Traefik:** Services expose themselves via `SERVICE_FQDN_*_<port>` so Coolify auto-generates Traefik labels (HTTPS, Let's Encrypt). Cert-gated subdomains additionally attach the `mtls-required` middleware from `traefik/dynamic-mtls.yml`.
- **Healthchecks:** Every long-running container defines a healthcheck so Coolify's `degraded:unhealthy` flag actually means what it says.

## mTLS dla paneli cert-gated

Panele `panelsprzedawcy`, `panelserwisanta`, `panelkierowcy`, `dokumenty`
są dostępne tylko z zainstalowanym certyfikatem klienckim `.p12` wydanym
przez `ca.myperformance.pl`. Bez certa Traefik zwróci `400 Bad Request`.

### Dystrybucja trust bundle CA na VPS

> **Uwaga:** step-ca podpisuje leaf przez *intermediate*, a `.p12` nie
> zawiera chain (node-forge 1.x nie potrafi zapakować EC intermediate).
> Traefik musi mieć w `caFiles` **root + intermediate**, inaczej odrzuci
> certyfikat z `tls: unable to verify client certificate`.

```bash
# 1. Zbuduj bundle z root + intermediate (skrypt idempotentny)
sudo bash /root/myperformance-service/scripts/update-mtls-bundle.sh

# 2. Podłącz konfigurację Traefika (jednorazowo)
cp infrastructure/traefik/dynamic-mtls.yml \
   /data/coolify/proxy/dynamic/mtls.yml

# 3. Skrypt z p.1 sam HUPuje Traefika; jeśli dodajesz mtls.yml osobno:
docker kill --signal=HUP $(docker ps -qf name=coolify-proxy)
```

Skrypt `update-mtls-bundle.sh` można uruchamiać po każdej rotacji step-ca
(np. odnowienie intermediate) — wyciąga aktualny `root_ca.crt` i
`intermediate_ca.crt` z kontenera step-ca i zapisuje je do
`/data/coolify/proxy/certs/myperformance-ca.pem`.

### Labels per aplikacja (Coolify UI)

Dla każdej z 4 aplikacji panelowych dopisz w *Labels*:

```
traefik.http.routers.<coolify-router>.tls.options=mtls-<rola>@file
traefik.http.routers.<coolify-router>.middlewares=mtls-required@file
```

gdzie `<rola>` to `sprzedawca`, `serwisant`, `kierowca` lub `dokumenty`,
a `<coolify-router>` to nazwa routera generowana przez Coolify (patrz
`traefik.http.routers.*.rule` w aktualnych labelach kontenera).

### Wystawienie i instalacja `.p12`

1. Admin dashboardu: `https://myperformance.pl/admin/certyfikaty` → wybierz
   rolę i CN, kliknij *Wystaw*. Przeglądarka pobierze `.p12`; hasło do
   pliku jest w nagłówku odpowiedzi `X-Pkcs12-Password` (widać je tylko
   raz — skopiuj od razu).
2. Rotacja: wydaj nowy cert; stary unieważnij przez DELETE w panelu
   admin (revoke przez step-ca Admin API).

#### macOS (Keychain) — Safari, Chrome, Edge

1. Otwórz `.p12` dwuklikiem → Keychain Access otworzy dialog „Add
   certificates". Wybierz **login** (nie `System`) i podaj hasło `.p12`.
2. W Keychain Access odszukaj cert po CN, kliknij prawym → *Get Info* →
   *Trust* → `When using this certificate: Always Trust` (wymaga hasła
   konta).
3. Safari / Chrome / Edge używają Keychaina automatycznie. Przy
   pierwszym wejściu na panel przeglądarka zapyta o wybór certa.

#### Firefox (cross-platform)

Firefox ma własny magazyn — nie widzi Keychaina / Windows Cert Store.

1. `about:preferences#privacy` → *Certificates* → *View Certificates*.
2. Zakładka *Your Certificates* → *Import* → wskaż `.p12` → podaj hasło.
3. Zakładka *Authorities* → *Import* → wybierz `root_ca.pem` pobrany z
   `https://ca.myperformance.pl/roots.pem`; zaznacz *Trust this CA to
   identify websites*.

#### Windows (Edge / Chrome)

1. Dwuklik `.p12` → *Certificate Import Wizard* → *Current User* →
   hasło → store: *Personal* (klucz + cert) i *Trusted Root Certification
   Authorities* (dla `root_ca.pem` osobno).
2. Po restart przeglądarka zapyta o cert przy wejściu na panel.

### Troubleshooting

- `ERR_BAD_SSL_CLIENT_AUTH_CERT` / `TLS alert: no certificates`:
  `.p12` nie został zaimportowany do właściwego magazynu (Firefox vs
  system store).
- Traefik loguje `tls: client didn't provide a certificate`: dobrze —
  middleware mTLS działa, użytkownik nie wybrał/zaimportował certa.
- Po wygaśnięciu `.p12` trzeba wygenerować nowy — stary nie zostanie
  rozpoznany przez Traefik (koniec `notAfter`).
