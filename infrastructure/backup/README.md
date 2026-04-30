# MyPerformance — backup infrastructure

Codzienny backup całego stacku z notyfikacją do dashboarda przez webhook.

## Co backupowane

8 baz + filesystem volumes:

| # | Komponent | Typ | Rozmiar dump (typowo) |
|---|---|---|---|
| 1 | Dashboard (Next.js + email/iam tables) | Postgres | ~2-5 MB |
| 2 | Keycloak (realm, users, sessions) | Postgres | ~5-10 MB |
| 3 | Outline (wiki) | Postgres | ~1-3 MB |
| 4 | Directus (CMS) | Postgres | ~2-8 MB |
| 5 | Chatwoot (chat) | Postgres | ~5-15 MB |
| 6 | Documenso (e-signing) | Postgres | ~2-10 MB |
| 7 | Postal (mail relay) | MariaDB | ~5-50 MB |
| 8 | Moodle (LMS) | MariaDB | ~10-100 MB |
| F1 | `/data/coolify/` (compose, secrets) | filesystem tarball | ~5-20 MB |
| F2 | `/data/coolify/proxy/dynamic/` (Traefik) | filesystem tarball | ~10 KB |
| F3 | `/data/coolify/proxy/certs/` (mTLS bundle, LE certs) | filesystem tarball | ~50 KB |

Razem ~30-200 MB na backup. Retencja domyślna: 7 dni lokalnie.

## Pliki w tym katalogu

- [`myperformance-backup.sh`](./myperformance-backup.sh) — główny skrypt backup. Idempotentny, side-effect free.
- [`s3-sync.sh`](./s3-sync.sh) — off-site sync `/backups/myperformance/` → OVH Object Storage (rclone). Uruchamiany 30 min po backup.
- [`myperformance-backup.cron`](./myperformance-backup.cron) — unit cron'a (23:00 backup + 23:30 S3 sync).
- [`myperformance-backup.containers.example`](./myperformance-backup.containers.example) — szablon konfiguracji nazw kontenerów (skopiuj do `/etc/myperformance-backup.containers` na VPS i wypełnij).

## Deployment na VPS

### 1. Skrypt + cron

```bash
sudo cp infrastructure/backup/myperformance-backup.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/myperformance-backup.sh
sudo cp infrastructure/backup/myperformance-backup.cron /etc/cron.d/myperformance-backup
sudo chmod 644 /etc/cron.d/myperformance-backup
sudo systemctl reload cron  # lub `service cron reload`
```

### 2. Nazwy kontenerów (Coolify generuje UUID-y per service)

Coolify nadaje kontenerom nazwy w stylu `database-c9dxxjvb3rskueiuguudbqgb`. Znajdź nazwy:

```bash
docker ps --format '{{.Names}}\t{{.Image}}' | grep -E '(postgres|mariadb|mysql)' 
```

Zmapuj na zmienne i zapisz do `/etc/myperformance-backup.containers`:

```bash
sudo cat > /etc/myperformance-backup.containers <<'EOF'
DASHBOARD_DB_CONTAINER="database-xxx-dashboard"
KC_DB_CONTAINER="database-yyy-keycloak"
OUTLINE_DB_CONTAINER="database-zzz-outline"
DIRECTUS_DB_CONTAINER="database-aaa-directus"
CHATWOOT_DB_CONTAINER="database-bbb-chatwoot"
DOCUMENSO_DB_CONTAINER="database-ccc-documenso"
POSTAL_DB_CONTAINER="postal-mariadb-ddd"
MOODLE_DB_CONTAINER="mariadb-eee"
EOF
sudo chmod 600 /etc/myperformance-backup.containers
```

### 3. Webhook secret + dashboard URL

```bash
sudo tee -a /etc/myperformance-backup.containers <<'EOF'
BACKUP_WEBHOOK_SECRET="<ten sam co w Coolify env dashboarda BACKUP_WEBHOOK_SECRET>"
DASHBOARD_URL="https://myperformance.pl"
EOF
```

`BACKUP_WEBHOOK_SECRET` musi być identyczny z env dashboarda (handler `/api/webhooks/backup` weryfikuje HMAC-SHA256).

### 4. Test-run

```bash
sudo -E /usr/local/bin/myperformance-backup.sh
ls -lah /backups/myperformance/
```

Sprawdź:
- Czy wszystkie 8 baz są w `*.sql.gz` (lub log pokazuje skip dla brakujących container env-ów).
- Czy 3 tar.gz są (coolify-data, traefik-dynamic, traefik-certs).
- Czy `manifest.json` parsuje się jako JSON (`jq . manifest.json`).
- Czy webhook do dashboarda dotarł (sprawdź `/admin/infrastructure` → tab Backup, lub `mp_security_events` table z eventem `backup.completed` / `backup.failed`).

## S3 sync (zalecane: OVH Object Storage)

Lokalny backup nie chroni przed zniszczeniem VPS. Skrypt [`s3-sync.sh`](./s3-sync.sh) realizuje off-site sync na OVH Object Storage (S3-compatible) przez rclone. Cron entry 23:30 (30 min po backup, żeby pliki były spójne).

### 1. Stwórz bucket w OVH Public Cloud

- OVH Manager → Public Cloud → wybierz projekt → Object Storage → Create container.
- Region: zalecany `GRA` lub `SBG` (Polska/Niemcy — niska latencja z VPS w Europie).
- Type: **High Performance** (S3-compatible) — NIE Swift Storage.
- Bucket name np. `myperformance-backups`.

### 2. Wygeneruj S3 credentials

W OVH Manager → wybrany projekt → Users & Roles → wybierz user-a (lub stwórz dedykowanego `myperformance-backup-bot`) → "Generate S3 credentials". Notuj `Access Key ID` + `Secret Access Key`.

Przyznaj rolę `ObjectStore_operator` na projekt — bez tego rclone dostanie 403 przy upload-ach.

### 3. Konfiguracja rclone na VPS

```bash
sudo apt install rclone
sudo rclone config
```

W interactive prompt:
```
n) New remote
name> ovh-s3
Storage> s3
provider> Other
env_auth> false
access_key_id> <Access Key ID>
secret_access_key> <Secret Access Key>
region>           # zostaw puste (OVH ignoruje)
endpoint> s3.<region>.cloud.ovh.net   # np. s3.gra.cloud.ovh.net
location_constraint> <region>          # np. gra
acl> private
```

Test:
```bash
sudo rclone lsd ovh-s3:                  # listuje buckety
sudo rclone mkdir ovh-s3:myperformance-backups  # idempotent
```

### 4. Dodaj S3_BUCKET do `/etc/myperformance-backup.containers`

```bash
sudo tee -a /etc/myperformance-backup.containers <<'EOF'

# === S3 off-site sync ===
S3_BUCKET="myperformance-backups"
# Opcjonalne — domyślnie ovh-s3, "":
S3_REMOTE="ovh-s3"
S3_PREFIX=""
S3_MAX_AGE="7d"
S3_TRANSFERS="4"
EOF
```

### 5. Zainstaluj `s3-sync.sh` + cron

```bash
sudo cp infrastructure/backup/s3-sync.sh /usr/local/bin/myperformance-backup-s3-sync.sh
sudo chmod +x /usr/local/bin/myperformance-backup-s3-sync.sh
# myperformance-backup.cron już zawiera entry 23:30 (po Step 1 deploymentu).
```

Test-run:
```bash
sudo -E /usr/local/bin/myperformance-backup-s3-sync.sh
sudo rclone lsl ovh-s3:myperformance-backups/  # weryfikacja
```

### Alternatywa: SSH pull z MacBook

Niezalecane jako jedyna kopia (MacBook może być offline tygodniami) — ale OK jako secondary:

```bash
# Cron na MacBook (LaunchAgent, patrz scripts/dev/macbook-setup.md):
rsync -avz ubuntu@vps:/backups/myperformance/ ~/MyPerformance-Backups/
```

## Restore

`scripts/dev/macbook-restore.sh <YYYY-MM-DD>` — patrz `scripts/dev/macbook-setup.md`.

Skrypt:
1. Inicjalizuje czystą instancję Coolify.
2. Restoruje dump'y do nowych kontenerów Postgres/MariaDB.
3. Restoruje `/data/coolify/` z tarball.
4. Reset KC realm config (po restore KC trzeba `kcadm.sh import realm-export.json`).

## Monitoring

Dashboard `/admin/infrastructure` pokazuje:
- Ostatni backup status + size + duration.
- Listę 7 ostatnich backup'ów.
- Email alert gdy `backup.failed` lub gdy poprzedni `success` nie wpadł od >25h.

Webhook handler: `app/api/webhooks/backup/route.ts` (zapisuje do `mp_security_events` + notify admins).

## Rotation

Skrypt automatycznie usuwa `/backups/myperformance/<old-dir>` starsze niż `RETENTION_DAYS=7`. Off-site sync (S3) używa `--max-age 7d` żeby też ograniczyć retencję na zdalnym storage.

## Troubleshooting

- **`pg_dump ... failed`**: container nie wystawia portu Postgres na localhost — używamy `docker exec` więc działa. Sprawdź czy container jest running (`docker ps`) i czy user/db są poprawne.
- **`webhook do dashboarda failed`**: non-fatal, backup jest OK. Sprawdź czy `BACKUP_WEBHOOK_SECRET` matchuje + czy dashboard ma route `/api/webhooks/backup` (powinien — `app/api/webhooks/backup/route.ts`).
- **Manifest brak entries**: `find` w `/backups/myperformance` z `*.sql.gz` zwrócił 0 — albo wszystkie dump'y failowały, albo `BACKUP_DIR` jest złe. Sprawdź log.
