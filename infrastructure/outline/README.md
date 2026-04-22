# Outline — knowledge.myperformance.pl

Wewnętrzna wiki zespołu: procedury, zasady, how-to. SSO przez Keycloak — tylko
zalogowani użytkownicy MyPerformance mają dostęp (rola `knowledge_user`
jest domyślna — każdy uwierzytelniony dostaje ją automatycznie).

**Coolify service:** `outline` (UUID `o4roacrk9qxh08gwv37iphd1`)
**Domena:** `https://knowledge.myperformance.pl`
**Obraz:** `outlinewiki/outline:latest` + `postgres:16-alpine` + `redis:7-alpine`
**Klient KC:** `outline` (confidential, redirect `/auth/oidc.callback`)
**Role realm:** `knowledge_user` (default), `knowledge_admin` (non-default)

## Status

- [x] Compose w repo (`docker-compose.yml` obok)
- [x] Coolify service utworzony przez API
- [x] Env vars ustawione (OUTLINE_DB_PASSWORD, OUTLINE_SECRET_KEY,
      OUTLINE_UTILS_SECRET, OUTLINE_OIDC_CLIENT_SECRET — wszystko losowe,
      seeded przez skrypt)
- [x] KC klient `outline` utworzony (secret zapisany w envs Coolify)
- [x] KC role + dashboard tile (gate `knowledge_user`)
- [ ] **FQDN `knowledge.myperformance.pl` ustawiony w Coolify UI** (na
      kontenerze `outline`, port 3000) — API nie obsługuje service-nested FQDN
- [ ] Pierwszy deploy (z UI)
- [ ] Utworzenie team-space i pierwszych kolekcji (Procedury, Zasady, How-to)

## Post-deploy

1. Coolify UI → Projects → myperformance → outline service → kontener
   `outline` → Domains → `https://knowledge.myperformance.pl:3000`. Save.
2. Deploy. Pierwszy boot ~60 s (migracje).
3. Otwórz `https://knowledge.myperformance.pl`. Kliknij "Log in with
   MyPerformance SSO" → redirect do Keycloak → zaloguj się. Outline
   utworzy pierwszego użytkownika jako workspace admin.
4. Utwórz kolekcje: Procedury, Zasady, How-to, Onboarding.
5. Admin workspace → członkowie logują się przez SSO — każdy z rolą
   `knowledge_user` (czyli każdy user) wchodzi automatycznie jako member.

## Zmiana ról

Domyślnie `knowledge_user` = read/write (member). `knowledge_admin` = admin
workspace. Mapowanie ról Outline ustawia się w Outline → Settings → Groups
+ workspace members (nie ma natywnego OIDC role-mapping w Outline). Do
elevate'owania użytkownika na `admin` workspace — zrobisz to ręcznie w UI
Outline. Outline nie czyta claimu `roles` z Keycloak — gating dzieje się
po stronie dashboardu (kafelek widoczny dla `knowledge_user`).
