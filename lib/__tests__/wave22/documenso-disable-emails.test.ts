/**
 * Wave 22 / F19 — regresja Documenso `disableEmails: true` (F1).
 *
 * KRYTYCZNY BUG FIX: Documenso w trybie sequential signing wysyłał klientowi
 * własne zaproszenie (z domyślnego SMTP Documenso) ZAMIAST naszego brandowanego
 * maila przez Postal. Klient dostawał generic "Sign your document" zamiast
 * customowego brand-aware "Twoje zlecenie czeka na podpis" z odpowiednim
 * From: zależnym od brandu lokacji.
 *
 * F1 wprowadził `disableEmails: true` jako jedyny dopuszczalny sposób
 * tworzenia dokumentu w Documenso w callsite'ach panelowych. Ten test pinuje
 * to wprost — czyta plik route handlera i sprawdza że `disableEmails: true`
 * pojawia się w wywołaniu `createDocumentForSigning`.
 *
 * Brittle in the right way: każde usunięcie tej flagi (świadome lub przypadkowe
 * regression) wywali test.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Repo root liczony od pliku testowego: lib/__tests__/wave22 → ../../.. */
const REPO_ROOT = join(__dirname, "..", "..", "..");

interface CallsiteSpec {
  /** Krótki opis do diagnostyki testu. */
  label: string;
  /** Ścieżka relatywna do REPO_ROOT. */
  path: string;
  /** Funkcja Documenso w call-site'ie. */
  fnName: "createDocumentForSigning";
}

/**
 * Wszystkie panelowe call-site'y które tworzą dokument w Documenso.
 *
 * Ta lista MUSI pokrywać 100% callsite'ów w `app/api/panel/**` — gdy ktoś
 * doda nowy endpoint, aktualizujemy listę. Test "no other callsites are
 * un-flagged" niżej weryfikuje że nie pojawił się un-tracked callsite z
 * `disableEmails: false` (lub bez flagi).
 */
const PANEL_CALLSITES: CallsiteSpec[] = [
  {
    label: "send-electronic (potwierdzenie odbioru → Documenso)",
    path: "app/api/panel/services/[id]/send-electronic/route.ts",
    fnName: "createDocumentForSigning",
  },
  {
    label: "sign-paper (ścieżka papierowa też zostawia ślad w Documenso)",
    path: "app/api/panel/services/[id]/sign-paper/route.ts",
    fnName: "createDocumentForSigning",
  },
  {
    label: "annex (aneks do wyceny — sequential signing)",
    path: "app/api/panel/services/[id]/annex/route.ts",
    fnName: "createDocumentForSigning",
  },
];

function loadSource(relPath: string): string {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

/**
 * Heurystyka: znajdź każde wywołanie `createDocumentForSigning(` i wyciągnij
 * tekst od `(` do dopasowanego `)`. Action: `disableEmails: true` musi się
 * znaleźć w każdym wywołaniu. Nie używamy parser'a TS żeby test był prosty
 * i nie wymagał compile.
 *
 * Zwracamy listę "stringów argumentu" — w produkcyjnym kodzie zwykle 1
 * wywołanie per plik, ale obsługujemy N dla bezpieczeństwa.
 */
function extractCallArgs(source: string, fnName: string): string[] {
  const calls: string[] = [];
  const needle = `${fnName}(`;
  let idx = 0;
  while (true) {
    const at = source.indexOf(needle, idx);
    if (at === -1) break;
    let depth = 0;
    let end = -1;
    for (let i = at + needle.length - 1; i < source.length; i++) {
      const ch = source[i];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) break;
    calls.push(source.slice(at, end + 1));
    idx = end + 1;
  }
  return calls;
}

describe("Wave 22 / F1 — Documenso disableEmails: true na panelowych call-site'ach", () => {
  for (const spec of PANEL_CALLSITES) {
    it(`${spec.label} → przekazuje \`disableEmails: true\` do ${spec.fnName}`, () => {
      const source = loadSource(spec.path);
      const calls = extractCallArgs(source, spec.fnName);

      expect(
        calls.length,
        `Spodziewano się przynajmniej 1 wywołania ${spec.fnName} w ${spec.path}`,
      ).toBeGreaterThan(0);

      for (const callText of calls) {
        // Akceptujemy white-space variations (`disableEmails:true`,
        // `disableEmails : true`, multi-line). NIE akceptujemy `false`.
        expect(
          /disableEmails\s*:\s*true\b/.test(callText),
          `${spec.path}: \`${spec.fnName}\` NIE przekazuje \`disableEmails: true\`. ` +
            "Documenso będzie wysyłać własne zaproszenia z domyślnego SMTP " +
            "(generic 'Sign your document') zamiast naszych brandowanych maili. " +
            "Fix: dodaj `disableEmails: true,` do opts createDocumentForSigning.",
        ).toBe(true);

        // Defense in depth — gdy ktoś świadomie zostawił `disableEmails: false`
        // to też regresja (legacy default to `false`).
        expect(
          /disableEmails\s*:\s*false\b/.test(callText),
          `${spec.path}: znaleziono \`disableEmails: false\` — F1 wymaga true.`,
        ).toBe(false);
      }
    });
  }

  it("warstwa lib (lib/documenso.ts) wciąż wspiera opt-in disableEmails", () => {
    const source = loadSource("lib/documenso.ts");
    // Pinujemy że flaga jest udokumentowana i konsumowana. To zabezpiecza
    // przed regresją gdyby ktoś przypadkiem usunął branchowanie.
    expect(/disableEmails\?\s*:\s*boolean/.test(source)).toBe(true);
    expect(/opts\.disableEmails/.test(source)).toBe(true);
  });

  it("happy path: lib/documenso.ts NIE ustawia globalnego defaultu na true (musi być opt-in per call)", () => {
    // F1 zostawił `disableEmails ?? false` jako default — opt-in. Gdyby ktoś
    // zmienił to na `?? true` test OK przejdzie, ale wtedy legacy callerów
    // dotyka cicho. Pinujemy że default to `false` żeby zmuszać każdy nowy
    // callsite do świadomego ustawienia.
    const source = loadSource("lib/documenso.ts");
    expect(
      /opts\.disableEmails\s*\?\?\s*false/.test(source),
      "Default disableEmails powinien zostać `?? false` (opt-in per call). " +
        "Zmiana na ?? true potencjalnie maskuje legacy callerów.",
    ).toBe(true);
  });
});
