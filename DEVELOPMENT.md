# Środowisko deweloperskie

## Tryb hybrydowy (zalecany)

Lokalny Next.js hot-reload + zdalne usługi na serwerze.

### Struktura katalogów

```
/Users/dawidpaluska/myperformance-service/   ← root repozytorium
└── myperformance-service/                   ← katalog projektu (tu npm run)
    ├── package.json
    ├── .env.hybrid
    ├── scripts/
    └── ...
```

### Setup (jednorazowo)

```bash
# Wejdź do katalogu projektu
cd /Users/dawidpaluska/myperformance-service/myperformance-service

# Zainstaluj zależności
npm install
```

Plik `.env.hybrid` jest już gotowy ze wszystkimi sekretami i URL-ami.

### Uruchomienie

```bash
# Upewnij się że jesteś w katalogu projektu:
cd /Users/dawidpaluska/myperformance-service/myperformance-service

npm run dev:hybrid   # lokalny dev + zdalne usługi + SSH tunnel do DB
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
