# Listmonk — mail.myperformance.pl

Self-hosted transactional + newsletter sender. Replaces Plunk (which did
not honour `APP_URI` and redirected to the OVHcloud placeholder).

## Coolify bootstrap

1. **New Service** → *Docker Compose* → paste `docker-compose.yml` from
   this directory. Coolify will inject:
   - `SERVICE_USER_POSTGRES`, `SERVICE_PASSWORD_POSTGRES`
   - `SERVICE_USER_ADMIN`, `SERVICE_PASSWORD_ADMIN`
   - `SERVICE_FQDN_LISTMONK_9000` → `mail.myperformance.pl`
2. Wait for `listmonk` and `postgres` to go **healthy**. The `--install
   --idempotent` flag creates the schema on first boot and is a no-op on
   subsequent starts.
3. First login: `https://mail.myperformance.pl` →
   `${SERVICE_USER_ADMIN}` / `${SERVICE_PASSWORD_ADMIN}`. This account
   stays as the local break-glass credential even after we front the UI
   with OAuth2-Proxy.

## SMTP sender

In the UI: **Settings → SMTP** — configure **one** outbound server.
Production options:

- Amazon SES (recommended; same IAM keys as Plunk used):
  host `email-smtp.eu-west-1.amazonaws.com`, port 587, STARTTLS,
  user = SMTP-specific SES credential (not the IAM key).
- Postmark: `smtp.postmarkapp.com`:587, server token as username + password.

Send a test mail from the same screen before flipping traffic.

## API token for the dashboard

**Settings → Users** → create a user `dashboard-api`, role `API user`,
copy the token. Set in the dashboard Coolify envs:

```
LISTMONK_URL=https://mail.myperformance.pl
LISTMONK_API_USER=dashboard-api
LISTMONK_API_TOKEN=<token>
```

`lib/listmonk.ts` uses these to call `/api/tx` (transactional) and
`/api/subscribers`.

## SSO (OAuth2-Proxy in front of the UI)

Listmonk does not implement OIDC natively. To keep the enterprise SSO
story, front `https://mail.myperformance.pl` with an OAuth2-Proxy
instance (Coolify service) pointing at the Keycloak client
`listmonk-proxy` and enforce it via the Traefik `sso-auth@file`
middleware. The local admin stays functional at the container port for
break-glass.

## Migrating away from Plunk

1. Deploy Listmonk per above; confirm SMTP works.
2. Update dashboard envs and deploy the `Plunk → Listmonk` tile swap
   (this repo's commit 7).
3. After a week of clean deliveries: stop + delete the Plunk service
   in Coolify. Data lives in `plunk-postgres-data` / `plunk-redis-data`
   — archive the DB dump before dropping the volumes.

## Healthcheck

`GET /api/health` → `{"data": true}` (HTTP 200). Coolify picks it up via
the `wget` healthcheck in the compose file.
