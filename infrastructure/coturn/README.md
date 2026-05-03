# coturn — TURN/STUN server dla LiveKit

`turn.myperformance.pl` — TURN relay dla klientów WebRTC za symmetric NAT-em.
Współpracuje z LiveKit SFU (`livekit.myperformance.pl`).

## Po co osobny coturn

LiveKit ma własny built-in TURN, ale w produkcji (cytuję LiveKit docs):

> For production deployments behind any kind of NAT, we recommend running
> coturn separately and disabling the embedded TURN.

Powód: built-in TURN dzieli proces z SFU — DDoS na TURN może wykończyć
signaling. Osobny proces w `network_mode: host` jest też prostszy do
firewallowania (separate iptables chain).

## Architektura

```
client (WebRTC)            internet            coturn (host network)
  |                                                |
  |  STUN Binding (3478/udp)  ─────────────────►   |   reflexive candidate
  |  TURN allocate            ─────────────────►   |   relay candidate
  |  TURN data                ─────────────────►   |   forward to peer
  |                                                |
  |                                                |
  └──── peer connection (relayed) ────────► livekit:7882/udp
```

## DNS (OVH)

| Type | Name | Value |
| --- | --- | --- |
| A | `turn.myperformance.pl` | `<VPS public IPv4>` |

## Wymagane envy (Coolify)

| Klucz | Wartość |
| --- | --- |
| `LIVEKIT_TURN_USER` | `livekit` (lub random ID) |
| `LIVEKIT_TURN_PASSWORD` | Random 32+ chars, base64-safe (TA SAMA wartość co w livekit env) |
| `LIVEKIT_NODE_IP` | Public IPv4 VPS (do `external-ip` w turnserver.conf) |
| `TURN_REALM` | `myperformance.pl` (default) |

## Firewall (VPS)

Otwórz na publicznym interfejsie:

```bash
# UFW
sudo ufw allow 3478/udp comment 'coturn STUN/TURN'
sudo ufw allow 3478/tcp comment 'coturn TURN over TCP'
sudo ufw allow 5349/tcp comment 'coturn TURN over TLS'
sudo ufw allow 49160:49200/udp comment 'coturn relay range'
sudo ufw reload

# iptables (jeśli ufw niedostępny)
sudo iptables -A INPUT -p udp --dport 3478 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 3478 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 5349 -j ACCEPT
sudo iptables -A INPUT -p udp --dport 49160:49200 -j ACCEPT
sudo netfilter-persistent save
```

> Wazuh AR (active response) używa custom chain `MYPERFORMANCE_BLOCK` —
> patrz [`infrastructure/wazuh`](../wazuh/) (jeśli istnieje). coturn rules
> idą do default INPUT chain, niżej w priorytecie.

## TLS dla `turn.myperformance.pl`

Coturn nie korzysta z Traefika (network_mode: host), więc TLS musi być
generowany niezależnie. Trzy opcje:

### Opcja A — certbot DNS-01 (zalecane)

OVH ma API DNS — certbot może wystawić cert bez wystawiania portu 80:

```bash
# Instalacja
sudo apt install certbot python3-certbot-dns-ovh

# OVH API credentials w /etc/letsencrypt/ovh.ini (chmod 600):
#   dns_ovh_endpoint = ovh-eu
#   dns_ovh_application_key = <z OVH API console>
#   dns_ovh_application_secret = <...>
#   dns_ovh_consumer_key = <...>
sudo chmod 600 /etc/letsencrypt/ovh.ini

# Pierwsze wystawienie
sudo certbot certonly \
  --dns-ovh \
  --dns-ovh-credentials /etc/letsencrypt/ovh.ini \
  --dns-ovh-propagation-seconds 60 \
  -d turn.myperformance.pl \
  -m admin@myperformance.pl --agree-tos --no-eff-email

# Skopiuj do bind-mount path (coturn nie czyta /etc/letsencrypt bezpośrednio
# żeby uniknąć szerokich uprawnień):
sudo mkdir -p /opt/myperformance/coturn/certs
sudo cp /etc/letsencrypt/live/turn.myperformance.pl/fullchain.pem \
        /opt/myperformance/coturn/certs/
sudo cp /etc/letsencrypt/live/turn.myperformance.pl/privkey.pem \
        /opt/myperformance/coturn/certs/
sudo openssl dhparam -out /opt/myperformance/coturn/certs/dhparam.pem 2048
sudo chmod 644 /opt/myperformance/coturn/certs/*.pem
sudo chown -R 1000:1000 /opt/myperformance/coturn/certs

# Auto-renew hook — restart coturn po renew (cron / systemd timer
# certbota uruchamia hook automatycznie):
sudo tee /etc/letsencrypt/renewal-hooks/deploy/coturn.sh <<'EOF'
#!/bin/sh
DOMAIN=turn.myperformance.pl
DST=/opt/myperformance/coturn/certs
cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem $DST/
cp /etc/letsencrypt/live/$DOMAIN/privkey.pem $DST/
chmod 644 $DST/*.pem
docker kill --signal=SIGUSR2 coturn-* 2>/dev/null || true
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/coturn.sh
```

> Coturn re-czyta certyfikat po `SIGUSR2` (bez restartu, bez utraty
> aktywnych alokacji). `SIGHUP` reloaduje cały config.

### Opcja B — kopia z Traefika

Traefik trzyma certy w `/data/coolify/proxy/acme.json` (JSON encoded).
Można je wyciągać skryptem (np. `traefik-certs-dumper`), ale to dodatkowa
infra — opcja A prostsza.

### Opcja C — step-ca (internal CA)

Tylko dla wewnętrznego ruchu (np. test stage). Klienci browserowi dostaną
warning bez root_ca w trust store, więc niepraktyczne dla publicznego turn-a.

## Deployment (Coolify)

1. **DNS** + **firewall** jak wyżej.
2. **Cert TLS** — opcja A (certbot DNS-01) PRZED deployem.
3. **Coolify → New Service → Docker Compose** — wklej `docker-compose.yml`.
4. **Bind mount sanity** — Coolify musi mieć dostęp do
   `/opt/myperformance/coturn/{turnserver.conf,certs/...}`. Wykonaj na VPS-ie:
   ```bash
   sudo mkdir -p /opt/myperformance/coturn
   sudo cp <repo>/infrastructure/coturn/turnserver.conf /opt/myperformance/coturn/
   sudo sed -i "s|EXTERNAL_IP_PLACEHOLDER|$(curl -s ifconfig.me)|" \
        /opt/myperformance/coturn/turnserver.conf
   sudo sed -i "s|TURN_USER_PLACEHOLDER|$LIVEKIT_TURN_USER|" \
        /opt/myperformance/coturn/turnserver.conf
   sudo sed -i "s|TURN_PASS_PLACEHOLDER|$LIVEKIT_TURN_PASSWORD|" \
        /opt/myperformance/coturn/turnserver.conf
   sudo chmod 600 /opt/myperformance/coturn/turnserver.conf
   ```
   I podmień ścieżkę w compose (`./turnserver.conf` →
   `/opt/myperformance/coturn/turnserver.conf`).
5. **Environment Variables** w Coolify — wklej z tabeli wyżej.
6. **Deploy**. Logi powinny pokazać:
   ```
   ===========Listening IPs are =========
   X.X.X.X (public)
   ============= Relay address range =========
   49160-49200
   ===========================================
   IPv4. Listener opened on : X.X.X.X:3478
   IPv4. TLS-Listener opened on : X.X.X.X:5349
   ```

## Health check — TURN allocation test

Coturn ma własne narzędzia: `turnutils_uclient` i `turnutils_stunclient`.

```bash
# STUN check (no auth) — powinno zwrócić Mapped-Address z public IP klienta
turnutils_stunclient -p 3478 turn.myperformance.pl

# TURN allocation check (z credentials)
turnutils_uclient -u "$LIVEKIT_TURN_USER" -w "$LIVEKIT_TURN_PASSWORD" \
                  -p 3478 -y turn.myperformance.pl

# Z TLS
turnutils_uclient -u "$LIVEKIT_TURN_USER" -w "$LIVEKIT_TURN_PASSWORD" \
                  -p 5349 -S turn.myperformance.pl
```

Oczekiwany output: `success_done` w ostatniej linii. Jeśli timeout —
sprawdź firewall i `external-ip`.

Online tester (gdy nie masz `turnutils_*` lokalnie):
- https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
- Wpisz `turn:turn.myperformance.pl:3478` + user/pass → kliknij „Add Server"
  → „Gather candidates". Powinny pojawić się typu `relay`.

## Troubleshooting

- **`401 Unauthorized` w turnutils** — `realm` nie zgadza się. Coturn liczy
  hash credentialu z `realm` + `user` + `password`; zmiana realm = nowe creds.
- **Nie ma kandydatów `relay` w trickle-ice** — `external-ip` źle ustawiony,
  albo firewall blokuje `min-port/max-port`.
- **`SSL: error:0A000086:SSL routines::certificate verify failed`** — TLS cert
  wygasł lub nie ma pełnego chain. Sprawdź `openssl s_client -connect
  turn.myperformance.pl:5349 -servername turn.myperformance.pl`.
- **High CPU coturn (~100%)** — typowe dla wielu jednoczesnych alokacji
  (pakiety UDP forwardowane userspace). Limit `cpus: 1.5` w compose to
  margines; gdy regularnie zbliża się do limitu, rozszerz `min-port/max-port`
  i podnieś `user-quota`.

## Rotacja credentialu

`LIVEKIT_TURN_PASSWORD` należy rotować co 90 dni:

1. Wygeneruj nowe hasło (`openssl rand -base64 48 | tr -d '/+=' | cut -c1-32`).
2. Zaktualizuj env w **obu** serwisach (livekit + coturn) w Coolify.
3. Zaktualizuj `turnserver.conf` na VPS-ie (sed-em jak w Deployment p.4).
4. `docker kill --signal=SIGHUP coturn-<hash>` (reload bez restart).
5. Redeploy LiveKita (recreate kontenera — env do livekit.yaml interpoluje
   się tylko przy starcie).
6. Test smoke (turnutils_uclient z nowymi creds).

## Powiązane

- [`infrastructure/livekit/README.md`](../livekit/README.md) — LiveKit setup
- coturn man pages: `man turnserver`, `man turnadmin`
- coturn config reference: https://github.com/coturn/coturn/blob/master/examples/etc/turnserver.conf
