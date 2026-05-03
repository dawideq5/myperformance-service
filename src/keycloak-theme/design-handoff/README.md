# Design System Handoff — READ-ONLY reference

These files are a **read-only** copy of the MyPerformance Design System
handoff (Wave 22 / F3, May 2026). They are kept in-tree so future
maintainers can diff the live Keycloak theme against the canonical
visual spec without re-extracting the source ZIP.

**Do not import any of these files at runtime.** Vite ignores anything
that nothing imports, so they will never end up in the JAR — but to be
explicit:

- `colors_and_type.css` — full design-token catalogue (dark + light,
  `color-mix`, login-bg radial gradients, type scale, motion tokens).
  The live theme stylesheet (`../styles.css`) is derived from this file.
- `dashboard-styles.css` — full dashboard UI kit, includes the
  `.mp-login__*` block we mirror inside the Keycloak slots.
- `Login.jsx` — NextAuth dashboard login (Google SSO + form). Shown for
  layout reference only — the Keycloak server renders the form, so
  `KcPage.tsx`/`Template.tsx` mirror the visual chrome (wordmark card,
  topbar with theme toggle, bg/grid layers) via slot overrides.
- `theme.js` / `ThemeToggle.jsx` — vanilla JS / React reference for the
  dark/light toggle behaviour we re-implement in `../login/ThemeToggle.tsx`.
- `README-source.md` — original handoff README (content fundamentals,
  visual foundations, tone-of-voice).

Updates: re-extract the new ZIP into this folder when the handoff
revs (`unzip -p ... > target.css`).
