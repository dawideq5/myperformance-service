# Postal — transactional mail relay for the stack

Postal is the primary outbound SMTP server for every MyPerformance service.
Services connect to it **inside the docker network** using the hostname
`smtp-iut9wf1rz9ey54g7lbkje0je:25` (Coolify-generated name of the SMTP
sidecar). Credentials below.

## SMTP credentials

| Field | Value |
|---|---|
| Host | `smtp-iut9wf1rz9ey54g7lbkje0je` |
| Port | `25` (plain — inside docker trust boundary) |
| Auth type | `PLAIN` / `LOGIN` |
| Username | `main` (server permalink) |
| Password | credential key from Postal `Credential#1` |
| From | `noreply@myperformance.pl` |

**Why port 25, plaintext?** Postal's internal SMTP listener only implements
STARTTLS for externally-exposed ports (25 public). Inside docker, TLS doesn't
make sense — traffic never leaves the docker bridge. All services that
support disabling TLS are configured accordingly.

## Network plumbing

Each service lives in its own Coolify bridge network; they cannot reach
Postal unless the SMTP container is attached to those networks. We attach
`smtp-iut9wf1rz9ey54g7lbkje0je` to: `coolify`, `c9dxxjvb3rskueiuguudbqgb`
(documenso), `pu8b37hw19akg5gx1445j3f2` (directus),
`zdlueek1sg2dgdbi7nk5xrh5` (chatwoot), `hg0i1ii7tg5btyok3o2gqnf0`
(keycloak).

Docker does NOT persist additional network attachments across container
recreates, so run `postal-network-reattach.sh` whenever Postal (or any of
the services) is redeployed. A cron entry in `/etc/cron.d/postal-reattach`
runs it every 5 minutes on the VPS for safety.

## DNS (prod checklist)

Current state: the Postal domain object for `myperformance.pl` was
force-verified inside Postal so Live mode accepts `From:
noreply@myperformance.pl`. For **real** external deliverability (Gmail,
Outlook, corporate MTAs) the following records MUST exist on
`myperformance.pl`:

| Type | Name | Value |
|---|---|---|
| TXT | `_postal.myperformance.pl` | `RiBDrOoW4AqDgrZFtsxUshovSlTFIZ47` |
| TXT | `postal-u9juo6._domainkey.myperformance.pl` | `v=DKIM1; t=s; h=sha256; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDFx3RdoJQbdfsWC86ihy7i9slQOmwM8dQpwLQ8SkKAfoiyk0slaM64k5VZ4ZAeyqdfOfyssLOLxo05aUPzIWjO59H/UEJAkDcEycO+83oFPfsmuzCfy10cislZYXmiaG3b107nFdekok6aPxpjm/ZT5HN2/nSdrgrUjfxGgxslcwIDAQAB` |
| TXT (SPF) | `myperformance.pl` | `v=spf1 include:spf.postal.myperformance.pl include:mx.ovh.com -all` |
| MX (optional) | `rp.myperformance.pl` | `10 rp.postal.myperformance.pl` |

Keep OVH's MX intact if inbound mail should keep landing in OVH mailboxes
(kontakt@, biuro@, etc.). Postal is outbound-only for now.

After adding records, re-verify in Postal:

```
cd /opt/postal/app && bundle exec rails runner "
d = Domain.where(server_id: 3, name: 'myperformance.pl').first
d.check_dns
puts({spf: d.spf_status, dkim: d.dkim_status, mx: d.mx_status, rp: d.return_path_status}.to_json)
"
```

## Service envs

| Service | Key prefix |
|---|---|
| dashboard | `SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD / SMTP_SECURE / SMTP_FROM` |
| documenso | `NEXT_PRIVATE_SMTP_*` |
| chatwoot | `SMTP_ADDRESS / SMTP_PORT / SMTP_USERNAME / SMTP_PASSWORD / MAILER_SENDER_EMAIL` |
| directus | `EMAIL_TRANSPORT=smtp / EMAIL_SMTP_*` |
| keycloak | realm-level SMTP (updated via Admin API) |

See `.env.example` for dashboard reference values.
