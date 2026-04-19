# MyPerformance — Infrastructure

Reference docker-compose files and Docker build contexts for every self-hosted service that backs myperformance.pl. Coolify holds the canonical copies, but git history in this directory is the human-auditable version.

## Directory layout

| Path | Purpose | Deployment target |
| --- | --- | --- |
| `keycloak/realm.json` | Baseline `MyPerformance` realm export (clients, roles, identity providers). | Manual import into Keycloak admin once per env. |
| `keycloak/Dockerfile` | Custom Keycloak 26.6.1 image with the Keycloakify theme baked in (replaces the runtime `theme-fetcher` pattern). | Build via Coolify Application (Dockerfile build pack) against this repo subpath. |
| `docuseal/docker-compose.yml` | Docuseal + Postgres sidecar. Subdomain `sign.myperformance.pl`. | Coolify Service. |
| `chatwoot/docker-compose.yml` | Chatwoot (Rails + Sidekiq) + Postgres (pgvector) + Redis. Subdomain `chat.myperformance.pl`. | Coolify Service. |
| `plunk/docker-compose.yml` | Plunk transactional email + Postgres + Redis. Subdomain `mail.myperformance.pl`. | Coolify Service. |
| `step-ca/docker-compose.yml` | Smallstep step-ca — internal CA that issues browser client certificates for cert-gated panels. Subdomain `ca.myperformance.pl`. | Coolify Service. |
| `traefik/dynamic-mtls.yml` | Traefik v3 dynamic config enabling mTLS middleware + TLS options for the four cert-gated subdomains (`panelsprzedawcy`, `panelserwisanta`, `panelkierowcy`, `dokumenty`). | Dropped into Traefik's dynamic provider directory on the VPS. |

## Enterprise conventions

- **SSO:** Every service that supports OIDC authenticates against `auth.myperformance.pl/realms/MyPerformance` with a dedicated confidential client. Secrets are stored in Coolify envs only.
- **Postgres:** Each service gets its own Postgres sidecar — no shared DB server. Volumes use named volumes (`<service>-postgres-data`).
- **Secrets:** Generated via Coolify's `SERVICE_*` magic envs (e.g. `${SERVICE_PASSWORD_64_*}`) so every deployment has strong, unique values and we never check secrets into git.
- **Traefik:** Services expose themselves via `SERVICE_FQDN_*_<port>` so Coolify auto-generates Traefik labels (HTTPS, Let's Encrypt). Cert-gated subdomains additionally attach the `mtls-required` middleware from `traefik/dynamic-mtls.yml`.
- **Healthchecks:** Every long-running container defines a healthcheck so Coolify's `degraded:unhealthy` flag actually means what it says.
