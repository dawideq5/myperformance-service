# MyPerformance Design System

A comprehensive design system for **MyPerformance**, a Polish-language SSO dashboard and identity ecosystem run by **Caseownia** (a phone-case retailer) and **Serwis Telefonów by Caseownia** (their phone-repair service). The dashboard is the single sign-on hub that fans out to every internal application — Chatwoot, Moodle ("Akademia"), Documenso, Postal, Directus, Outline, plus three cert-gated panels (`sprzedawca` / `serwisant` / `kierowca`).

---

## Sources

- **Codebase**: `dawideq5/myperformance-service` @ `main` — Next.js 15 (App Router) + NextAuth + Keycloak.
  - `app/globals.css` — CSS variables (dark-only)
  - `tailwind.config.ts` — Tailwind config (extends only)
  - `app/layout.tsx` — `<html lang="pl" className="dark">`
  - `app/login/page.tsx` — Keycloak SSO entry point
  - `app/dashboard/DashboardClient.tsx` — the tile grid, this is the "homepage"
  - `components/ui/` — Button, Card, Input, Badge, Alert, Tabs, EmptyState, PageShell, Spinner, Toast, ConfirmDialog, Dialog, Skeleton, Breadcrumbs, ThemeToggle, RelativeTime, OnboardingCard
  - `components/AppHeader.tsx` / `AppFooter.tsx`
  - `public/logos/*` — `caseownia.jpeg`, `serwis-by-caseownia.png`
  - `public/fonts/*` — Roboto Regular + Bold (used by the Keycloak login theme JAR; the dashboard itself uses Inter from system stack)

- **Sibling repos in the org**: `myperformance-driver`, `myperformancex`, `mperformance`, `myperformance` (private, not browsed). These appear to be the cert-gated panels referenced in the README.

> Nothing else was provided. No Figma, no decks, no slide template.

---

## What is MyPerformance?

> "Single-sign-on dashboard dla ekosystemu MyPerformance. Next.js 15 (App Router) + NextAuth z Keycloak jako Identity Provider i **jedynym źródłem prawdy** o użytkownikach, rolach i uprawnieniach."

In English: it's an internal employee portal that proxies SSO into ~10 third-party apps. Roles live in Keycloak; the dashboard reads them and shows only the tiles you're allowed to open. The product is **strictly internal** — no marketing pages, no consumer surfaces — which is why the entire design language is single-mode dark, indigo accent, and "operations console" in feel.

### Products covered by this design system

1. **MyPerformance Dashboard** — the SSO hub (`app/dashboard`). Tile grid + header + announcements + onboarding.
2. **MyPerformance Login** — `app/login/page.tsx`. Single "Continue" button that hands off to Keycloak.
3. **Admin surfaces** — `app/admin/users`, `app/admin/templates`, `app/admin/certificates`, `app/admin/email`, `app/admin/infrastructure`, `app/admin/config`. Same shell, denser tables.
4. **Account self-service** — `app/account` (profile, security, integrations, preferences).
5. **Cert-gated panels** — `panel-sprzedawca` / `panel-serwisant` / `panel-kierowca`. These live in sibling repos and require mTLS; not part of this design system other than the launcher tiles.

The Keycloak login screen itself is theme'd separately via Keycloakify and ships from `public/keycloak-theme/`. That theme uses **Roboto** (the bundled TTFs in `fonts/`) — distinct from the dashboard, which uses Inter.

---

## Index

```
/
├── README.md                    — this file
├── SKILL.md                     — Agent-Skill manifest (download as Claude Code skill)
├── colors_and_type.css          — CSS variables: colors, type, radii, shadows, motion
├── assets/                      — logos (Caseownia, Serwis Telefonów by Caseownia)
├── fonts/                       — Roboto Regular + Bold (Keycloak theme only)
├── preview/                     — design-system cards (registered for the DS tab)
└── ui_kits/
    └── dashboard/               — UI kit for the dashboard product
        ├── README.md
        ├── index.html           — interactive click-thru of the SSO hub
        └── *.jsx                — composable React components
```

---

## CONTENT FUNDAMENTALS

**Language: Polish.** All UI strings, error messages, hint text, button labels, and tooltips are written in Polish. The codebase has zero i18n abstraction — strings are hard-coded.

**Tone: direct, second-person formal, infrastructure-y.** Copy uses informal "ty" ("Wciśnij ⌘K", "Zaloguj się", "Twoje wydarzenia") rather than the formal "Pan/Pani". The voice is that of an internal-tools team talking to colleagues — short, declarative, no hedging, no marketing language. A few representative samples lifted verbatim from the codebase:

- Dashboard welcome card: *"Witaj w MyPerformance. Tutaj zobaczysz tylko aplikacje, do których masz dostęp. Klikaj kafelki żeby uruchomić apkę z auto-loginem przez SSO."*
- Login H2: *"Witaj z powrotem"* (sub: *"Zaloguj się przez MyPerformance ID"*)
- Tile description, Documenso admin: *"Pełna konsola Documenso — szablony, webhooki, użytkownicy"*
- Tile description, Infrastruktura: *"VPS, DNS, snapshoty, backupy, monitoring zasobów (CPU/RAM/Disk), alerty bezpieczeństwa, blokady IP, Wazuh SIEM"*
- Empty/permission-denied: *"Nie masz jeszcze dostępu do żadnej sekcji. Skontaktuj się z administratorem, aby uzyskać uprawnienia."*
- Error message: *"Sesja wygasła po dłuższej nieaktywności. Zaloguj się ponownie."*

**Casing.** Sentence case for everything except: page titles ("Witaj z powrotem", "Email i branding"), the brand wordmark "MyPerformance" (camel-case wordmark, never all-caps), and the eyebrow overline on the login screen ("Identity Management") which is uppercase + tracked. Tile titles are sentence case. Buttons are sentence case ("Kontynuuj", "Wyloguj", "Skonfiguruj Kadromierz").

**No emoji.** None in the codebase, none in the visual language. Lucide icons fill every emoji-shaped role.

**Punctuation.** Em-dashes (—) are used heavily as section separators in tile descriptions: "VPS, DNS, snapshoty — monitoring zasobów". Ellipsis "…" for loading states ("Inicjalizacja…"). Polish quotation marks „..." in long-form copy; ASCII quotes in code-adjacent strings.

**Numbers and metadata.** Roles, areas, and config keys are written in `kebab-case` or `snake_case` and shown verbatim in admin UIs (`chatwoot_agent`, `panel-sprzedawca`, `keycloak_admin`). Don't translate them.

**Vibe.** Calm-confident infrastructure tool. Think Vercel dashboard or Linear's settings panel — not a SaaS landing page. No exclamation marks, no "Welcome aboard! 🎉", no encouragement copy. The user is assumed competent.

---

## VISUAL FOUNDATIONS

### Mode

**Dark only.** `<html className="dark">` is hard-coded in `app/layout.tsx`; the `.dark` selector in `globals.css` and bare `:root` map to identical values. There is a `ThemeToggle` component in `components/ui/` but it is a 393-byte stub — the codebase ships dark-only.

### Colors

| Role | Hex | Use |
|---|---|---|
| `--bg-main` | `#0a0a0f` | Page background; near-black with the faintest blue cast |
| `--bg-card` | `#12121a` | Cards, tiles, dialogs |
| `--bg-header` | `#0f0f16` | Top bar (used at 80% opacity + `backdrop-blur-md`) |
| `--bg-surface` | `#14141d` | Secondary surface — kbd chips, command-palette input, hover targets |
| `--border-subtle` | `#1e1e2e` | Default 1px border on every card and divider |
| `--text-main` | `#f1f1f4` | Primary text |
| `--text-muted` | `#6b6b7b` | Labels, descriptions, footer, icons-as-text |
| `--accent` | `#6366f1` (indigo-500) | The single brand colour. Buttons, focus rings, links, active tab pill, brand-tinted everything |

Indigo `#6366f1` is the **only** brand colour. Everywhere it appears as a tint, it's at exactly **`/10` (10% opacity)** for the soft fill (`bg-[var(--accent)]/10`) and **`/20`** for borders. Focus rings use `/30`–`/50`. This `/10`+`/20` pattern is a hard rule across all `tone` variants in `Badge`, `Alert`, and tile icon pills — see below.

### Per-app tile palette

The dashboard's tile grid is the only place where multiple hues appear at once. Each tile picks **one Tailwind 500-shade for the icon** and **the matching `/10` tint for the icon's pill background**. The pairing is fixed per app:

| App | Tile icon colour | Lucide icon |
|---|---|---|
| Calendar | `blue-500` | `Calendar` |
| Kadromierz | `orange-500` | `Clock` |
| Panel Sprzedawcy | `sky-500` | `Briefcase` |
| Panel Serwisanta | `rose-500` | `Wrench` |
| Panel Kierowcy | `lime-500` | `Truck` |
| Certyfikaty | `amber-500` | `FileSignature` |
| Konfiguracja | `violet-500` | `Settings` |
| Directus | `emerald-500` | `Database` |
| Documenso | `purple-500` | `FileSignature` |
| Postal | `pink-500` | `Mail` |
| Knowledge / Outline | `teal-400` | `BookMarked` |
| Users / Email / Infra / Keycloak (admin tier) | `indigo-500` | `Users` / `Mail` / `Server` / `KeyRound` |

The semantic tones (success/warning/danger/info) use the same `/10 bg + /20 border + 500 text` recipe — see `components/ui/Badge.tsx` and `Alert.tsx`.

### Type

**Inter, system fallback.** `body { font-family: 'Inter', system-ui, -apple-system, sans-serif; }`. Inter is **not bundled** — the codebase relies on the user already having it (macOS doesn't, so this falls back to system-ui; the app effectively renders in San Francisco / Segoe UI / Roboto depending on OS). **Flag this:** if you need pixel-perfect parity, load Inter from Google Fonts.

The `Roboto-Regular.ttf` / `Roboto-Bold.ttf` files in `public/fonts/` are **only** for the Keycloak login theme JAR (built via Keycloakify), not the dashboard.

**Scale.** Six sizes — `30 / 20 / 18 / 16 / 14 / 12 / 10`. `text-sm` (14px) is the body size; `text-xs` (12px) is meta; `text-[10px]` is the uppercase eyebrow on the login screen. Headings climb in big jumps: H3 = 18, H2 = 20, H1 = 30. There is no `text-2xl` or `text-4xl` in production code — the scale is deliberately compact.

**Weights.** 400 / 500 / 600 / 700 / 900. The login H1 ("MyPerformance") is the only place where `font-black` (900) appears. Everything else tops out at `font-bold` (700) or `font-semibold` (600).

**Tracking.** Tight (`-0.01em`) on H1 and the brand wordmark. Wide (`0.2em`) on uppercase eyebrow text only.

### Spacing

Tailwind 4-px base scale. Hot spots: cards use `p-6` (24px) by default; tiles use `p-5` (20px) with a `mb-4` after the icon pill. Page shell is `mx-auto max-w-6xl px-6 py-8`. Header is `h-14` mobile, `h-16` desktop. Buttons are `h-8` (sm), `h-10` (md), `h-12` (lg).

### Backgrounds

**Flat dark surfaces, no gradients except one feature**: the Cmd+K palette has a **rotating conic-gradient halo** (`mp-cmdk-glow`) — a fixed gradient ring whose hue cycles via `hue-rotate(0→360deg)` over 10s, with a 20px-blur outer halo. This is the only "marketing-y" effect in the entire app and it's reserved for the command palette. Don't use gradients elsewhere.

**Pulse glow** for the announcements banner (`mp-announcement-glow`): a 2.6s ease-in-out filter cycle on `brightness(1)→1.08` + `saturate(1)→1.15`. No transform — keeps grid layout stable.

No imagery in the dashboard — no hero photos, no illustrations, no patterns. The only image asset is the brand logo (Caseownia wordmark), used at small sizes.

### Animation

Three keyframes total in `globals.css`:

- `fade-in` — 0.25s ease-out, opacity only. Page-shell entrance.
- `slide-up` — 0.3s ease-out, opacity + 12px → 0 translate. Toasts, modals.
- `tab-in` — 0.2s ease-out, opacity + 6px → 0 translate. Tab panel switches.

Plus `mp-announcement-glow` and `mp-cmdk-hue` (above). Everything else is a CSS `transition-colors` on hover (default 150ms). **No bounces, no springs, no parallax, no scroll-triggered.** The motion language is "fast, linear, calm" — appropriate for a tool that admins live in for hours.

`prefers-reduced-motion: reduce` disables both the announcement pulse and the Cmd+K halo rotation.

### Hover, press, focus

- **Hover (button)**: background gets `/90` (10% darker variant). `text-muted` → `text-main`. Border on secondary buttons stays.
- **Hover (tile)**: border goes from `--border-subtle` → `--accent / 40%`, plus `shadow-lg` and `-translate-y-0.5`. This is the one place a translate-on-hover is allowed, and it's tiny (2px).
- **Press (button)**: `active:scale-[0.98]` — a 2% squish. No colour change.
- **Focus**: `ring-2 ring-[--accent]/50` + `ring-offset-2 ring-offset-[--bg-main]` for buttons. Inputs: `ring-2 ring-[--accent]/30 + border-[--accent]`. Always indigo, always 2px.
- **Disabled**: `opacity-60 cursor-not-allowed`. Loading buttons get `aria-busy` and a spinning `Loader2`.

### Borders, radii, shadows

- **Borders**: 1px solid `--border-subtle` is the default. There is no thicker border anywhere. Borders are *the* visual language for separation — not shadows.
- **Radii**: a tight scale — `rounded-md` (6) for kbd chips, `rounded-lg` (8) for inner pills, `rounded-xl` (12) for buttons + inputs + the icon pill *inside* a card, `rounded-2xl` (16) for cards and tiles, `rounded-3xl` (24) for the login card only, `rounded-full` for badges and avatars. **Never** mix radii on a single card: the outer container, the inner buttons, and the inner icon pill are all separately rounded.
- **Shadows**: minimal. `shadow-sm` on primary buttons. `shadow-lg` only on tile hover. `shadow-xl shadow-black/5` on the login card. No inset shadows. No coloured glows except the deliberate gradient ones above.

### Capsules vs. protection gradients

No protection gradients (no scrim overlays — there are no images to protect). Capsules ARE used: badges and avatar pills. Pills with leading icons follow the pattern `inline-flex items-center gap-1 px-2 py-0.5 rounded-full border` with the `/10 bg + /20 border + 500 text` colour recipe.

### Layout rules

- `max-w-6xl` (`1152px`) is the dashboard width. `max-w-7xl` exists in `PageShell` as an option but isn't used for the main grid.
- Three-column tile grid at `lg+`, two at `sm`, one on mobile. `gap-4` (16px) between tiles.
- Header is `sticky`-feeling but actually static; uses `bg-[--bg-header]/80 backdrop-blur-md` for the layered look over scroll.
- Footer is centred, links separated by `gap-x-6 gap-y-2 text-xs`.

### Transparency and blur

Used sparingly: header bar `/80 + backdrop-blur-md`. Overlays for dialogs use `bg-black/60 + backdrop-blur-sm`. Card surfaces are NEVER transparent — always solid `--bg-card`.

### Imagery vibe

The Caseownia logo is **black-on-white** (and looks bad on the dashboard's dark surface — it's never actually rendered there in code; the dashboard uses the wordmark "MyPerformance" as text instead). The logos are only used on Caseownia's external/consumer touchpoints, not inside the dashboard. Treat them as brand-of-record artefacts, not UI elements.

### Cards

The canonical card:

```css
background: var(--bg-card);
border: 1px solid var(--border-subtle);
border-radius: 16px; /* rounded-2xl */
padding: 24px;       /* p-6 */
```

When interactive (tiles): hover transitions border to `--accent/40` plus `shadow-lg` plus `-translate-y-0.5`. The icon is a 48×48 pill (`rounded-xl`) at the top-left, filled with the icon's `/10` tint.

### Layout fixed-elements

`AppHeader` is the only element that's positionally consistent across pages. It's not `position: sticky` — it's a regular flex container at the top of `PageShell`. The `ChatwootWidget` floats in the corner (script-injected). Toasts portal to bottom-right.

---

## ICONOGRAPHY

**Lucide React** is the single icon system, version `0.344.0` per `package.json`. Stroke-style icons, 1.5–2px stroke at the SDK default. Used at three sizes:

- `w-3.5 h-3.5` (14px) — inline with text-xs
- `w-4 h-4` (16px) — inline with body / button text
- `w-5 h-5` (20px) — Alert icons, header controls
- `w-7 h-7` (28px) — tile icons (centred in 48×48 pills)

The codebase imports Lucide names directly: `Calendar`, `Clock`, `Briefcase`, `Wrench`, `Truck`, `FileSignature`, `Settings`, `Database`, `MessageSquare`, `Mail`, `BookMarked`, `Users`, `Server`, `KeyRound`, `GraduationCap`, `School`, `Library`, `Plug`, `Loader2`, `Eye`, `EyeOff`, `Search`, `LogOut`, `User`, `ArrowLeft`, `ArrowRight`, `ExternalLink`, `Inbox`, `AlertCircle`, `CheckCircle2`, `Info`, `AlertTriangle`. There is no custom icon font, no SVG sprite, no PNG icons in the entire dashboard.

**No emoji. No Unicode glyphs as icons.** The only Unicode you'll see are kbd glyphs (`⌘`, `↵`).

**This design system uses the Lucide CDN** for parity with production: `https://unpkg.com/lucide@latest`. A vanilla-HTML version is loaded in the UI kit. Stroke width and sizing match the Lucide React defaults.

**Logos** live in `assets/`:

- `caseownia.jpeg` — the parent-brand wordmark (CASEOWNIA + phone graphic, black on white)
- `serwis-by-caseownia.png` — the repair-service sub-brand wordmark

These are used on **external** Caseownia surfaces (consumer site, packaging, Keycloak login theme footer if the brand is exposed). The dashboard itself does **not** render them — it uses the typed wordmark "MyPerformance" instead. Keep both logos in `assets/` as the canonical brand-of-record files.

---

## Caveats

- **No light theme.** The codebase is dark-only despite having a stub `ThemeToggle` component. If a future surface needs light mode it will need to be designed from scratch.
- **Inter is not bundled.** The CSS asks for `'Inter', system-ui, ...`. On systems without Inter installed, the dashboard renders in the OS sans-serif. Either accept this fallback or load Inter from Google Fonts.
- **Roboto is bundled but unused outside Keycloak.** The TTFs live in `public/fonts/` only because Keycloakify packages them into the login theme JAR.
- **No production logos for MyPerformance itself.** "MyPerformance" is rendered as styled text — no logomark file exists. Caseownia logos are the brand-of-record artefacts.
- **The cert-gated panels (`sprzedawca`/`serwisant`/`kierowca`) live in private sibling repos** and weren't browsed for this design system. The dashboard tile launchers are documented but the panels themselves are not.
- **No design tokens file in source.** Tokens were extracted from `globals.css` (CSS variables), `tailwind.config.ts` (extends), and inline class strings in `components/ui/*`. The token definitions in `colors_and_type.css` are this design system's contribution — they don't exist as a single file in the codebase.
