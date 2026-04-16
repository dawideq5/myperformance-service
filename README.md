# MyPerformance Dashboard

Dashboard aplikacji MyPerformance zbudowany na Next.js (App Router).

## Funkcjonalności

- **Autoryzacja**: Integracja z Auth.js (NextAuth) i Keycloak
- **Role-Based Access Control**: Widoczność komponentów zależna od ról (admin, manager, user)
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

## Uruchomienie lokalne

```bash
npm run dev
```

Aplikacja będzie dostępna na `http://localhost:3000`

## Budowanie

```bash
npm run build
```

## Docker

Obraz zoptymalizowany pod Coolify z wykorzystaniem multi-stage build:

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
│   ├── role-check.ts            - Funkcje pomocnicze do sprawdzania ról
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
- `admin` - Pełny dostęp do panelu administratora
- `manager` - Dostęp do panelu menedżera
- `user` - Dostęp do panelu użytkownika

Role są pobierane z `realm_access.roles` oraz `resource_access.[CLIENT_ID].roles` w tokenie Keycloak.
