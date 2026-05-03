# MyPerformance — Infrastructure

Reference docker-compose files and Docker build contexts for every self-hosted service that backs myperformance.pl. Coolify holds the canonical copies, but git history in this directory is the human-auditable version.

## Directory layout

| Path | Purpose | Deployment target |
| --- | --- | --- |
| `keycloak/realm.json` | Baseline `MyPerformance` realm export (clients, roles, identity providers). | Manual import into Keycloak admin once per env. |
| `keycloak/Dockerfile` | Custom Keycloak 26.6.1 image with the Keycloakify theme baked in (replaces the runtime `theme-fetcher` pattern). | Build via Coolify Application (Dockerfile build pack) against this repo subpath. |
| `documenso/docker-compose.yml` | Documenso + Postgres sidecar, self-signed signing cert auto-provisioned on volume. Keycloak OIDC SSO + webhook signing envs. Subdomain `sign.myperformance.pl`. | Coolify Service. |
| `chatwoot/docker-compose.yml` | Chatwoot (Rails + Sidekiq) + Postgres (pgvector) + Redis. Subdomain `chat.myperformance.pl`. | Coolify Service. |
| `postal/docker-compose.yml` | Postal (web + smtp + worker) + MariaDB transactional mail server. Subdomain `postal.myperformance.pl`. Native OIDC SSO against Keycloak `postal` client (local auth disabled). SMTP ports 25/465/587 via explicit host port bindings. | Coolify Service. |
| `step-ca/docker-compose.yml` | Smallstep step-ca — internal CA that issues browser client certificates for cert-gated panels. Subdomain `ca.myperformance.pl`. | Coolify Service. |
| `traefik/dynamic-mtls.yml` | Traefik v3 dynamic config enabling mTLS middleware + TLS options for the four cert-gated subdomains (`panelsprzedawcy`, `panelserwisanta`, `panelkierowcy`, `dokumenty`). | Dropped into Traefik's dynamic provider directory on the VPS. |
| [`network-segmentation.md`](./network-segmentation.md) | Design doc — 4 trust zones (auth/data/admin/public) + Coolify rolling migration plan. Compose'y mają `# TODO: migrate to <zone>` komentarze. | Reference only (design); migration TBD. |
| [`backup/`](./backup/README.md) | Daily DB + filesystem backup (8 baz + Coolify data + Traefik certs). 23:00 lokalnie + 23:30 off-site sync na OVH Object Storage S3 (rclone). | Cron na VPS host (nie kontener). |
| [`queue-worker/docker-compose.yml`](./queue-worker/README.md) | Standalone IAM queue worker (BullMQ subscriber) — odciążenie `lib/permissions/queue.ts` od dashboardu. | Coolify Service (osobny od dashboardu). |
| [`livekit/docker-compose.yml`](./livekit/README.md) | LiveKit self-hosted WebRTC SFU dla live device view (Wave 22 / F16). Subdomena `livekit.myperformance.pl`. Signaling :7880, TCP fallback :7881, media UDP 50000-60000. | Coolify Service. |
| [`coturn/docker-compose.yml`](./coturn/README.md) | TURN/STUN server (NAT traversal dla LiveKit). Subdomena `turn.myperformance.pl`. `network_mode: host`, porty 3478/5349 + relay 49160-49200/udp. | Coolify Service. |

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
