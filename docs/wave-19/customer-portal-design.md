# Wave 19 — Customer Portal `zlecenieserwisowe.pl` — Design Specification

**Status:** Phase 2 — DESIGNER (specification only, no implementation).
**Author:** Claude Code (Wave 19 / Phase 2 / 2026-05-02).
**Implementation phases:** see §9. This doc is the source of truth for the builder.

---

## 0. Executive summary

`zlecenieserwisowe.pl` is the customer-facing repair-tracking portal for Caseownia's phone-service business. It must feel like a Linear/Stripe/Apple-grade product — **bright, monochromatic, monumental typography, restrained motion** — while exposing four flows: (1) public status check via email + OTP, (2) optional account self-registration, (3) real-time chat with the service location, (4) authenticated dashboard with full service history.

The portal is **isolated from the employee stack**: separate Keycloak realm (`klienci`), separate domain, separate Coolify app. It re-uses backend primitives (services table, status meta, mail/SMTP profiles) but never exposes employee endpoints.

Aspiration: when a customer opens this portal on their phone after dropping off a device, they should feel that the shop they trusted is **technically credible** — same level of polish as Apple's Repair Status, with a Polish-language warmth that big-brand portals lack.

---

## 1. Brand identity

### 1.1 Color palette (light theme)

The Caseownia logo is **monochromatic black on white** with a fine wireframe phone glyph. We respect that — the portal is **a black-and-white system with a single accent color** for action and a small semantic palette.

| Token            | Hex       | Usage                                                                         |
| ---------------- | --------- | ----------------------------------------------------------------------------- |
| `--bg`           | `#FFFFFF` | Page background                                                               |
| `--bg-subtle`    | `#FAFAFA` | Card backgrounds, alternating rows                                            |
| `--bg-muted`     | `#F0F0F0` | Skeleton, inactive states (matches `BG_LIGHT` in `lib/receipt-pdf.ts`)        |
| `--border`       | `#E5E5E5` | Hairline borders                                                              |
| `--border-strong`| `#D4D4D4` | Hover/focus borders                                                           |
| `--text`         | `#1A1A1A` | Body text (matches `TEXT` in receipt PDF — color identity continuity)         |
| `--text-muted`   | `#666666` | Secondary text (matches `MUTED` in receipt PDF)                               |
| `--text-light`   | `#AAAAAA` | Tertiary, placeholder (matches `LIGHT` in receipt PDF)                        |
| `--accent`       | `#0A0A0A` | Primary CTAs (deep black — Caseownia logo color)                              |
| `--accent-hover` | `#1F1F1F` | CTA hover                                                                     |
| `--accent-fg`    | `#FFFFFF` | Text on accent                                                                |
| `--focus-ring`   | `#1A1A1A` | A11y focus outline                                                            |

**Semantic colors** (status badges, banners — kept LOW saturation so they don't break the mono mood):

| Token         | Hex       | Use                                                |
| ------------- | --------- | -------------------------------------------------- |
| `--info`      | `#2563EB` | "W diagnostyce", "W naprawie", "Testy końcowe"     |
| `--info-bg`   | `#EFF6FF` | Info chip bg                                       |
| `--success`   | `#059669` | "Gotowe do odbioru", "Wydane"                      |
| `--success-bg`| `#ECFDF5` |                                                    |
| `--warning`   | `#D97706` | "Oczekuje akceptacji wyceny", "Czeka na części"    |
| `--warning-bg`| `#FFFBEB` |                                                    |
| `--danger`    | `#DC2626` | "Odrzucone przez klienta", error toasts            |
| `--danger-bg` | `#FEF2F2` |                                                    |
| `--neutral`   | `#525252` | "Przyjęte", "Wstrzymane", default                  |
| `--neutral-bg`| `#F5F5F5` |                                                    |

These map 1:1 to `STATUS_META.tone` from `panels/serwisant/lib/serwisant/status-meta.ts` (`neutral` / `info` / `warning` / `success` / `danger` / `muted`) — single mapping helper `toneToCustomerColors(tone)` will live in `app-customer-portal/lib/status.ts`.

### 1.2 Typography

The receipt PDF uses **Roboto** (Regular + Bold). For perfect document-to-portal continuity (a customer who got a printed protocol should feel he's looking at the same brand on the web), the body font is **Roboto**.

For display headlines we add a more characterful neo-grotesk to match the Caseownia logo's geometric, slightly extended feel:

| Role     | Family               | Weights         | Source                    |
| -------- | -------------------- | --------------- | ------------------------- |
| Display  | **Geist** (Vercel)   | 400, 500, 700   | `next/font/google` self-host |
| Body     | **Roboto**           | 400, 500, 700   | self-host from `public/fonts` |
| Mono     | **Geist Mono**       | 400, 500        | `next/font/google`        |

Rationale: Geist mirrors Linear/Vercel's "expensive without ostentatious" vibe; Roboto keeps continuity with Caseownia's PDFs. Mono is for ticket numbers, IMEI, codes — they need column alignment.

**Type scale** (mobile → desktop, fluid):
- `display-xl` 56–88px / 1.05 / -0.02em — hero-only
- `display-lg` 40–56px / 1.1 / -0.02em — section heroes
- `h1`       28–40px / 1.15 / -0.01em
- `h2`       22–28px / 1.2
- `h3`       18–22px / 1.3
- `body-lg`  17px / 1.6
- `body`     15px / 1.55
- `body-sm`  13px / 1.5
- `mono`     14px / 1.4 (ticket numbers)
- `caption`  12px / 1.4 (uppercase labels, tracking 0.06em)

### 1.3 Logo placement & spacing

- Header: `serwis-by-caseownia.png` left-aligned, height **28px** desktop / **22px** mobile, `padding-y: 20px`. Click → `/`.
- Footer: same logo, height **24px**, plus tagline "Serwis telefonów by Caseownia" as `caption`.
- Email templates: header logo height **40px**, centered, white background.
- Favicon: extract just the wireframe-phone glyph from `caseownia.jpeg` → 32×32 SVG (TODO: builder phase 1).
- **Minimum clear space** around logo: 1× cap-height of the wordmark.
- Never colorize the logo — always pure black `#0A0A0A` on white.

### 1.4 Voice & tone (Polish)

Direct, friendly, factual. Drop corporate fluff. The bar: how Apple Polska writes ("Sprawdź status", not "Pragniemy poinformować").

**Do** — examples:
- "Twoje zlecenie czeka na diagnozę. Zwykle zajmuje to 1–2 dni robocze."
- "Wycena gotowa. Zaakceptuj, żeby ruszyć z naprawą."
- "Wpisz kod 6-cyfrowy, który wysłaliśmy na adres `email@example.com`."

**Don't**:
- "Uprzejmie informujemy, iż Państwa zlecenie..."
- "W związku z powyższym..."
- Emoji, exclamation marks, all-caps in body copy.

**Tone tokens** (use in copywriter brief):
- *Confident*: state facts, no hedging.
- *Calm*: do not alarm — "Naprawa potrwa dłużej" beats "UWAGA — opóźnienie!".
- *Inclusive*: forms of address — `Twoje` / `Ty` (informal *ty*) is the default, **NOT** `Państwa`. Caseownia is a local repair shop, not a bank.

---

## 2. Site map

```
/                         Landing — hero + features + CTA
/status                   Public — start status check (email form)
/status/verify            Public — OTP entry
/status/results           Public — results (server-rendered with short-lived signed cookie)
/auth/login               Login (email → OTP, identical UX to /status but creates session)
/auth/register            Optional registration during OTP flow
/auth/callback            Keycloak OIDC callback
/dashboard                Authenticated home — KPI cards + recent services
/dashboard/services       Authenticated — full list with filters
/dashboard/services/[id]  Authenticated — service detail
/dashboard/profile        Authenticated — name, phone, email, password (delegated to KC), notif prefs
/help                     FAQ + contact form
/regulations              Terms (embeds REGULATIONS_TEXT from receipt-pdf.ts) + privacy
/api/customer-portal/*    BFF endpoints (see §7)
```

Robots: `/`, `/status`, `/help`, `/regulations` indexable; everything else `noindex`.

---

## 3. Pages

Each page has: ASCII mockup, components, animations, states, a11y.

### 3.1 `/` Landing

#### Desktop mockup (≥1280px)
```
┌──────────────────────────────────────────────────────────────────────┐
│  [serwis-by-caseownia logo]                Status   Pomoc   Zaloguj  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│      Naprawa, którą widzisz                                          │
│      jak tylko coś się dzieje.        ┌────────────────────┐         │
│                                       │                    │         │
│      Sprawdź status zlecenia          │   [3D PHONE        │         │
│      online — bez logowania,          │    rotating]       │         │
│      bez konta. Tylko email i kod.    │                    │         │
│                                       │   particles drift  │         │
│      [ Sprawdź status ]  [ Zaloguj ]  │                    │         │
│                                       └────────────────────┘         │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│   [scroll-pinned section: phone scrolls through stages]              │
│                                                                      │
│   01  Przyjęcie       ──●─────                                       │
│   02  Diagnoza        ──●○────                                       │
│   03  Wycena          ────●──                                        │
│   04  Naprawa         ─────●─                                        │
│   05  Testy + odbiór  ──────●                                        │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│   3 powody, dla których to działa:                                   │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐                             │
│   │ Bez konta │ │ Live chat│ │ Dokumenty│                            │
│   │ Email+OTP │ │ z punktem│ │ aneksy,  │                            │
│   │ wystarczy │ │ serwisu  │ │ podpisy  │                            │
│   └──────────┘ └──────────┘ └──────────┘                             │
├──────────────────────────────────────────────────────────────────────┤
│   FAQ accordion                                                      │
├──────────────────────────────────────────────────────────────────────┤
│   Footer: logo · adresy punktów · regulamin · polityka prywatności   │
└──────────────────────────────────────────────────────────────────────┘
```

#### Mobile mockup (≤640px)
```
┌────────────────────┐
│ [logo]      [☰]    │
├────────────────────┤
│ Naprawa, którą     │
│ widzisz jak tylko  │
│ coś się dzieje.    │
│                    │
│  ╭──────────────╮  │
│  │ [3D PHONE]   │  │
│  ╰──────────────╯  │
│                    │
│ [Sprawdź status]   │
│ [Zaloguj]          │
├────────────────────┤
│ stages stacked ▼   │
│ 01 Przyjęcie       │
│ 02 Diagnoza        │
│ ...                │
├────────────────────┤
│ 3 cards stacked    │
├────────────────────┤
│ FAQ                │
└────────────────────┘
```

#### Components used
`Header`, `HeroR3F` (Three.js), `Button`, `ScrollPinnedStages`, `FeatureCard` (×3), `Accordion` (FAQ), `Footer`.

#### Animations
- **Three.js (`HeroR3F`)** — see §4.1.
- **GSAP scroll-pinned stages** — see §4.2.
- **Hero text reveal** — GSAP timeline on mount: `display-xl` lines do `clipPath: inset(0 100% 0 0) → inset(0 0 0 0)` stagger 0.08s, ease `power3.out`, total 0.9s. Respects `prefers-reduced-motion`.
- **Feature cards** — `IntersectionObserver` reveal: `opacity 0 → 1`, `translateY 24px → 0`, stagger 0.1s. Pure CSS where possible (`@starting-style` + `transition`), fallback to GSAP.
- **Header** — sticky, becomes opaque white with `border-bottom: 1px solid var(--border)` after `scrollY > 8px`.

#### States
- **Loading** (3D model not yet loaded): show static SVG placeholder of phone outline (extracted from logo) — no flash of empty space. Three.js fades in over 400ms once `useGLTF` resolves.
- **Reduced motion**: replace 3D scene with hero photograph (static), drop pinned-scroll, keep all content but as plain stacked sections.
- **No WebGL** (detected by feature test): static fallback identical to reduced-motion.
- **Slow network** (`navigator.connection.effectiveType === 'slow-2g'|'2g'`): same fallback as reduced-motion. Build a `<MotionGate>` wrapper component.

#### A11y
- Hero `<h1>` is the actual page title (no `<div>` styled as h1).
- 3D scene has `aria-hidden="true"` and `<canvas>` is wrapped with descriptive alt-text via `<div role="img" aria-label="Trójwymiarowy model telefonu obracający się powoli">`.
- Two CTAs are real `<a>` elements (`href`), not buttons.
- Focus-visible ring everywhere (`:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px }`).
- All animations honour `prefers-reduced-motion: reduce`.

### 3.2 `/status` (public — email entry)

#### Mockup
```
┌──────────────────────────────────────────────────────────────────────┐
│ [logo]                                                  [Zaloguj]    │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│       Sprawdź status zlecenia                                        │
│                                                                      │
│       Wpisz email użyty przy rejestracji urządzenia.                 │
│       Wyślemy 6-cyfrowy kod jednorazowy (ważny 10 minut).            │
│                                                                      │
│       ┌────────────────────────────────────┐                         │
│       │ email@example.com                  │                         │
│       └────────────────────────────────────┘                         │
│                                                                      │
│       Numer zlecenia (opcjonalnie)                                   │
│       ┌────────────────────────────────────┐                         │
│       │ ZS-2026-XXXX                       │                         │
│       └────────────────────────────────────┘                         │
│                                                                      │
│       [ Wyślij kod ]    Masz konto? Zaloguj się →                    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

#### Components
`Input`, `Button`, `Form` (RHF + Zod schema), `InfoNote`.

#### Animations
- Form card slides in: `translateY 20px → 0`, `opacity 0 → 1`, 350ms cubic-bezier(0.32, 0.72, 0, 1).
- Submit button morph: width collapses from `auto → 48px` while loading, replaced by spinner. Reverts on response.

#### States
- **Idle**: as shown.
- **Loading**: button spinner, all inputs `aria-busy`, `disabled`.
- **Error** (rate-limit, invalid email): inline `<div role="alert">` red text under field, no toast.
- **Success**: redirect to `/status/verify?token=<short-lived-state-token>`.

#### Validation
Zod: `email` required, RFC 5322; `ticketNumber` optional, regex `/^ZS-\d{4}-[A-Z0-9]{4,8}$/i`.

#### A11y
- `<label>` always visible (no float-label tricks). 
- Error text linked via `aria-describedby` to input.
- Submit on `Enter` works, focus moves to first invalid field on error.

### 3.3 `/status/verify` (public — OTP entry)

#### Mockup
```
┌──────────────────────────────────────────────────────────────────────┐
│       Wpisz kod                                                      │
│       Wysłaliśmy 6 cyfr na  k***@gmail.com                           │
│                                                                      │
│       ┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐                                        │
│       │ │ │ │ │ │ │ │ │ │ │ │     auto-advance                       │
│       └─┘ └─┘ └─┘ └─┘ └─┘ └─┘                                        │
│                                                                      │
│       Nie dostałeś? Wyślij ponownie (60s)                            │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

#### Components
`OtpInput` (6 segmented digit boxes; one hidden `<input inputmode="numeric" autocomplete="one-time-code">` for paste / iOS SMS autofill).

#### Animations
- Digit fill: each digit "pops" — `scale 0.9 → 1` over 120ms when filled.
- On submit success: card slides up + fades + replaced by results page (Next.js `router.push` with view-transition API).
- On error (wrong code): boxes shake (`translateX +4 -4 +4 -4 0`, 280ms, `ease.out`), all six clear, focus to first box.

#### States
- **Idle**, **Loading** (spinner under boxes), **Error** (shake + message), **Success** (transition).
- **Resend cooldown**: counts down 60s before re-enabling.

#### A11y
- `aria-label="Cyfra 1 z 6"` etc.
- Backspace moves to previous box even when current empty.
- Paste fills all 6 from clipboard.

### 3.4 `/status/results` (public — services for that email)

#### Mockup (desktop)
```
┌──────────────────────────────────────────────────────────────────────┐
│  Cześć! Znaleźliśmy 2 zlecenia powiązane z tym adresem.              │
│                                                                      │
│  Sesja wygaśnie za 23h 58min — potem trzeba zalogować ponownie.      │
│  [Załóż konto, żeby mieć trwały dostęp →]                            │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │ ZS-2026-AB12   iPhone 14 Pro 256GB Czarny                   │     │
│  │                                                             │     │
│  │  ●━━━●━━━●━━○─────○─────○                                    │     │
│  │  Przyj  Diag  Wyc   Napr   Test   Odbiór                    │     │
│  │                                                             │     │
│  │  Aktualnie: W diagnostyce · zmiana 2h temu                  │     │
│  │  [Szczegóły →]                                              │     │
│  └─────────────────────────────────────────────────────────────┘     │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │ ZS-2026-CD34   Samsung S24 Ultra (...)                      │     │
│  │  ●━━━●━━━●━━━●━━━●━━━●  Wydane                                │     │
│  │  [Szczegóły] [Pobierz fakturę]                              │     │
│  └─────────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────┘
```

#### Components
`ResultsHeader`, `ServiceCard`, `Stepper` (animated GSAP), `StatusChip`, `Button`, `EmptyState` (when 0 results).

#### Animations
- Cards stagger in: 80ms apart, `translateY 16px → 0`, `opacity 0 → 1`.
- Stepper draws: SVG `<path>` with `stroke-dasharray` animated over 800ms left-to-right; each filled node pops in (scale 0 → 1, 200ms, stagger 100ms).
- Live updates (when revisiting): if status changed since last view, the stepper segment that advanced **pulses** (box-shadow expand + fade) once.

#### States
- **Empty** (0 services for this email): "Nie znaleźliśmy zleceń. Sprawdź pisownię adresu lub [zadzwoń do nas](/help)."
- **Single result**: skip list, render detail directly.
- **Many** (>10): paginate 10/page; sort by `updated_at desc`.

#### Session
Cookie `customer_otp_session` — HttpOnly, Secure, SameSite=Lax, 24h, signed JWT containing `email`, `iat`, `exp`. Refreshing /status/results re-validates JWT; on expiry → /status.

#### A11y
- Each card is a `<a>` to detail; `<article>` semantics.
- Stepper has `<ol aria-label="Postęp naprawy">` with each step as `<li aria-current="step">` for the active one.

### 3.5 `/auth/login` & `/auth/register`

Same UX as `/status` BUT redirects to KC OIDC after OTP for password-less sign-in:

1. User enters email at `/auth/login`.
2. Email submitted → backend triggers KC's "Email OTP" required action OR custom email-OTP flow (see §8).
3. KC sends OTP, user enters at `/auth/verify`.
4. KC issues access+id tokens → portal sets session cookie via `next-auth` (Keycloak provider).
5. First-time users: KC's required action `UPDATE_PROFILE` (firstName, lastName, phone) — rendered in custom KC theme so it visually matches the portal.

**Register** is just `/auth/login` with `prompt=create` query param — KC hosts the registration form (also themed).

### 3.6 `/dashboard` (authenticated home)

#### Mockup (desktop ≥1024px)
```
┌──────────────────────────────────────────────────────────────────────┐
│ [logo]    Moje zlecenia  Historia  Profil  Pomoc      Anna Kowalska ▾│
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Cześć, Anna 👋                                                       │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │   2      │  │   1      │  │   0      │  │   5      │              │
│  │ Aktywne  │  │ Czeka na │  │ Gotowe   │  │ Zakończ. │              │
│  │          │  │ akceptac.│  │ do odbiór│  │          │              │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘              │
│                                                                      │
│  Ostatnia aktywność                                                  │
│  ─────────────────────────────────────────────────                   │
│  • 2h temu — ZS-2026-AB12 zmieniono status na "W diagnostyce"        │
│  • wczoraj — ZS-2026-AB12 dodano notatkę technika                    │
│  • 3 dni temu — ZS-2026-CD34 wydane                                  │
│                                                                      │
│  [Zobacz wszystkie zlecenia →]                                       │
└──────────────────────────────────────────────────────────────────────┘
```

#### Mobile: nav becomes hamburger drawer; KPI cards stack 2×2.

#### Components
`SidebarNav` (desktop), `MobileNav`, `KpiCard` (×4), `ActivityList`, `Avatar` w/ menu.

#### Animations
- KPI numbers count up from 0 → value over 800ms `ease.out` (GSAP `to({ val }, ...)` updating textContent).
- Activity list items fade-in stagger 60ms.

#### Empty
"Jeszcze nie masz zleceń. Złoż urządzenie w jednym z naszych punktów [Mapa punktów →]".

### 3.7 `/dashboard/services/[id]` (service detail)

#### Mockup (desktop, 2-column ≥1100px)
```
┌──────────────────────────────────────────────────────────────────────┐
│ ← Wszystkie zlecenia                                                 │
│                                                                      │
│  ZS-2026-AB12                                  [W diagnostyce] chip  │
│  iPhone 14 Pro · 256GB · Czarny · IMEI 35...    przyjęte 30.04.2026  │
│  ───────────────────────────────────────────────────────────         │
│                                                                      │
│  ┌──── LEWA KOLUMNA ────────────────┐  ┌── PRAWA KOL. ────────┐      │
│  │                                  │  │                      │      │
│  │  Postęp                          │  │ [3D mini phone       │      │
│  │  ●━━━●━━━○─────○─────○           │  │  preview rotating]   │      │
│  │  Przyj Diag Wyc Napr Test        │  │                      │      │
│  │                                  │  │  Stan wizualny:      │      │
│  │  Historia (timeline)             │  │  Wyświetlacz 8/10    │      │
│  │  ┌──────────────────────────┐    │  │  Tył         9/10    │      │
│  │  │ ● Przyjęte 30.04 14:22   │    │  │  Aparat      10/10   │      │
│  │  │   Pracownik: Tomasz K.   │    │  │  Ramki        7/10   │      │
│  │  │ ● Rozpoczęto diagnostykę │    │  │                      │      │
│  │  │   01.05 09:10            │    │  │  Akcesoria:          │      │
│  │  │ ○ Oczekuje wyceny        │    │  │  – ładowarka         │      │
│  │  └──────────────────────────┘    │  │  – etui silikonowe   │      │
│  │                                  │  └──────────────────────┘      │
│  │  Wycena (gdy gotowa):            │                                │
│  │  ┌──────────────────────────┐    │                                │
│  │  │ Wymiana wyświetlacza 850 │    │                                │
│  │  │ Wymiana baterii      180 │    │                                │
│  │  │ Razem:              1030 │    │                                │
│  │  │ [Akceptuję]  [Odrzucam]  │    │                                │
│  │  └──────────────────────────┘    │                                │
│  │                                  │                                │
│  │  Dokumenty                       │                                │
│  │  – Protokół przyjęcia (PDF)      │                                │
│  │  – Aneks #1 — wymagany podpis    │                                │
│  │    [Podpisz przez Documenso →]   │                                │
│  │                                  │                                │
│  │  Wiadomości od serwisanta        │                                │
│  │  – "Bateria poniżej 65% — pole-  │                                │
│  │     camy wymianę przy okazji."   │                                │
│  │                                  │                                │
│  │  [Otwórz czat z punktem]         │                                │
│  └──────────────────────────────────┘                                │
└──────────────────────────────────────────────────────────────────────┘
```

#### Mobile: single column, 3D preview becomes inline collapsible above timeline.

#### Components
`ServiceHeader` (ticket + chip), `Stepper`, `Timeline`, `RatingGrid`, `QuotePanel`, `DocumentList`, `MessageList`, `ChatLauncher`, `MiniR3F` (Three.js, smaller).

#### Animations
- Stepper draws on mount (same as results page).
- 3D mini-phone idles slowly rotating; on hover scales 1.04. The phone's screen color/glow shifts according to status (blue glow during "diagnosing", green during "ready", etc.) — see §4.1.
- Quote panel **slide-in from right** when status enters `awaiting_quote` (using SSE/poll).

#### Real-time updates
- Page subscribes to `GET /api/customer-portal/services/[id]/stream` (SSE, see §7).
- On status change: chip morphs, stepper advances with pulse animation, toast appears top-right "Status zaktualizowany: W naprawie".

#### Documents
- "Pobierz protokół" → calls `/api/customer-portal/services/[id]/documents/receipt.pdf` (BFF re-proxy with auth).
- Aneksy: list of `service_annexes` filtered by status `pending_signature` for this customer's email; click → opens Documenso embedded signing page in modal (Documenso supports `embed` mode).

#### A11y
- Stepper as `<ol>` with `aria-current="step"`.
- "Akceptuję wycenę" is a real form `<button type="submit">`; on success → `aria-live="polite"` announcement.

### 3.8 `/help`, `/regulations`

`/help` — FAQ accordion (8–12 questions seeded by Caseownia copywriter), contact form (name, email, message → goes to Chatwoot conversation), list of physical service points with map (static map iframe; click point → opens directions in OSM/Google).

`/regulations` — embeds `REGULATIONS_TEXT` from `lib/receipt-pdf.ts`. Single source of truth: regulations live in code, page renders.

---

## 4. Animations — technical detail

### 4.1 Three.js (`HeroR3F`, `MiniR3F`)

**Stack**: `three@0.160+`, `@react-three/fiber@8`, `@react-three/drei@9`, `gsap@3.12+`, `@gsap/react`.

**Phone model**:
- Source: a free Blender phone (e.g., `iphone-14.glb`) — hire designer or use CC0 from Sketchfab.
- Optimized: < 800KB after `gltf-pipeline -d --draco.compressionLevel=10`.
- Loaded via `useGLTF('/models/phone.glb')` with `<Suspense>` fallback.

**Scene** (`HeroR3F`):
```ts
// pseudo
<Canvas
  dpr={[1, 2]}
  gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
  camera={{ position: [0, 0, 4], fov: 35 }}
>
  <ambientLight intensity={0.4} />
  <directionalLight position={[2, 4, 3]} intensity={1.2} />
  <Environment preset="studio" />          // soft reflections on glass
  <Phone ref={phoneRef} />                  // <primitive object={gltf.scene} />
  <Particles count={60} />                   // <Points> instanced, drift y+
  <ContactShadows opacity={0.3} blur={2.5} />
</Canvas>
```

**Animation loop**:
- `useFrame((state, delta) => { phone.rotation.y += delta * 0.15 })` — slow idle rotation.
- GSAP ScrollTrigger drives `phone.rotation.x` and `phone.position.z` on scroll (camera-pull-back through stages).
- Screen color: `<meshStandardMaterial emissive={statusGlowColor} emissiveIntensity={0.6} />` — material referenced via `useRef` and tweened with GSAP when status prop changes.

**Performance**:
- `<Canvas frameloop="demand" />` for `MiniR3F` — re-render only when interacted.
- LOD via `<Detailed distances={[0, 4, 8]}>` — high mesh up close, low mesh from afar.
- Disable shadows on mobile (`isMobile ? null : <ContactShadows />`).
- Pause loop when offscreen using `IntersectionObserver` + `frameloop` toggle.
- Hard cap: 60fps on iPhone 12-class device. If FPS < 30 for 2 seconds, swap to static image.

### 4.2 GSAP scroll-pinned stages (landing)

```js
gsap.registerPlugin(ScrollTrigger);

const tl = gsap.timeline({
  scrollTrigger: {
    trigger: '.stages-section',
    start: 'top top',
    end: '+=400%',          // 4× viewport scroll required
    scrub: 1,                // 1s ease-in to scrubbed value
    pin: true,
    anticipatePin: 1,
  },
});

// camera dolly
tl.to(phoneRef.current.position, { z: 1.5, ease: 'none' }, 0)
  .to(phoneRef.current.rotation, { y: Math.PI * 2, ease: 'none' }, 0);

// stages reveal
['#stage-1', '#stage-2', '#stage-3', '#stage-4', '#stage-5'].forEach((sel, i) => {
  tl.fromTo(sel, { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.4 }, i * 0.8);
  if (i > 0) tl.to(`#stage-${i}`, { opacity: 0.3, duration: 0.2 }, (i + 1) * 0.8);
});
```

`ScrollSmoother` is **NOT** used — modern browsers' native scroll is good enough on Mac/iOS, and ScrollSmoother on Windows often janks. We rely on browser-native `scroll-behavior: smooth` + ScrollTrigger.

### 4.3 Native scroll-driven animations (where supported)

Modern Safari + Chrome (>=120) support `animation-timeline: scroll()`. Use for **decorative parallax** layers:

```css
@supports (animation-timeline: scroll()) {
  .parallax-bg {
    animation: parallax 1s linear;
    animation-timeline: scroll(root);
    animation-range: 0% 100%;
  }
  @keyframes parallax {
    to { transform: translateY(-15%); }
  }
}
```

GSAP ScrollTrigger is fallback for unsupported browsers. Decision: **load GSAP only when `CSS.supports('animation-timeline: scroll()')` is false** — saves ~50KB on modern browsers.

### 4.4 Parallax — three layers minimum on landing

| Layer | z-index | Speed factor (translateY per scroll px) |
| ----- | ------- | ---------------------------------------- |
| BG (gradient + noise texture)        | 0   | -0.3 |
| MID (3D scene)                       | 10  | 0    |
| FG (text content + CTAs)             | 20  | -0.6 |

Implementation: each layer is a `position: sticky` container with `animation-timeline: scroll()` driving translateY.

### 4.5 Micro-interactions

- **Button press**: `transform: scale(0.97)` 80ms.
- **Card hover**: `transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.08);` over 200ms.
- **Toast**: slide-in from top-right, dwell 4s, slide out. Pure CSS keyframes, no library.
- **Page transitions**: `view-transition-name` on `<main>` element for browsers that support View Transitions API; fallback: instant.

### 4.6 Reduced motion contract

All of the above is gated on `(prefers-reduced-motion: no-preference)`. When reduced motion is on:
- 3D becomes static image.
- Pinned scroll becomes regular stacked sections.
- Page transitions become instant.
- Stepper draws without animation (pre-filled).
- Number count-ups show final value instantly.

Component: `<Motion>` wrapper exposes `useMotionAllowed(): boolean`. Every animated component reads it.

---

## 5. Component library

Lives in `app-customer-portal/components/ui/`. Naming: PascalCase. Props use `cva` for variants.

| Component        | Variants / props                                                                                  | Notes                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `Button`         | `variant: primary` (black bg/white text) `secondary` (white bg/black border) `ghost` `outline` `danger`; `size: sm` `md` `lg`; `loading` `disabled` `iconLeft` `iconRight` | Compound: `<Button.Icon>` slot. Ref forwarded.                                          |
| `Input`          | `type` `placeholder` `error` `hint` `prefix` `suffix` `disabled`                                  | Always paired with `<label>`. Error → red border + msg.                                |
| `Textarea`       | same as Input + `rows`                                                                            |                                                                                        |
| `Form`           | RHF + Zod adapter. `<Form.Field name>`, `<Form.Error>`.                                           | Composition like Radix UI patterns.                                                    |
| `OtpInput`       | `length=6`, `value`, `onChange`, `onComplete`, `disabled`                                          | Auto-advance, paste-fills-all, backspace-back.                                         |
| `Card`           | `padding: sm/md/lg`, `interactive` (hover lift), `as` (link/article/div)                          |                                                                                        |
| `StatusChip`     | `tone` (1:1 with `STATUS_META.tone`), `icon`, `label`. Tiny variant for inline.                   | Single source: `lib/status.ts` (port from `panels/serwisant/lib/serwisant/status-meta.ts`). |
| `Stepper`        | `steps: Step[]`, `current: index`, `orientation: horizontal/vertical`                             | SVG-rendered for clean dasharray animation. Mobile auto-vertical.                      |
| `Timeline`       | `events: Event[]` with `{ id, ts, label, actor?, body? }`                                         | Vertical bar with dots; collapses long bodies behind "więcej".                         |
| `Toast`          | `variant: info/success/warning/danger`, `duration`, `action?`                                     | Manager: `useToast()` hook returning `toast(...)`.                                     |
| `Modal/Dialog`   | Radix-based; `size: sm/md/lg/full`, `closeOnEscape`                                               | Used for Documenso embed, signature flow.                                              |
| `Accordion`      | `items: { id, q, a }[]`, `allowMultiple`                                                          | FAQ + regulamin sections.                                                              |
| `Hero`           | landing-only. `title`, `subtitle`, `ctaPrimary`, `ctaSecondary`. Slot for `<HeroR3F>`.            |                                                                                        |
| `ServiceCard`    | `service` object, `compact` mode                                                                  | Stepper + chip + ticket + device. Detail page uses expanded variant.                   |
| `KpiCard`        | `label`, `value` (number, animated count-up), `delta?`                                            | Dashboard.                                                                             |
| `ChatLauncher`   | `inboxId`, `userIdentifier`, `userHash`                                                           | Chatwoot widget wrapper. Auto-applies brand CSS overrides.                             |
| `Footer`         | static                                                                                            |                                                                                        |
| `Header`         | `authenticated?` (toggles "Zaloguj" vs avatar menu)                                               | Sticky, responsive nav.                                                                |
| `EmptyState`     | `icon`, `title`, `body`, `action`                                                                 | "Brak zleceń", "Brak wiadomości", etc.                                                 |
| `Skeleton`       | `width`, `height`, `radius`, shimmer                                                              | While SSR not used / loading.                                                          |
| `MotionGate`     | wraps children; renders only if motion allowed AND WebGL present (for 3D)                         |                                                                                        |

All components: TypeScript strict, RSC where possible, "use client" only when stateful/animated.

---

## 6. Tech stack — recommendation

| Concern         | Pick                                                              | Rationale                                                                                |
| --------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Framework       | **Next.js 15** App Router + React 19                              | Same as rest of stack (`myperformance.pl`); enables RSC + server actions for forms.       |
| Language        | TypeScript 5.6, strict mode                                       |                                                                                          |
| Styling         | **Tailwind CSS 4** + a few CSS modules for keyframes              | Tailwind for speed; CSS modules for `@property`, `animation-timeline`, complex keyframes. |
| 3D              | three + @react-three/fiber + @react-three/drei                    |                                                                                          |
| Animation       | **GSAP 3.12** + ScrollTrigger; tiny CSS for micro-interactions    | No Framer Motion (one less dep, GSAP is enough).                                         |
| Icons           | lucide-react                                                      | Already used in serwisant panel — keeps brand coherent.                                  |
| Forms           | react-hook-form + zod                                             | Standard.                                                                                |
| Auth            | next-auth (Auth.js v5) + Keycloak provider                        | Realm `klienci` (see §8).                                                                |
| Data fetching   | **TanStack Query v5** for client widgets; RSC fetch for SSR pages | SSE for real-time service detail.                                                        |
| Chat            | Chatwoot embedded widget (script tag with `inboxId` from server)  | See §3.7.                                                                                |
| Email signing   | Documenso embedded signing (existing `documenso` integration)     |                                                                                          |
| Observability   | Pino logger (already in stack) + `@sentry/nextjs` opt-in           | Errors only — no PII.                                                                    |
| Testing         | Vitest (unit) + Playwright (e2e) — same configs as main repo      |                                                                                          |
| Bundling        | Built-in Next.js Turbopack (Next 15 default)                      |                                                                                          |
| Deploy          | Coolify on the same VPS, separate app, Traefik rule for `zlecenieserwisowe.pl` | Same pattern as other apps in stack.                                                     |

**No use of**: Framer Motion (cut for size), Redux/Zustand (RQ + URL state suffice), Headless UI (Radix is more feature-complete).

---

## 7. Backend / API contract

All routes prefixed `/api/customer-portal/`. Auth strategies are **two-tier**:
- **session-jwt**: from next-auth Keycloak login (cookie `__Secure-next-auth.session-token`).
- **otp-jwt**: from public OTP flow (cookie `customer_otp_session`, 24h, scoped to one email).

Both produce a server-side `CustomerPrincipal { email: string, mode: 'session' | 'otp' }`. Authorization rule: `services.contact_email = principal.email` (case-insensitive). Anything else → 403.

| Method | Path                                                  | Auth        | Body / Query                          | Response                                              | Status      |
| ------ | ----------------------------------------------------- | ----------- | ------------------------------------- | ----------------------------------------------------- | ----------- |
| POST   | `/auth/email-otp`                                     | none        | `{ email, ticket? }`                  | `{ ok: true, expiresAt }`                             | TODO        |
| POST   | `/auth/verify-otp`                                    | none        | `{ email, code }`                     | sets cookie; returns `{ servicesCount }`              | TODO        |
| POST   | `/auth/logout`                                        | any         | —                                     | clears cookie                                         | TODO        |
| GET    | `/services`                                           | any         | `?status=&page=`                      | `{ items: ServiceSummary[], total }`                  | TODO        |
| GET    | `/services/[id]`                                      | any         | —                                     | `ServiceDetail` (without internal notes)              | TODO        |
| GET    | `/services/[id]/stream`                               | any         | SSE                                   | `event: status` `event: message` `event: quote` etc.  | TODO        |
| POST   | `/services/[id]/accept-quote`                         | any         | `{ quoteId, signature? }`             | `{ ok }` — moves status `awaiting_quote → repairing` | TODO        |
| POST   | `/services/[id]/reject-quote`                         | any         | `{ quoteId, reason? }`                | `{ ok }`                                              | TODO        |
| POST   | `/services/[id]/messages`                             | any         | `{ body }`                            | echoes to Chatwoot conversation                       | TODO        |
| GET    | `/services/[id]/documents/[name].pdf`                 | any         | —                                     | binary PDF (re-proxied from internal storage)         | TODO        |
| GET    | `/account`                                            | session-jwt | —                                     | `{ email, firstName, lastName, phone, prefs }`        | TODO        |
| PATCH  | `/account`                                            | session-jwt | `{ firstName?, lastName?, phone?, prefs? }` | updated profile (mirrors to KC + local DB)            | TODO        |
| GET    | `/locations`                                          | none        | —                                     | `{ id, name, address, lat, lng, chatwootInboxId }[]` | TODO        |
| POST   | `/help/contact`                                       | none        | `{ name, email, body }`               | creates Chatwoot conversation in default inbox        | TODO        |

**OTP token generation**: 6 numeric digits, stored hashed (sha256 + per-row salt) in `mp_customer_portal_otps` table with `email`, `code_hash`, `expires_at`, `attempts`. Max 5 attempts, then row is invalidated. Rate limit on `/auth/email-otp`: 3 / 10min / IP+email.

**SSE** (`/services/[id]/stream`):
- Server holds open `Content-Type: text/event-stream`.
- Backend publishes via Redis pub-sub channel `service:{id}:events`.
- Existing `lib/services.ts` mutation paths (status change, message create, quote update) call a publisher. Builder phase 4 wires this in.
- Client retries with exponential backoff on disconnect (max 30s).

---

## 8. Keycloak realm `klienci`

### 8.1 Realm config

| Setting                     | Value                                                                |
| --------------------------- | -------------------------------------------------------------------- |
| Realm name                  | `klienci`                                                            |
| Display name                | "Caseownia — klienci"                                                |
| Display name HTML           | `<strong>Caseownia</strong> klienci`                                 |
| Login theme                 | `zlecenieserwisowe` (custom keycloakify theme, see §8.4)             |
| Account theme               | `zlecenieserwisowe`                                                  |
| Email theme                 | `zlecenieserwisowe`                                                  |
| User registration           | **enabled**                                                          |
| Forgot password             | enabled                                                              |
| Remember me                 | enabled                                                              |
| Verify email                | enabled                                                              |
| Login with email            | enabled                                                              |
| Edit username               | disabled (email IS username)                                         |
| Brute-force protection      | enabled, max-failures=5, lock 15min                                  |
| SSL required                | external requests                                                    |
| Token lifespan              | access 15min, refresh 30 days                                        |
| Session idle                | 24h                                                                  |

### 8.2 Authentication flow

Custom flow `Customer Email OTP`:

```
1. Cookie (skip if SSO already)
2. Identity Provider Redirector — disabled
3. Customer Forms (subflow):
   3a. Username/Email Form (custom — only email, no password)
   3b. Email OTP authenticator (custom SPI OR built-in conditional OTP)
   3c. Required actions: VERIFY_EMAIL, UPDATE_PROFILE on first login
```

Implementation note: KC has no native "magic-link / email-only OTP" out of the box. Two options:
- **(A) Use phasetwo's `Magic Link` extension** (already considered in stack — see `project_email_panel_kc_webhook.md`). Send link with one-time token; user clicks → logged in.
- **(B) Custom Email OTP authenticator** (Java SPI) — generates 6-digit code, sends via Postal SMTP, validates in KC.

Recommendation: **(A) Magic Link** for `/auth/login`, **(B) custom 6-digit OTP** for `/status` (no KC session created — only signed JWT cookie). The 6-digit pattern is more user-friendly for casual status checks; magic link is cleaner for full sign-in.

### 8.3 Client

| Field                   | Value                                                                          |
| ----------------------- | ------------------------------------------------------------------------------ |
| Client ID               | `customer-portal`                                                              |
| Type                    | confidential                                                                   |
| Standard flow           | enabled                                                                        |
| Direct access           | disabled                                                                       |
| Service accounts        | disabled                                                                       |
| Valid redirect URIs     | `https://zlecenieserwisowe.pl/auth/callback`, `https://zlecenieserwisowe.pl/api/auth/callback/keycloak` |
| Web origins             | `https://zlecenieserwisowe.pl`                                                 |
| Default scopes          | `openid email profile`                                                         |

Secret stored in Coolify env `KEYCLOAK_CLIENT_SECRET` of customer-portal app (same propagation pattern as other clients — added to `scripts/keycloak-seed.mjs`).

### 8.4 Theme (`zlecenieserwisowe`)

Built with **Keycloakify v11** (matches existing `build_keycloak/` pipeline). Pages overridden:
- `login.ftl` → branded white layout, just email field + "Wyślij kod" button.
- `register.ftl` → email + first/last name + phone + ToS checkbox.
- `info.ftl` (post-login redirect splash) → branded.
- `email-verification.ftl`, `update-user-profile.ftl`.
- Email templates (`html` + `txt`):
  - `email-verification.html` — uses `DEFAULT_LAYOUT_HTML` from `lib/email-branding.ts`.
  - `magic-link.html` — same layout, single CTA "Zaloguj się".
  - `executeActions.html` — same.

**Critical**: KC theme MUST output the same HTML skeleton as the app's `DEFAULT_LAYOUT_HTML` so brand vars (logo, brand name, footer) propagate identically. See `project_email_unified_layout.md`.

### 8.5 User mapping to internal services

When a customer (email `x@y.com`) logs in:
1. KC issues token with `email` claim.
2. Portal's BFF queries `services WHERE LOWER(contact_email) = LOWER(:email)` to surface their orders.
3. **No employee table touched** — KC realm `klienci` users are entirely separate from `MyPerformance` realm.

Services reference customers by email string only (already true in current schema — `services.contact_email`). No FK to a `customers` table; no need to create one.

---

## 9. Implementation phases

7 phases, each ~2h of agent work, each ends with a green checkpoint.

### Phase 1 — Infrastructure (~2h)

**Deliverable**: domain pointed, Coolify app exists, KC realm exists, empty Next.js app deploys at `https://zlecenieserwisowe.pl`.

Tasks:
1. OVH DNS: confirm `zlecenieserwisowe.pl` A `@` and wildcard already point at `57.128.249.245` (already done 2026-04-29 per memory). Add `CAA` record for Let's Encrypt if missing.
2. Coolify: create app `customer-portal` from this repo, subdir `app-customer-portal/`. Traefik label: `Host('zlecenieserwisowe.pl') || Host('www.zlecenieserwisowe.pl')`.
3. KC: extend `scripts/keycloak-seed.mjs` with realm `klienci` + client `customer-portal`. Run seed. Capture client secret → set `KEYCLOAK_CLIENT_SECRET` env in Coolify.
4. Initialize `app-customer-portal/` with Next.js 15 + Tailwind 4 + TS. `app/page.tsx` placeholder "Hello".
5. Verify: `curl https://zlecenieserwisowe.pl` returns 200, TLS valid, KC realm visible in admin.

**Checkpoint**: HTTP 200, valid cert, KC realm listed.

### Phase 2 — Core layout + theme + landing hero (~2h)

**Deliverable**: branded layout (header/footer), landing page with hero copy + CTA + 3D scene placeholder (static SVG fallback for now).

Tasks:
1. Add fonts (Geist via `next/font`, Roboto self-hosted from `public/fonts/`).
2. CSS tokens (color/typography) in `app/globals.css` as CSS custom properties.
3. `Header`, `Footer`, `Button`, `Card` components.
4. `/` page with hero copy + 3D placeholder + features grid + FAQ accordion (static text).
5. Lighthouse mobile ≥ 90 perf, ≥ 100 a11y, ≥ 100 SEO.

**Checkpoint**: visual review against this spec § 3.1 mockup.

### Phase 3 — Public status + OTP flow (~2h)

**Deliverable**: working `/status` → `/status/verify` → `/status/results` end-to-end with real backend.

Tasks:
1. Create `mp_customer_portal_otps` migration.
2. Implement `POST /auth/email-otp` (rate-limited, sends mail via existing `sendMail({ profileSlug: 'zlecenieserwisowe' })`).
3. Implement `POST /auth/verify-otp` (sets signed JWT cookie).
4. SMTP profile `zlecenieserwisowe` seeded (uses zlecenieserwisowe.pl identity, Postal SMTP).
5. Build `/status`, `/status/verify`, `/status/results` pages with form validation.
6. `GET /services` filtered by `principal.email`.
7. E2E test: enter email → receive mail in Postal — verify code → see services list.

**Checkpoint**: green Playwright test.

### Phase 4 — Dashboard + service detail (~2h)

**Deliverable**: authenticated dashboard with KC SSO + service detail page with timeline, documents, quote acceptance.

Tasks:
1. Wire next-auth Keycloak provider.
2. Build `/dashboard` (KPIs + activity).
3. Build `/dashboard/services/[id]` with all sub-blocks (timeline, quote, documents, messages).
4. `POST /services/[id]/accept-quote` and `reject-quote` endpoints.
5. Documenso embed for aneksy.
6. SSE endpoint `/services/[id]/stream` + Redis pub-sub publisher in existing service mutation paths.

**Checkpoint**: real customer (test KC user) can log in, see services, accept a quote — and serwisant panel shows the acceptance.

### Phase 5 — Animations (Three.js + GSAP) (~2h)

**Deliverable**: Polished motion: hero 3D scene, scroll-pinned stages, stepper draw-in, count-ups, all reduced-motion-safe.

Tasks:
1. Add `three`, `@react-three/fiber`, `@react-three/drei`, `gsap`.
2. Source/optimize phone GLB (~600KB).
3. Build `HeroR3F`, `MiniR3F`, `<MotionGate>`, `<Stepper>` (animated SVG), `<KpiCard>` count-up.
4. Implement scroll-pinned stages timeline.
5. Verify: 60fps on iPhone 12 Safari and on M1 Chrome; static fallback works on reduced-motion.

**Checkpoint**: video recording of all animations on Mac + iPhone.

### Phase 6 — Chat widget integration (~2h)

**Deliverable**: Chatwoot widget loaded with correct inbox per service location, branded.

Tasks:
1. Inboxes per location: each `service_locations` row gets a `chatwoot_inbox_id` column (migration).
2. `GET /api/customer-portal/locations` returns inbox IDs.
3. `<ChatLauncher>` loads Chatwoot widget JS with `inboxId`, sets `userIdentifier=email` and HMAC `userHash` so customer threads persist across sessions.
4. CSS overrides for Chatwoot widget (white theme, black accent).
5. Service detail page wires `<ChatLauncher>` to that service's `service_location_id`.

**Checkpoint**: customer message arrives in correct Chatwoot inbox; widget visually matches portal.

### Phase 7 — Polish + a11y + perf (~2h)

**Deliverable**: production-ready.

Tasks:
1. Lighthouse runs on all main pages — target ≥ 95 perf, 100 a11y, 100 SEO.
2. Axe-core run, fix all violations.
3. Keyboard navigation pass — every action reachable, focus traps in modals.
4. RTL/locale: Polish only for now, but i18n keys structured for future EN.
5. Open Graph metadata per page; sitemap.xml; robots.txt.
6. Error pages: `not-found.tsx`, `error.tsx`, `global-error.tsx` — all branded.
7. Sentry init (errors only, no PII).
8. README in `app-customer-portal/README.md` for future maintainers.

**Checkpoint**: full e2e test green; Lighthouse green; manual review against this spec.

---

## 10. Open questions / decisions for user

1. **OTP vs Magic Link** for `/auth/login` — recommendation is Magic Link there, 6-digit OTP for `/status`. Confirm?
2. **Chatwoot inbox per location** — does each service location already have a dedicated inbox, or do we need to create them? (Phase 6 task may fan out.)
3. **3D phone model**: bespoke (designer time) or CC0 from Sketchfab? Bespoke matches Caseownia logo's wireframe style; CC0 is faster.
4. **Self-registration during OTP flow** — confirm this is desired (current spec assumes yes; KC `userRegistration=true`).
5. **Apple Sign-In / Google** — not in current spec. Add later wave?
6. **Quote acceptance vs Documenso aneks** — current panel uses Documenso for aneksy; spec adds a *fast path* (single-click accept inline) for quotes. OK? Or always force Documenso flow?

---

## 11. Out of scope (explicitly)

- iOS / Android native apps.
- Push notifications (web push could be a Wave 20 addition).
- Customer-initiated new orders (intake stays in employee panel).
- Loyalty / referral program.
- Payments online (current model: pay at pickup).
- Multi-language (PL only at launch; structure ready for EN).

---

End of spec.
