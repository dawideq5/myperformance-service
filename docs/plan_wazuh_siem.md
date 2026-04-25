# Plan: Wazuh SIEM/XDR — pełen deployment + custom dashboard

**Data:** 2026-04-25
**Cel:** Enterprise security operations center wbudowany w nasz dashboard. Custom panel `/admin/security` odzwierciedlający całą funkcjonalność Wazuha — ale w naszym stylu, z naszym brandingiem, zintegrowany z istniejącymi feature'ami (KC users, Coolify deployments, OVH events).

---

## Architektura

```
                   Internet
                       │
                       ▼
                   Traefik (HTTPS + mTLS)
                       │
              ┌────────┼────────┐
              │        │        │
              ▼        ▼        ▼
        wazuh.    myperformance.   panele/...
       myperf.pl       pl
              │        │
              │  ┌─────┘
              │  │
              ▼  ▼
        Wazuh Stack:
        ┌──────────────────────────────────────┐
        │ Manager (1.5GB) ── port 1514 (agent) │
        │                ── port 55000 (API)   │
        │                                      │
        │ Indexer/OpenSearch (3GB, 50GB)       │
        │                ── port 9200          │
        │                                      │
        │ Dashboard (1.5GB) — wazuh.myperf.pl  │
        │                ── port 5601          │
        └──────────────────────────────────────┘
                       ▲
                       │ Wazuh Agent (per host/container)
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
     host VPS    keycloak     coolify    + ...
     (logs)      (logs)       (logs)
```

**Resource cost:**
- Wazuh All-in-One: ~6 GB RAM, ~50 GB disk (initial), rośnie ~1 GB/m logs
- VPS-3 (24 GB RAM / 200 GB SSD): zostaje 18 GB RAM / 150 GB free → OK

---

## Phase F.1 — Deployment

**Mechanizm:** Docker compose Wazuh All-in-One jako Coolify service.

**docker-compose.yml** (wkleimy do Coolify Resources → New → Docker Compose):

```yaml
version: '3.7'
services:
  wazuh.manager:
    image: wazuh/wazuh-manager:4.10.0
    hostname: wazuh.manager
    restart: always
    ulimits:
      memlock: { soft: -1, hard: -1 }
      nofile: { soft: 655360, hard: 655360 }
    ports:
      - "1514:1514"
      - "1515:1515"
      - "514:514/udp"
      - "55000:55000"
    environment:
      - INDEXER_URL=https://wazuh.indexer:9200
      - INDEXER_USERNAME=admin
      - INDEXER_PASSWORD=${WAZUH_INDEXER_PASSWORD}
      - FILEBEAT_SSL_VERIFICATION_MODE=full
      - SSL_CERTIFICATE_AUTHORITIES=/etc/ssl/root-ca.pem
      - SSL_CERTIFICATE=/etc/ssl/filebeat.pem
      - SSL_KEY=/etc/ssl/filebeat.key
      - API_USERNAME=wazuh-wui
      - API_PASSWORD=${WAZUH_API_PASSWORD}
    volumes:
      - wazuh_api_configuration:/var/ossec/api/configuration
      - wazuh_etc:/var/ossec/etc
      - wazuh_logs:/var/ossec/logs
      - wazuh_queue:/var/ossec/queue
      - wazuh_var_multigroups:/var/ossec/var/multigroups
      - wazuh_integrations:/var/ossec/integrations
      - wazuh_active_response:/var/ossec/active-response/bin
      - wazuh_agentless:/var/ossec/agentless
      - wazuh_wodles:/var/ossec/wodles
      - filebeat_etc:/etc/filebeat
      - filebeat_var:/var/lib/filebeat

  wazuh.indexer:
    image: wazuh/wazuh-indexer:4.10.0
    hostname: wazuh.indexer
    restart: always
    ports: ["9200:9200"]
    environment:
      - "OPENSEARCH_JAVA_OPTS=-Xms2g -Xmx2g"
    ulimits:
      memlock: { soft: -1, hard: -1 }
      nofile: { soft: 65536, hard: 65536 }
    volumes:
      - wazuh-indexer-data:/var/lib/wazuh-indexer

  wazuh.dashboard:
    image: wazuh/wazuh-dashboard:4.10.0
    hostname: wazuh.dashboard
    restart: always
    ports: ["443:5601"]
    environment:
      - INDEXER_USERNAME=admin
      - INDEXER_PASSWORD=${WAZUH_INDEXER_PASSWORD}
      - WAZUH_API_URL=https://wazuh.manager
      - DASHBOARD_USERNAME=kibanaserver
      - DASHBOARD_PASSWORD=${WAZUH_DASHBOARD_PASSWORD}
    depends_on: [wazuh.indexer]
    labels:
      - traefik.enable=true
      - "traefik.http.routers.wazuh.rule=Host(`wazuh.myperformance.pl`)"
      - traefik.http.routers.wazuh.tls=true
      - traefik.http.routers.wazuh.tls.certresolver=letsencrypt
      - traefik.http.routers.wazuh.tls.options=mtls-wazuh@file
      - traefik.http.services.wazuh.loadbalancer.server.port=5601

volumes: { wazuh_api_configuration:, wazuh_etc:, wazuh_logs:, wazuh_queue:, wazuh_var_multigroups:, wazuh_integrations:, wazuh_active_response:, wazuh_agentless:, wazuh_wodles:, filebeat_etc:, filebeat_var:, wazuh-indexer-data: }
```

**Plus:** rozszerzenie `mtls.yml` o `mtls-wazuh` tls.options + auto-add CNAME `wazuh.myperformance.pl` przez OVH API.

---

## Phase F.2 — Agents installation

**Host VPS (Ubuntu):**

```bash
curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | sudo gpg --dearmor -o /usr/share/keyrings/wazuh.gpg
echo "deb [signed-by=/usr/share/keyrings/wazuh.gpg] https://packages.wazuh.com/4.x/apt/ stable main" | sudo tee /etc/apt/sources.list.d/wazuh.list
sudo apt update
sudo WAZUH_MANAGER='wazuh.manager' apt install wazuh-agent
sudo systemctl enable --now wazuh-agent
```

**Per-container** — Wazuh agent w sidecar container w naszym docker-compose dla każdej apki:

```yaml
# Sidecar pattern — dla każdej apki:
wazuh-agent-keycloak:
  image: wazuh/wazuh-agent:4.10.0
  network_mode: container:keycloak-hg0i1ii7tg5btyok3o2gqnf0
  volumes:
    - keycloak-logs:/var/log/keycloak:ro
  environment:
    - WAZUH_MANAGER=wazuh.manager
    - WAZUH_AGENT_NAME=keycloak
    - WAZUH_AGENT_GROUP=keycloak
```

---

## Phase F.3 — Custom decoders dla naszego stacku

**Keycloak** — `/var/ossec/etc/decoders/local_keycloak.xml`:

```xml
<decoder name="keycloak">
  <prematch>type="LOGIN_ERROR"|type="LOGIN"|type="USER_DELETED"</prematch>
</decoder>

<decoder name="keycloak-fields">
  <parent>keycloak</parent>
  <regex>type="(\S+)"\s+realmId=.*\s+ipAddress=(\S+)\s+error=(\S+)?\s+auth_method=(\S+)?</regex>
  <order>action,srcip,error,auth_method</order>
</decoder>
```

**Custom rules** — `/var/ossec/etc/rules/local_keycloak_rules.xml`:

```xml
<group name="keycloak,authentication_failed">
  <rule id="100100" level="5">
    <decoded_as>keycloak</decoded_as>
    <field name="action">LOGIN_ERROR</field>
    <description>Keycloak: login failed</description>
  </rule>

  <rule id="100101" level="10" frequency="5" timeframe="300">
    <if_matched_sid>100100</if_matched_sid>
    <same_field>srcip</same_field>
    <description>Keycloak: brute force from $(srcip) — 5+ failed in 5 min</description>
    <group>brute_force,attack</group>
  </rule>

  <rule id="100110" level="12">
    <decoded_as>keycloak</decoded_as>
    <field name="action">USER_DELETED</field>
    <description>Keycloak: user deleted (KC = SoT cascade trigger)</description>
  </rule>
</group>
```

Podobnie decoders dla Postal, Coolify, dashboard IAM audit.

---

## Phase F.4 — Active Response: auto-block

**Skrypt `/var/ossec/active-response/bin/block-ip-traefik.sh`** — gdy rule 100101 (brute force) trigger, dynamicznie aktualizuje Traefik dynamic file z IP w blocklist:

```bash
#!/bin/bash
# Dodaje IP do Traefik IPAllowList (lub blocklist) przez modyfikację
# /data/coolify/proxy/dynamic/blocklist.yml — Traefik file watch reloads.
ACTION=$1   # add / delete
IP=$2
TS=$(date -Iseconds)
TRAEFIK_BLOCKLIST="/data/coolify/proxy/dynamic/blocklist.yml"

# (...) python merge YAML
echo "$TS [block-ip-traefik] action=$ACTION ip=$IP" >> /var/ossec/logs/active-responses.log
```

**Plus** w Wazuh Manager:
```xml
<active-response>
  <command>block-ip-traefik</command>
  <location>local</location>
  <rules_id>100101,100201</rules_id>
  <timeout>3600</timeout>  <!-- auto-unblock po 1h -->
</active-response>
```

---

## Phase F.5 — Custom dashboard `/admin/security`

**Architektura:** dashboard wykorzystuje 2 API:
- **Wazuh API** (port 55000) — agents, rules, configuration, manual response
- **Wazuh Indexer** (OpenSearch port 9200) — alerts/events search

Wszystko proxowane przez Next.js routes (auth-guarded).

**lib/wazuh.ts** — client wrapper:
- `getWazuhAuth()` — login do API → JWT
- `searchAlerts({ from, size, filter })` — opensearch _search
- `listAgents()` / `getAgentStats()`
- `listActiveBlocks()` / `unblockIp(ip)`
- `getMITREStats()` — agregacja wg ATT&CK techniques
- `getVulnerabilities(agent)`
- `getFimChanges(agent)`

**API endpointy** w naszym dashboardzie:

```
GET    /api/admin/security/dashboard     → KPI: alerts(24h), blocks, vulns, MITRE
GET    /api/admin/security/alerts        → paginated, filter: agent, level, srcip, MITRE
GET    /api/admin/security/blocks        → aktywne IP blocks
DELETE /api/admin/security/blocks/[ip]   → manual unblock
GET    /api/admin/security/agents        → status (online/offline) per agent
GET    /api/admin/security/fim/[agent]   → FIM changes
GET    /api/admin/security/vulns/[agent] → CVE list per agent
GET    /api/admin/security/compliance    → score per framework (PCI/HIPAA/GDPR/NIST)
GET    /api/admin/security/stream        → Server-Sent Events live alerts
```

**UI struktura:**

```
/admin/security
├── Dashboard          (KPI cards + last 24h chart + MITRE heatmap)
├── Alerty             (tabela z filter + drill-down)
├── Zablokowane IP     (lista + button "Odblokuj" per IP)
├── Agenci             (status online/offline + last_seen + version)
├── File Integrity     (zmiany w monitorowanych plikach)
├── Vulnerabilities    (CVE per agent + severity)
├── Compliance         (score cards per framework)
└── Live stream        (real-time tail przez SSE)
```

**Każdy widok w naszym stylu** (Card + Tabs + branded colors), z embedded MITRE ATT&CK heatmapy, sparklines aktywności, drill-down do raw event JSON.

---

## Phase F.6 — Email alerting

Wazuh ma wbudowane email integration — `<email_alerts>` w `ossec.conf`:

```xml
<global>
  <email_notification>yes</email_notification>
  <email_to>dawidtychy5@gmail.com</email_to>
  <smtp_server>10.0.1.7</smtp_server>
  <email_from>wazuh@myperformance.pl</email_from>
</global>

<email_alerts>
  <email_to>dawidtychy5@gmail.com</email_to>
  <level>10</level>           <!-- tylko high+critical -->
  <do_not_delay/>             <!-- natychmiast -->
</email_alerts>
```

Alerty na poziom 10+ (brute force, file integrity, anti-DDoS, SQLi attempts, etc.) lecą natychmiast na email.

**Branded HTML email** — custom integration script który przed wysyłką renderuje HTML zgodny z naszym layoutem (czarny header MyPerformance, ten sam co backup notify).

---

## Phase F.7 — Integracje z ekosystemem

### Keycloak ↔ Wazuh
- KC eventListener → syslog do Wazuh agent na KC container
- Custom decoders matchują KC auth events
- Wazuh active response po brute force → blokada IP w Traefik

### Coolify ↔ Wazuh
- Coolify deployment events (POST /deploy) → custom webhook → Wazuh
- File integrity monitoring na `/data/coolify/proxy/dynamic/*.yml` (mtls.yml, etc) — alert gdy ktoś zmieni TLS config
- Container start/stop events przez Docker socket

### OVH ↔ Wazuh
- Cron co 5 min: pobiera `/ip/{ip}/mitigation` przez OVH API → wysyła do Wazuh przez API
- Anti-DDoS event → wysoki priorytet alert + auto-create snapshot (defense)
- Billing anomaly: `/me/bill` → alert gdy nowa faktura odbiega od średniej

### Dashboard ↔ Wazuh
- Każdy `appendIamAudit()` → też syslog do Wazuh
- Webhook events (KC delete user, Postal SMTP errors) → Wazuh dla correlation

---

## Co potrzebuję zrobić ręcznie (post-deploy)

**1. Coolify deploy Wazuh** — wkleisz `docker-compose.yml` w Coolify → Resources → New → Docker Compose. Set env vars:
```
WAZUH_INDEXER_PASSWORD=<random_32_chars>
WAZUH_API_PASSWORD=<random_32_chars>
WAZUH_DASHBOARD_PASSWORD=<random_32_chars>
```

**2. DNS auto-add** — dashboard zrobi przez OVH API (już mamy uprawnienia).

**3. mTLS** — `wazuh.myperformance.pl` w `mtls.yml` jako `mtls-wazuh` tls.options (taki sam Cert Authority jak inne panele).

**4. Pierwszy agent** — install na hoście VPS:
```bash
sudo WAZUH_MANAGER='wazuh.manager' apt install wazuh-agent
sudo systemctl enable --now wazuh-agent
```

**5. Custom decoders/rules** — zostaną wgrane przez plik `/var/ossec/etc/decoders/local_*.xml` na manager container.

**6. Email integration** — config `ossec.conf` z SMTP settings (Postal IP).

**7. Active response** — skrypt `block-ip-traefik.sh` w `/var/ossec/active-response/bin/`.

---

## Estymowany czas implementacji

| Phase | Czas | Status |
|-------|------|--------|
| F.1 Deployment Wazuh stack | 30 min (Coolify + verify) | TBD |
| F.2 Agent na hoście | 5 min | TBD |
| F.3 Decoders KC + Postal + Coolify | 1h (testowanie) | TBD |
| F.4 Active Response block IP | 30 min | TBD |
| F.5 Custom panel `/admin/security` | 4-8h (zależy od scope) | TBD |
| F.6 Email alerting + branded HTML | 30 min | TBD |
| F.7 Integracje (KC/Coolify/OVH events) | 2h | TBD |
| **Razem MVP** | **~10h pracy** | |

**MVP custom panel** = Dashboard + Alerty + Blocked IPs + Agents (4 widoki). Pozostałe (FIM, Vulnerabilities, Compliance, Live stream) mogą poczekać.

---

## Następne pytania

1. **Wazuh Indexer 50GB initial storage** — VPS ma 200GB total, używa 64GB. OK na razie (mam 136GB free), ale za rok logi mogą zająć 30-50GB. Czy aktywować z OVH **Additional Disk** (płatny) czy przetnij retencję starych logów (np. 90 dni)?

2. **mTLS dla `wazuh.myperformance.pl`** — używać tego samego CA co panele (`mtls-sprzedawca` itp.) czy osobne CA dla operations?

3. **Active Response auto-block** — proponuję 1h timeout z możliwością manual extend (bez timeout = permaban) w naszym panelu. OK?

4. **Custom panel scope MVP** — dashboard + alerty + blocked IPs + agents wystarczą na start? FIM/Vulns/Compliance dodam jako Phase F.8.
