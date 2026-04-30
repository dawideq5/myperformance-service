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

- `myperformance-backup.sh` — główny skrypt backup. Idempotentny, side-effect free.
- `myperformance-backup.cron` — unit cron'a (codziennie 23:00).
- `myperformance-backup.containers.example` — szablon konfiguracji nazw kontenerów (skopiuj do `/etc/myperformance-backup.containers` na VPS i wypełnij).

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

## Off-site sync (zalecane)

Lokalny backup nie chroni przed zniszczeniem VPS. Opcje (patrz `docs/plan_enterprise_infrastructure.md` §D):

### Opcja 1 (zalecane): OVH Object Storage S3

```bash
# Po backup → rclone sync
sudo apt install rclone
rclone config  # ustaw remote 'ovh-s3' z S3 keys

# Dodaj do /etc/cron.d/myperformance-backup po linii 23:00:
30 23 * * * root rclone sync /backups/myperformance/ ovh-s3:myperf-backups/ \
  --max-age 7d --transfers 4 \
  >> /var/log/myperformance-backup-sync.log 2>&1
```

### Opcja 2: SSH pull z MacBook

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
