# Środowisko deweloperskie

## Tryb hybrydowy (zalecany)

Lokalny Next.js hot-reload + zdalne usługi na serwerze.

### Setup (jednorazowo)

1. Skopiuj sekrety do `.env.local`:
   ```bash
   cp .env.example .env.local
   # Uzupełnij sekrety (z lastpass/bitwarden lub od admina)
   ```

2. Plik `.env.hybrid` jest już gotowy z URL-ami do zdalnych usług.

3. Zainstaluj zależności:
   ```bash
   npm install
   ```

### Uruchomienie

```bash
npm run dev:hybrid          # lokalny dev + zdalne usługi
npm run dev:hybrid:tunnel   # + SSH tunnel do bazy danych
```

Dashboard dostępny na: http://localhost:3000
Logowanie przez: Keycloak na auth.myperformance.pl

### Panele bez certyfikatu (dev bypass)

W trybie hybrydowym zmienna `DEV_CERT_BYPASS=true` wyłącza wymóg certyfikatu klienta w cert-gate API. Panele można otwierać bezpośrednio bez instalowania certu w przeglądarce.

Produkcja (Traefik) nadal wymaga certyfikatu — nie ma możliwości ominięcia mTLS na produkcji przez tę zmienną.

### Webhooks lokalnie

Aby testować webhooks (Keycloak events, Chatwoot, Moodle):
```bash
npm run dev:webhooks   # otwiera cloudflare/ngrok tunnel
```
Skopiuj URL tunelu i zaktualizuj webhook URLs w usługach.

### Wdrożenie do produkcji

```bash
npm run deploy
```
Automatycznie: testy → build → git push → Coolify deploy → oczekiwanie na zakończenie.

## Tryb lokalny (pełny Docker)

Gdy potrzebujesz pracować offline lub testować Keycloak konfigurację:
```bash
docker compose -f docker-compose.dev.yml up -d --build
```
Wszystkie usługi lokalnie (Keycloak na port 8080, dashboard 3000, panele 3001-3004).
