# MyPerformance Dashboard

Dashboard aplikacji MyPerformance zbudowany na Next.js (App Router).

## Funkcjonalności

- **Autoryzacja**: Integracja z Auth.js (NextAuth) i Keycloak
- **Role-Based Access Control**: Widoczność komponentów zależna od ról `app_user`, `manage_users`, `directus_access`
- **Dashboard**: Wykresy wydajności i postępu zadań (Recharts)
- **Styling**: Tailwind CSS z ciemnym motywem
- **Ikony**: Lucide React

## Wymagania środowiskowe

Skopiuj `.env.example` do `.env` i uzupełnij zmienne:

```bash
cp .env.example .env
```

Zmienne środowiskowe:
- `NEXTAUTH_URL` - URL aplikacji (np. http://localhost:3000)
- `NEXTAUTH_SECRET` - Sekret dla NextAuth (wygeneruj bezpieczny klucz)
- `KEYCLOAK_URL` - Bazowy URL Keycloak (np. http://localhost:8080)
- `KEYCLOAK_REALM` - Nazwa realm (opcjonalnie; domyślnie `MyPerformance`)
- `KEYCLOAK_ISSUER` - Pełny issuer (opcjonalnie, np. http://localhost:8080/realms/MyPerformance)
- `KEYCLOAK_CLIENT_ID` - Client ID z Keycloak
- `KEYCLOAK_CLIENT_SECRET` - Client Secret z Keycloak

## Instalacja

```bash
npm ci
```

Do zbudowania motywu Keycloak przez `Keycloakify` wymagany jest lokalnie Apache Maven.

## Uruchomienie lokalne

```bash
npm run dev
```

Aplikacja będzie dostępna na `http://localhost:3000`

Budowanie motywu logowania Keycloak:

```bash
npm run build-keycloak-theme
```

Podgląd samego motywu w Vite:

```bash
npm run dev:keycloak-theme
```

## Budowanie

```bash
npm run build
```

## Docker

Obraz zoptymalizowany pod Coolify z wykorzystaniem multi-stage build:

Uwaga: przed importem `infrastructure/keycloak/realm.json` ustaw docelowe wartości placeholderów (np. `REPLACE_WITH_CLIENT_SECRET`, `${APP_URL}`, `${GOOGLE_IDP_CLIENT_ID}`) zgodnie z Twoim środowiskiem.

```bash
docker build -t myperformance-dashboard .
docker run -p 3000:3000 --env-file .env myperformance-dashboard
```

## Struktura projektu

```
├── app/
│   ├── api/auth/[...nextauth]/  - API route dla NextAuth
│   ├── auth.ts                  - Konfiguracja Auth.js z Keycloak
│   ├── dashboard/               - Strona główna dashboardu
│   ├── login/                   - Strona logowania
│   ├── layout.tsx               - Root layout
│   ├── page.tsx                 - Redirect do dashboardu
│   └── globals.css              - Globalne style
├── components/
│   ├── RoleGuard.tsx            - Komponent do sprawdzania ról
│   ├── AdminPanel.tsx           - Panel administratora
│   ├── ManagerPanel.tsx         - Panel menedżera
│   ├── UserPanel.tsx            - Panel użytkownika
│   ├── PerformanceChart.tsx     - Wykres wydajności
│   └── TasksChart.tsx           - Wykres postępu zadań
├── lib/
│   └── utils.ts                 - Funkcje utility (cn)
├── types/
│   └── next-auth.d.ts           - Rozszerzenie typów NextAuth
├── Dockerfile                   - Konfiguracja Docker
├── next.config.js               - Konfiguracja Next.js
├── tailwind.config.ts           - Konfiguracja Tailwind
└── tsconfig.json                - Konfiguracja TypeScript
```

## Role w Keycloak

Aplikacja oczekuje ról w tokenie JWT:
- `app_user` - Domyślny dostęp do dashboardu dla zalogowanych użytkowników
- `manage_users` - Dostęp do sekcji `Użytkownicy` i zarządzania kontami w realmie Keycloak
- `directus_access` - Widoczność i dostęp SSO do Directus CMS

Role są pobierane z `realm_access.roles` oraz `resource_access.[CLIENT_ID].roles` w tokenie Keycloak.

Lokalny `docker-compose.dev.yml` montuje wygenerowany katalog `build_keycloak/theme` do kontenera Keycloak. Po zmianach w motywie uruchom ponownie `npm run build-keycloak-theme`, a następnie odśwież lub zrestartuj usługę `keycloak`.

## Wdrożenie Keycloak / theme na produkcję

Instrukcja krok po kroku (build JAR-a, deploy do `/opt/keycloak/providers/`, migracja ról, aktywacja `loginTheme=myperformance`, runbook dla błędu Directusa `User belongs to a different auth provider`) znajduje się w [`infrastructure/keycloak/DEPLOYMENT.md`](infrastructure/keycloak/DEPLOYMENT.md).
