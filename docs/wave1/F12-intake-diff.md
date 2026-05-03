# F12 — Ujednolicenie procesu przyjęcia (sprzedawca = serwisant)

**Wave:** 22 / F12
**Branch:** `wave3/f12-intake-unification`
**Cel produktowy:** "Proces przyjmowania urządzenia z panelu serwisowego zrób 1:1 tak jak w panelu sprzedawcy, bez żadnego uproszczonego widoku."

## Stan przed F12

| | Sprzedawca (`AddServiceTab`) | Serwisant (`QuickIntakeModal`) |
| --- | --- | --- |
| Sekcja Urządzenie (marka/model/IMEI/kolor) | tak — `BrandPicker` + `ImeiField` (z historią) + `ColorPicker` (named colors) | tak — surowe `<input>` |
| Blokada (none/PIN/wzór) | tak — `LockSection` + `PatternLock` 3x3 | brak |
| Stan wizualny urządzenia (3D walkthrough) | tak — `PhoneConfigurator3D` (~1644 linii) z markerami uszkodzeń, ratingami, pomiarem prądu ładowania | brak |
| Opis usterki | tak — `DescriptionPicker` chips + `QuotePreview` z mp_pricelist + `EstimateBlock` | wolny tekst `<textarea>` |
| Dane klienta | imię/nazwisko + `PhoneInputWithFlags` (PL/DE/GB/UA itp.) + email z lockiem po Documenso | imię/nazwisko + telefon (raw) + email |
| Punkt serwisowy (destination) | tak — `ServiceLocationPicker` + transport notice | brak (auto-mapping po locationId) |
| Kanał kodu wydania (email/SMS/papier) | tak — `ReleaseCodeChannelPicker` (Wave 21/Faza 1C) | brak |
| Potwierdzenie odbioru / handover (SIM, SD, etui) | tak | brak |
| Sequential gating (sekcje odblokowują się) | tak | nie dotyczy |
| Edit mode (PATCH istniejącego serwisu) | tak | nie |
| Submit endpoint | `POST/PATCH /api/relay/services` | `POST /api/relay/services` |

Sprzedawca: **1904 linii** kompletnej ścieżki intake.
Serwisant: **451 linii** uproszczonej formy "lekki wariant".

## Cel po F12

Serwisant otrzymuje TĘ SAMĄ logikę formularza co sprzedawca. Różnice tylko w opcjonalnych sekcjach (właściwych dla roli) i w post-submit flow.

### Wspólny rdzeń (oba mody widzą)
- Urządzenie (BrandPicker, ImeiField, ColorPicker)
- Blokada (LockSection)
- Stan wizualny — pełny 3D walkthrough (PhoneConfigurator3D)
- Opis usterki + wycena (DescriptionPicker, QuotePreview, EstimateBlock)
- Dane klienta + handover

### Tylko `mode="sales"`
- Sekcja "Punkt serwisowy" (sprzedawca wybiera dokąd zlecenie idzie)
- Sekcja "Kanał kodu wydania" (Wave 21/Faza 1C — email/SMS/papier)
- Domyślny post-submit redirect do `/serwis/${id}` w panelu sprzedawcy

### Tylko `mode="service"`
- Brak sekcji "Punkt serwisowy" (serwisant *jest* punktem serwisowym; backend mappuje destination automatycznie po `locationId`)
- Brak wyboru kanału kodu wydania (sales-only flow)
- Po sukcesie wywołanie `onCreated(service)` zamiast redirectu — parent (np. `PanelHome`) decyduje co dalej (insert do listy + auto-select)

## Decyzja architektoniczna — duplikacja zamiast `panels/shared/`

**Pierwotnie planowano** umieścić formularz w `panels/shared/intake/AddServiceForm.tsx`, importowany cross-panel jako `../../shared/intake/...`. **Nie działa** w tym repo z dwóch powodów:

1. Każdy panel (`panels/sprzedawca/`, `panels/serwisant/`) jest niezależnym Next.js apem z własnym `node_modules`, własnym `output: "standalone"` i własnym `outputFileTracingRoot: __dirname`. Plik w `panels/shared/intake/` nie ma w drzewie ancestorów node_modules, w którym znajdują się zależności typu `three`, `@react-three/drei`, `@react-three/fiber`. Module resolution (Node.js + webpack) walks UP from file location — `panels/shared/intake/` → `panels/shared/` → `panels/` → repo root. Pakiety istnieją tylko w `panels/sprzedawca/node_modules` i `panels/serwisant/node_modules`, więc shared file nie zbuilduje się ani na laptopie ani w Coolify Docker.
2. Symlink `panels/shared/node_modules → ../sprzedawca/node_modules` przechodzi typecheck lokalnie ale jest nieprzenośny (CI nie ma symlinku po fresh `npm ci`, Docker COPY niekoniecznie zachowuje cross-directory symlinki).

**Pivot:** kod żyje w `panels/{sprzedawca,serwisant}/components/intake/` jako bajt-identyczne kopie. Wzorzec znany — projekt już duplikował `PhoneConfigurator3D` (`panels/serwisant/components/visual/PhoneConfigurator3D.tsx` vs `panels/sprzedawca/components/intake/PhoneConfigurator3D.tsx`).

Każdy plik `AddServiceForm.tsx` ma na początku komentarz `F12-SYNC` z instrukcją utrzymania:

```ts
// F12-SYNC: ten plik jest zduplikowany w
//   panels/sprzedawca/components/intake/AddServiceForm.tsx
//   panels/serwisant/components/intake/AddServiceForm.tsx
// Trzymaj oba bajt-identyczne (poza ewentualnymi różnicami ścieżek)…
```

Weryfikacja zgodności w PR review: `diff panels/sprzedawca/components/intake/AddServiceForm.tsx panels/serwisant/components/intake/AddServiceForm.tsx` — exit code 0.

## Zmiany w plikach

### Dodane
- `panels/sprzedawca/components/intake/AddServiceForm.tsx` (~2014 linii) — pełna logika z propsami `mode`, `onCreated`, `onError`, `receiptHandlers`
- `panels/serwisant/components/intake/AddServiceForm.tsx` — bajt-identyczna kopia powyższego
- `panels/serwisant/components/intake/{BrandPicker,ImeiField,ColorPicker,LockSection,PatternLock,PhoneInputWithFlags,DescriptionPicker,QuotePreview,PhoneConfigurator3D,PhoneScene,PhoneModel,PhoneGLB,PhoneSceneErrorBoundary,ModelLoadingOverlay,RatingScale,ChecklistSection}.tsx` — kopie sub-komponentów intake (wcześniej tylko sprzedawca miał)
- `docs/wave1/F12-intake-diff.md` — ten dokument

Uwaga: serwisant wcześniej miał już `panels/serwisant/components/visual/{PhoneConfigurator3D,PhoneScene,PhoneModel,PhoneGLB,PhoneSceneErrorBoundary,ModelLoadingOverlay,RatingScale}.tsx` używane przez DiagnozaTab → "Pokaż urządzenie". Te pliki zostawiamy nietknięte — to inny use-case (read-only viewer), nie intake.

### Zmodyfikowane
- `panels/sprzedawca/components/tabs/AddServiceTab.tsx` — z 1904 linii do **~50 linii**: thin wrapper podpinający `<AddServiceForm mode="sales" … />` z `onError` (toast.push) i `receiptHandlers` (openServiceReceipt + sendElectronicReceipt z `lib/receipt`)
- `panels/serwisant/components/QuickIntakeModal.tsx` — przepisany z 451 linii surowego formularza do **~120 linii** modal chrome (ESC/focus-trap/scroll container) renderującego `<AddServiceForm mode="service" … />` z `onCreated` przekazującym `ServiceTicket` do parenta. Public API (props) bez zmian → caller w `PanelHome.tsx` nie wymaga modyfikacji.

### Niezmienione
- `panels/serwisant/components/PanelHome.tsx` — używa `<QuickIntakeModal />` z tą samą sygnaturą props, działa transparentnie
- API endpoint `/api/relay/services` — body kompatybilne (serwisant nie wysyła `serviceLocationId` ani `releaseCodeChannel`, backend ma defaulty)
- `panels/serwisant/components/visual/*` — niezmienione, używane poza intake
- DB schema — bez zmian

## Ryzyka i ograniczenia

1. **Maintenance burden:** każda zmiana w `AddServiceForm.tsx` musi być skopiowana do drugiego panelu. Mitigation: `F12-SYNC` komentarz + `diff` w PR review.
2. **F11 collision:** F11 (handover refactor w `AddServiceTab.tsx`) jest na `wave2/f11-handover-refactor`. F12 wystartowało z `wave1/foundations` (przed F11). Merge F11 → main wymagać będzie ręcznego rozwiązania konfliktu, bo F12 przeniosło logikę do nowego pliku. Strategia merge: zaaplikować F11 zmiany do `AddServiceForm.tsx` (oba kopie) zamiast do starego `tabs/AddServiceTab.tsx`.
3. **Toast w serwisancie:** serwisant nie ma `ToastProvider`; F12 podpina `window.alert()` jako fallback w `onError`. Acceptable na pierwsze wdrożenie, future work: dedykowany serwisant toast.
4. **availableLocations w serwisancie:** poprzedni `QuickIntakeModal` pozwalał wybrać locationId z dropdown gdy >1 lokacja. F12 tego nie obsługuje (locationId jest stałe per session — wybrane przy wejściu do panelu). Jeśli serwisant ma wiele lokacji, zmienia je na poziomie globalnego selektora panelu. Public API zachowane (prop `availableLocations` jest accepted ale ignored).

## Walidacja

- `cd panels/sprzedawca && npx tsc --noEmit` → 0 błędów
- `cd panels/serwisant && npx tsc --noEmit` → 0 błędów
- `cd panels/sprzedawca && npx next lint` → tylko warnings (no errors)
- `cd panels/serwisant && npx next lint` → tylko warnings (no errors)
- `diff panels/sprzedawca/components/intake/AddServiceForm.tsx panels/serwisant/components/intake/AddServiceForm.tsx` → exit 0 (identyczne)
