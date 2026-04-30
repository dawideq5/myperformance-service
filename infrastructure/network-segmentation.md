# MyPerformance — Docker network segmentation design

Status: **DESIGN — not yet implemented**. Compose files w `infrastructure/*/docker-compose.yml` mają `# TODO: migrate to <zone>` komentarze; faktyczna migracja wymaga koordynacji z deploymentem Coolify (rolling, patrz §5).

Powiązane: [`infrastructure/REINSTALL.md`](./REINSTALL.md), [`infrastructure/traefik/README.md`](./traefik/README.md), [`infrastructure/backup/README.md`](./backup/README.md).

## 1. Problem

Obecnie wszystkie serwisy spinane są przez **jedną z dwóch wspólnych sieci**:

- `proxy-network` (Traefik + cokolwiek wystawione na zewnątrz),
- `myperformance_backend` (DB-y, sidecary, usługi wewnętrzne).

W praktyce oznacza to że:

1. Każdy panel publiczny może otworzyć TCP do każdej DB (np. panel-kierowca → postgres-keycloak), o ile zna nazwę kontenera. Jedyną barierą jest password hygiene, nie segmentacja sieci.
2. Wazuh (admin tooling) siedzi w tej samej domenie sieciowej co Documenso (klient-facing), bez ograniczeń.
3. Lateral movement po jednym przejęciu kontenera (RCE w Postal Rails, Documenso n8n) jest trywialny.

Cel: 4 trust zone'y, ruch między nimi tylko tam gdzie jest udokumentowana zależność.

## 2. Trust zones

| Zone | Cel | Polityka domyślna | Egress do internetu |
|---|---|---|---|
| **public-zone** | Edge proxy (Traefik) + ekspozycja zewnętrzna | wszystko musi przejść przez Traefik | tak (LE ACME, GitHub LFS) |
| **auth-zone** | Source-of-truth tożsamości i orchestrator IAM | tylko service-to-service kontrolowane | tylko KC → IdP federacji (Google) |
| **data-zone** | Wszystkie bazy danych (PG/MariaDB/Redis) per-app | brak egressu, brak ingressu spoza app-owner | nie |
| **admin-zone** | Operator tooling (Wazuh, Coolify, step-ca) | tylko konkretni admini, mTLS-gated | tak (Coolify deploy → registry) |

Każda zone to osobna user-defined Docker network z `internal: true` gdy "egress: nie". Komunikacja cross-zone wymaga **multi-attached container** (np. dashboard ma intf w `auth-zone` i `data-zone-dashboard`).

## 3. Service → zone mapping

### public-zone (1 sieć: `mp_public`)
- **Traefik** (jedyny ingress edge na 80/443/25)
- **wazuh-webhook receiver** (przez Traefik, mTLS-gated)

### auth-zone (1 sieć: `mp_auth`)
- **dashboard** (myperformance.pl) — orchestrator
- **keycloak** + **postal** (SMTP relay dla KC mail-i, ten sam trust level jak KC)
- **panel-sprzedawca / serwisant / kierowca / dokumenty** — należą tu, bo cała komunikacja to OIDC do KC i API do dashboarda

### data-zone (per-app sub-sieć żeby tenant isolation był prawdziwy)
- `mp_data_dashboard`: postgres-dashboard ←→ dashboard
- `mp_data_keycloak`: postgres-keycloak ←→ keycloak
- `mp_data_directus`: postgres-directus ←→ directus, redis-directus
- `mp_data_outline`: postgres-outline, redis-outline ←→ outline
- `mp_data_chatwoot`: postgres-chatwoot, redis-chatwoot ←→ chatwoot rails/sidekiq
- `mp_data_documenso`: postgres-documenso ←→ documenso
- `mp_data_postal`: mariadb-postal ←→ postal web/smtp/worker
- `mp_data_moodle`: mariadb-moodle ←→ moodle
- `mp_data_iam-queue`: redis-queue ←→ dashboard + queue-worker (zero ingress spoza tych dwóch)

Każda `mp_data_*` jest `internal: true` (no egress), tylko app-owner kontener i jego DB tam siedzą. Backupy lecą przez `docker exec` (host) — **nie potrzebują network access**.

### admin-zone (1 sieć: `mp_admin`)
- **Wazuh manager** + dashboard + indexer
- **step-ca** (root + intermediate + JWK provisioner) — tylko admin certyfikatowy
- **Coolify itself** — instancja Coolify-managed w `/data/coolify/`
- **mp_security_events ingestor** (jeśli wystawiony jako osobny serwis poza dashboardem)

Admin-zone jest dostępny tylko przez SSH bastion + mTLS Traefik routes z `RequireAndVerifyClientCert`. Żaden user-facing panel nie ma intf w admin-zone.

### Multi-attached containers (cross-zone)
- **traefik**: `mp_public` + `mp_auth` (zfwduje do KC i panel-i) + `mp_admin` (route do Wazuh dashboard, gated mTLS)
- **dashboard**: `mp_auth` + `mp_data_dashboard` + `mp_data_iam-queue`
- **queue-worker** (nowy, p. 7.9): `mp_auth` (do KC admin API) + `mp_data_iam-queue`
- **keycloak**: `mp_auth` + `mp_data_keycloak`
- **directus**: `mp_auth` + `mp_data_directus`
- **outline / chatwoot / documenso / moodle / postal**: `mp_auth` + ich `mp_data_<app>`
- **wazuh manager**: `mp_admin` + (opcjonalnie) `mp_auth` żeby logować eventy z KC

## 4. Firewall matrix (allow-list)

```
                  pub  auth  data-*  admin
public-zone        -    →     ✗       →   (admin tylko przez mTLS)
auth-zone          ✗    -    →own    ✗   (tylko własna data-zone)
data-zone          ✗    ✗     -      ✗   (internal: true, brak egressu)
admin-zone         ✗    →     ✗      -   (read-only do auth dla audytu)
```

Reguły dodatkowe:
- Egress internet:
  - Traefik (LE ACME, OCSP)
  - KC (federacja IdP — Google, OVH SMTP fallback)
  - Coolify (image pull, GitHub clone)
  - Wazuh (CTI feeds, cyfrowy podpis aktualizacji)
- Wszystko inne — **deny egress** (compose: `internal: true` + brak `extra_hosts`).

## 5. Coolify migration plan (rolling, zero downtime)

Każdy step jest reversible przez `docker network connect <old> <container>` przed odpięciem nowej sieci.

### Step 1 — utworzenie sieci (no-op)
```bash
docker network create --internal mp_data_dashboard
docker network create --internal mp_data_keycloak
docker network create --internal mp_data_directus
# ... per-app
docker network create mp_auth
docker network create mp_admin
docker network create mp_public  # może być aliasem proxy-network
```
Kontenery nadal lecą w starych sieciach — nic się nie psuje.

### Step 2 — dual-attach DB-ki
```bash
docker network connect mp_data_keycloak <postgres-keycloak-container>
docker network connect mp_data_keycloak <keycloak-container>
# Verify:
docker exec keycloak nc -zv postgres-keycloak-uuid 5432   # ok przez nową sieć
```
Stara `myperformance_backend` wciąż gada — jeszcze nic nie odpinamy.

### Step 3 — zmiana KC env żeby gadał przez nową sieć (jeśli używane są aliasy)
W Coolify GUI: edit env, redeploy. Stara sieć dalej attached, więc rollback przez "set old alias".

### Step 4 — odpięcie starych sieci
Po 1 tyg. obserwacji w Wazuh:
```bash
docker network disconnect myperformance_backend postgres-keycloak-container
```
Powtórz per app. Coolify deploy job może wymagać edycji compose'a w GUI ("network: name: mp_data_keycloak external: true").

### Step 5 — usunięcie legacy sieci
```bash
docker network rm myperformance_backend  # gdy 0 connected containers
```

### Bezpieczeństwo
- Step 4 dla auth-zone (KC + dashboard) **musi** iść po deploy hours (wieczór, < 5 active sessions).
- Każdy step → entry w `mp_security_events` (channel `network-segmentation`) + Slack/email notify do admin.
- Rollback skrypt: `infrastructure/network-segmentation-rollback.sh` (TBD — utworzyć w pierwszej iteracji wdrożenia).

## 6. Compose file conventions

Po migracji każdy `infrastructure/*/docker-compose.yml` powinien deklarować:

```yaml
networks:
  mp_auth:
    external: true
  mp_data_<app>:
    external: true
    # internal: true  -- tylko dla networks tworzonych z compose'a
```

Dashboards/panele attachują się do **dwóch sieci**: `mp_auth` (do KC) i `mp_data_<app>` (do swojej DB). Bazy danych — **tylko** `mp_data_<app>`.

## 7. Open questions

1. **Postal SMTP**: musi otrzymywać email-e z internetu (port 25 publiczny). Aktualnie w `proxy-network` — po migracji to `mp_public` z dedykowanym Traefik TCP router-em? Albo bezpośrednio host-network bypass dla portu 25?
2. **Keycloak userinfo cache** (zaadresowane w Faza 5) — jest w `dashboard`, więc `mp_auth` wystarczy. OK.
3. **step-ca JWK provisioner** musi być reachable z dashboarda (cert issuance). Cross-zone: `mp_admin → mp_auth` jednokierunkowo? Lub osobna `mp_pki` zone? Decyzja: na razie attach step-ca do `mp_admin` + `mp_auth`, formalizacja po pierwszym audycie.

## 8. Implementation roadmap

| Faza | Co | Status |
|---|---|---|
| 7.6.0 | Design doc (ten plik) | DONE |
| 7.6.1 | Per-compose `# TODO: migrate to <zone>` comments | DONE |
| 7.6.2 | Skrypt `infrastructure/network-segmentation-create.sh` (idempotentne `docker network create`) | DONE |
| 7.6.3 | Skrypt `infrastructure/network-segmentation-rollback.sh` (disconnect + rm wszystkich `mp_*`) | DONE |
| 7.6.4 | Coolify GUI walk-through w docs (screenshoty) | TODO — operator dodaje po pierwszym rollout |
| 7.6.5 | Production rollout per-app (Step 1-5 powyżej) | TODO — wymaga deploy window, **operator-only** |
| 7.6.6 | Wazuh AR rule: alert gdy kontener attaches się do "obcej" sieci | TODO — po Step 4 |

## 9. Operator runbook (pierwsze wdrożenie — single VPS)

Wymaga SSH access do VPS + docker group membership.

### Pre-check
```bash
# Sprawdź czy obecne sieci istnieją (powinny):
docker network inspect proxy-network myperformance_backend >/dev/null && echo OK

# Sprawdź czy żadna mp_* sieć już nie wisi (może z poprzedniej iteracji):
docker network ls | grep mp_ || echo "no mp_ networks — clean state"
```

### Krok 1 — utworzenie sieci (idempotentne)
```bash
cd /path/to/myperformance-service
sudo bash infrastructure/network-segmentation-create.sh
```
Verify: `docker network ls --filter label=myperformance.zone` → 11 sieci.

### Krok 2-4 — migracja serwisu po serwisie
Per app (zaczynaj od najmniej krytycznego, np. Outline):

```bash
APP=outline   # lub directus, chatwoot, documenso, postal, moodle, keycloak (LAST)

# 2a. Connect new networks (parallel — bez downtime)
docker network connect mp_auth ${APP}-app-container
docker network connect mp_data_${APP} ${APP}-db-container
docker network connect mp_data_${APP} ${APP}-app-container

# 2b. Verify pakiety w obu sieciach (curl z app do DB):
docker exec ${APP}-app-container nslookup ${APP}-db-container

# 2c. Po 1h obserwacji (Wazuh tail dla anomalii):
docker network disconnect myperformance_backend ${APP}-app-container
docker network disconnect myperformance_backend ${APP}-db-container
```

### Krok 5 — usunięcie legacy sieci (po migracji wszystkich apek)
```bash
# Tylko po confirming że nic już nie jest w starej sieci
docker network inspect myperformance_backend --format '{{len .Containers}}'  # → 0
docker network rm myperformance_backend
```

### Awaryjny rollback (jeśli Step 4 polał krew):
```bash
sudo bash infrastructure/network-segmentation-rollback.sh --dry-run  # podgląd
sudo bash infrastructure/network-segmentation-rollback.sh             # exec
```

### Wazuh integration (Step 7.6.6)
Po finalnym rollout — w `/var/ossec/etc/rules/local_rules.xml` dodaj:
```xml
<rule id="100850" level="10">
  <if_sid>87800</if_sid>
  <match>network connect</match>
  <description>MyPerformance: kontener attached do obcej sieci (poza mp_*)</description>
  <group>myperformance,network_segmentation,</group>
</rule>
```
Plus AR webhook: jak w `lib/security/wazuh-active-response.ts` — alert do dashboarda.
