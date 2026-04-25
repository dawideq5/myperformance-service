# Plan: Enterprise infrastructure (backup + maintenance + OVH integration)

**Data:** 2026-04-25  
**Cel:** kompletny system: codzienny backup z off-site sync, tryb konserwacji, OVH jako core systemu pocztowego, automatyzacja DNS/DKIM, monitoring, alerty, 2FA via SMS.

---

## Phase A — Backup system ✅ DONE

**Status:** zaimplementowane na serwerze (pierwszy backup wykonany 2026-04-25 20:00, 28 MB).

**Komponenty:**
- `/usr/local/bin/myperformance-backup.sh` — pełen dump 8 baz (dashboard, KC, Outline, Directus, Chatwoot, Documenso, Postal, Moodle) + `/data/coolify/` + Step-CA volumes + Traefik dynamic configs + manifest z SHA256
- `/usr/local/bin/myperformance-backup-notify.sh` — branded email-raport via Postal SMTP (10.0.1.7:25), swaks, HTML template z headerem MyPerformance
- `/etc/cron.d/myperformance-backup` — `0 23 * * *` codziennie
- Lokalizacja: `/backups/myperformance/YYYY-MM-DD_HH-MM/`
- Retencja: 7 dni lokalnie

**Po deploy:** każdego dnia o 23:00 → backup + email na `r6vt289x94@privaterelay.appleid.com` (z brandingiem).

---

## Phase B — Maintenance mode ✅ TBD

**Cel:** toggle który blokuje user-ów (503 + komunikat), pozwala adminowi pracować w spokoju.

**Schema:** `mp_maintenance` (singleton id=1) — `enabled`, `started_at`, `expires_at`, `message`, `started_by`.

**Mechanizm:**
- Middleware sprawdza flag z DB cache (Redis 30s TTL — żeby nie zapytać DB na każdy request).
- Gdy enabled + user nie ma roli `admin` → 503 + custom HTML strona maintenance.
- Auto-disable po `expires_at` (default: 4h od włączenia, bezpiecznik gdy admin zapomni wyłączyć).

**UI:** w `/admin` toggle "Tryb konserwacji" z czas trwania picker + komunikat custom.

---

## Phase C — Email panel: OVH jako core (refactor)

**Stary stan:** OVH to standalone tab. SMTP configs to puste formy z presetem.

**Nowy stan:** OVH = primary źródło.
- **Konfiguracje SMTP:** zamiast pustego formu — dropdown skrzynek pobranych live z OVH (`/email/domain/*/account`). Wybór skrzynki → auto-fill host/port/user/from. User wpisuje tylko hasło.
- **Postal → Domeny:** dane DNS pobierane z OVH (`/domain/zone/*/record`) dodatkowo do skanu Postal — możemy weryfikować że SPF/DKIM rekordy są tam gdzie powinny.
- **Auto-sync skrzynek:** cron 1h pobiera listę skrzynek z OVH → upsertuje `mp_smtp_configs` z prefiksem `ovh-{domain}-{user}`. Hasła nie są pobierane (OVH nie daje przez API), user musi je wpisać raz na config.
- **Standalone tab "OVH Cloud" zostaje** ale jako **diagnostyka** (test connection, lista uprawnień, ostatnie operacje), nie jako data entry point.

---

## Phase D — Off-site sync na MacBook

**Wyzwanie:** MacBook za NAT, brak SSH inbound od strony VPS.

**Rozwiązanie 1: OVH Object Storage (S3-compatible, RECOMMENDED)**
- Cron na VPS: po backup → `rclone sync /backups/myperformance s3:myperf-backups/`
- MacBook cron: codziennie `rclone sync s3:myperf-backups/ ~/MyPerformance-Backups/`
- Plus: backup przeżywa zniszczenie VPS (off-site)
- Wymaga: aktywacja Public Cloud Storage w OVH + access key/secret

**Rozwiązanie 2: SSH pull z MacBook (cron lokalny)**
- Cron MacBook: `rsync -avz ubuntu@vps:/backups/myperformance/ ~/MyPerformance-Backups/`
- Wymaga: SSH key MacBook → VPS, cron uruchamiany przez user (nie wakeup-on-cron, MacBook musi być on)

**Rozwiązanie 3 (advanced): Tailscale**
- Tailscale na VPS + MacBook → traktuje się jak LAN
- VPS może bezpośrednio rsync na MacBook

**Restore script:**
- `~/MyPerformance-Backups/restore.sh <YYYY-MM-DD>` — provisionuje clean OVH server (przez OVH API: zamów VPS), instaluje Coolify, restoruje DB dumpsy + volumes
- Wymaga rozszerzonego OVH tokenu (POST /vps/order, POST /cloud/project/*/instance, etc)

---

## Phase E — OVH integration: cały zakres

### E.1 — DNS auto-management

**Use cases:**
- Po dodaniu domeny do Postal → auto-add SPF/DKIM/return-path CNAME do strefy OVH
- Po wystawieniu nowego LE cert → auto-update DNS-01 challenge (już Traefik robi przez LE HTTP-01, ale DNS-01 dla wildcard)
- Per-app subdomain: dodanie nowej apki w Coolify → auto-add A `app.myperformance.pl → 57.128.249.245`

**Endpointy OVH:**
- `GET /domain/zone/{zone}/record` — lista
- `POST /domain/zone/{zone}/record` — dodaj
- `DELETE /domain/zone/{zone}/record/{id}` — usuń
- `POST /domain/zone/{zone}/refresh` — apply changes

### E.2 — VPS snapshot (machine-level backup)

**Cel:** snapshot całego serwera (VPS dysk) — szybsze niż restore z DB dumps.

**Endpointy OVH:**
- `POST /vps/{name}/snapshot` — utwórz snapshot
- `GET /vps/{name}/snapshot` — lista
- `POST /vps/{name}/revert` — restore ze snapshotu (downtime ~5 min)

**Plan:** dashboard ma button "Snapshot now" + tygodniowy cron. Snapshoty trzymane przez 30 dni.

### E.3 — SMS 2FA via OVH SMS API

**Cel:** dodatkowe zabezpieczenie dla admin login + krytyczne akcje (mTLS toggle, user delete).

**Mechanizm:**
- User ustawia numer telefonu w `/account/security`
- Login z nowego urządzenia → SMS code zamiast email link
- Krytyczne akcje (delete user, change MFA) → SMS confirm

**Endpointy OVH:**
- `POST /sms/{serviceName}/jobs` — wyślij SMS

**Cost:** ~0.05 PLN per SMS, OVH ma pakiety.

### E.4 — Anti-DDoS detection / alerts

**Cel:** alert email/SMS gdy OVH wykrył atak na nasz IP.

**Endpointy:**
- `GET /ip/{ip}/mitigation` — status mitigation
- `GET /ip/{ip}/mitigationStats` — statystyki ataków

**Cron:** co 5 min sprawdza, gdy nowy event → email + SMS.

### E.5 — Bandwidth/billing monitoring

**Cel:** alert gdy zużycie/koszty rosną nieoczekiwanie.

**Endpointy:**
- `GET /me/bill` — lista faktur
- `GET /vps/{name}/bandwidth` — bandwidth usage

### E.6 — Email gateway (Phase F) — relay przez nasz dashboard

**Cel:** WSZYSTKIE apki wysyłają przez nasz dashboard SMTP daemon → renderujemy z naszych templates → forward do Postal.

**Wymaga:** dedykowany SMTP server w dashboard container (lib `smtp-server` npm), który jest podstawiany jako SMTP_HOST dla apek.

**Korzyści:** pełna kontrola treści maili wszystkich apek (nie tylko Keycloak). Dziś Documenso/Outline/Chatwoot mają hardcoded templates — przez gateway możemy je nadpisywać.

### E.7 — IPLB (Load Balancer) — high availability

**Cel:** drugi VPS jako fallback, OVH IPLB rozdziela ruch.

**Cost:** drugi VPS ~50 PLN/m + IPLB ~100 PLN/m. Tylko jeśli SLA > 99.9% wymagane.

---

## Co potrzebuję od Ciebie

### 1. Rozszerzony OVH Consumer Key (priority HIGH)

Aktualny token ma tylko 5 GET rules (read-only). Dla pełnej automatyzacji potrzebuję NOWEGO Consumer Key z rozszerzonym scope.

**Wygeneruj:** https://eu.api.ovh.com/createToken/

**Validity:** Unlimited

**Rights — wklej dokładnie:**
```
GET    /me
GET    /me/*
GET    /me/bill
GET    /domain
GET    /domain/*
POST   /domain/zone/*/record
DELETE /domain/zone/*/record/*
POST   /domain/zone/*/refresh
GET    /email/domain
GET    /email/domain/*
GET    /email/domain/*/account
GET    /email/domain/*/account/*
GET    /vps
GET    /vps/*
GET    /vps/*/snapshot
POST   /vps/*/snapshot
POST   /vps/*/revert
GET    /vps/*/bandwidth
GET    /ip
GET    /ip/*/mitigation
GET    /ip/*/mitigationStats
GET    /sms
POST   /sms/*/jobs
GET    /sms/*/jobs
GET    /cloud/project
GET    /cloud/project/*
GET    /cloud/project/*/storage
POST   /cloud/project/*/storage/*
```

**Po wygenerowaniu** wklej Consumer Key — App Key + Secret zostają te same.

### 2. OVH Public Cloud Storage (dla off-site backup)

**Aktywacja:** OVH Manager → Public Cloud → Object Storage → Create Container `myperf-backups` (region: GRA — Gravelines, najbliżej).

**Credentials potrzebne:**
- S3 Access Key (Object Storage credentials)
- S3 Secret Key  
- Endpoint URL (np. `https://s3.gra.io.cloud.ovh.net`)
- Region (`gra`)

**Cost:** ~10 PLN/100GB/m + bandwidth.

### 3. Numer telefonu administratora (dla SMS 2FA, opcjonalne)

Format: `+48XXXXXXXXX`. Dla przyszłej Phase E.3.

### 4. Decyzje:

- **Off-site sync:** OVH Object Storage (Phase D rozwiązanie 1) czy SSH pull z MacBook (rozwiązanie 2)?
- **Restore one-click:** czy potrzebny **automatyczny provision** clean VPS przez OVH API gdy główny serwer padnie? (wymaga `POST /vps/order` w token rights — drogie z punktu OVH limits)
- **Maintenance mode default**: 4h auto-disable czy dłuższy?

---

## Następne kroki (chronological)

1. ✅ Backup system działa (Phase A)
2. ⏳ Implement maintenance mode UI + middleware (Phase B)
3. ⏳ Refactor email panel — OVH jako core (Phase C)
4. ⏳ Czekam na rozszerzony token + Object Storage credentials → Phase D + E.1-E.6
5. ⏳ Email gateway (Phase F) — duże, na koniec gdy reszta stabilna
