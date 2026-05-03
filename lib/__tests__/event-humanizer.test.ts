/**
 * Wave 22 / F7 — testy humanizera event logu.
 *
 * Pokrywamy najczęstsze przypadki ze screenshotu od user'a + edge cases
 * (brak payload, nieznany action, status_change z nieznanym statusem,
 * fallback do summary).
 */
import { describe, expect, it } from "vitest";
import {
  formatActor,
  formatEventTimestamp,
  humanizeAction,
} from "@/lib/services/event-humanizer";

const labelsLookup = (s: string): string => {
  const map: Record<string, string> = {
    received: "Przyjęte",
    diagnosing: "W diagnostyce",
    rejected_by_customer: "Odrzucone przez klienta",
    repairing: "W naprawie",
  };
  return map[s] ?? s;
};

describe("humanizeAction", () => {
  it("status_change tłumaczy from/to przez statusLabels lookup", () => {
    const r = humanizeAction(
      "status_change",
      { from: "diagnosing", to: "rejected_by_customer" },
      "diagnosing → rejected_by_customer",
      labelsLookup,
    );
    expect(r.label).toBe("Zmiana statusu zlecenia");
    expect(r.description).toBe("W diagnostyce → Odrzucone przez klienta");
  });

  it("status_change bez payload fallbackuje do summary", () => {
    const r = humanizeAction(
      "status_change",
      null,
      "Status zmieniony",
      labelsLookup,
    );
    expect(r.label).toBe("Zmiana statusu zlecenia");
    expect(r.description).toBe("Status zmieniony");
  });

  it("annex_created z previousAmount/newAmount renderuje delta wyceny", () => {
    const r = humanizeAction(
      "annex_created",
      { previousAmount: 980, newAmount: 1060 },
      "Aneks utworzony",
    );
    expect(r.label).toBe("Utworzono aneks");
    expect(r.description).toBe(
      "Documenso — wycena zwiększona z 980.00 PLN do 1060.00 PLN",
    );
  });

  it("annex_created z nowszą-niższą wyceną używa 'zmniejszona'", () => {
    const r = humanizeAction(
      "annex_created",
      { previousAmount: 1500, newAmount: 1200 },
      "",
    );
    expect(r.description).toBe(
      "Documenso — wycena zmniejszona z 1500.00 PLN do 1200.00 PLN",
    );
  });

  it("quote_changed renderuje obie kwoty PLN", () => {
    const r = humanizeAction(
      "quote_changed",
      { oldAmount: 280, newAmount: 380 },
      "raw",
    );
    expect(r.label).toBe("Zmiana wyceny");
    expect(r.description).toBe("Wycena z 280.00 PLN do 380.00 PLN");
  });

  it("release_code_failed wyciąga attemptsLeft z summary", () => {
    const r = humanizeAction(
      "release_code_failed",
      { reason: "invalid_code" },
      "Niepoprawny kod wydania (pozostało prób: 4).",
    );
    expect(r.label).toBe("Niepoprawny kod wydania");
    expect(r.description).toBe("Pozostało prób: 4");
  });

  it("release_code_failed z channel w payload renderuje kanał gdy brak attemptsLeft", () => {
    const r = humanizeAction(
      "release_code_failed",
      { channel: "sms", error: "boom" },
      "Nie udało się wysłać kodu wydania kanałem sms.",
    );
    expect(r.label).toBe("Niepoprawny kod wydania");
    expect(r.description).toBe("Nie udało się wysłać kodu (SMS)");
  });

  it("release_code_generated renderuje kanał email po polsku", () => {
    const r = humanizeAction(
      "release_code_generated",
      { channel: "email" },
      "Wygenerowano kod wydania urządzenia (kanał: email).",
    );
    expect(r.label).toBe("Wygenerowano kod wydania");
    expect(r.description).toBe("Kanał: e-mail");
  });

  it("transport_requested renderuje cel + powód", () => {
    const r = humanizeAction(
      "transport_requested",
      {
        destinationName: "Serwis Caseownia Tychy",
        reason: "Brak narzędzi do BGA",
      },
      "Wnioskowano transport...",
    );
    expect(r.label).toBe("Wnioskowano transport");
    expect(r.description).toBe(
      "Cel: Serwis Caseownia Tychy — Brak narzędzi do BGA",
    );
  });

  it("upload_bridge_token_issued mapuje stage na polski opis", () => {
    const r = humanizeAction(
      "upload_bridge_token_issued",
      { stage: "diagnosis" },
      "raw summary",
    );
    expect(r.label).toBe("Wygenerowano kod do uploadu zdjęć");
    expect(r.description).toBe("Etap: diagnozy");
  });

  it("photo_uploaded z nieznanym stage używa raw stage zamiast crashować", () => {
    const r = humanizeAction(
      "photo_uploaded",
      { stage: "weird_new_stage" },
      "",
    );
    expect(r.label).toBe("Dodano zdjęcie");
    expect(r.description).toBe("Etap: weird_new_stage");
  });

  it("nieznany action zwraca lekko sformatowaną wersję bez technicznego underscores", () => {
    const r = humanizeAction("totally_new_action", null, "Coś się stało");
    expect(r.label).toBe("Totally new action");
    expect(r.description).toBe("Coś się stało");
  });

  it("nieznany action bez summary zwraca neutralny placeholder", () => {
    const r = humanizeAction("snake_case_action", null, null);
    expect(r.label).toBe("Snake case action");
    expect(r.description).toBe("Zarejestrowano zdarzenie systemowe.");
  });

  it("document_invalidated formatuje kind + reason", () => {
    const r = humanizeAction(
      "document_invalidated",
      { kind: "annex", reason: "Klient zmienił e-mail" },
      "",
    );
    expect(r.label).toBe("Dokument unieważniony");
    expect(r.description).toBe(
      "Unieważniono aneks do wyceny — Klient zmienił e-mail",
    );
  });
});

describe("formatActor", () => {
  it("preferuje actorName", () => {
    expect(
      formatActor({
        actorName: "Dawid Pałuska",
        actorEmail: "dawid@x.pl",
      }),
    ).toBe("Dawid Pałuska");
  });

  it("fallback do local-part e-maila gdy brak nazwy", () => {
    expect(
      formatActor({ actorName: null, actorEmail: "dawid.paluska@x.pl" }),
    ).toBe("dawid.paluska");
  });

  it("zwraca 'System' gdy brak obu", () => {
    expect(formatActor({ actorName: null, actorEmail: null })).toBe("System");
  });

  it("trimuje whitespace w actorName", () => {
    expect(
      formatActor({ actorName: "   ", actorEmail: "x@y.pl" }),
    ).toBe("x");
  });
});

describe("formatEventTimestamp", () => {
  it("formatuje ISO do 'D.MM.YYYY, HH:MM:SS'", () => {
    // Używamy konstruktora new Date z lokalnymi argumentami żeby uniknąć
    // problemów z TZ — formatter używa lokalnych metod (.getDate / etc.).
    const d = new Date(2026, 4, 3, 14, 30, 25); // 3 maja 2026, 14:30:25
    expect(formatEventTimestamp(d.toISOString())).toBe(
      "3.05.2026, 14:30:25",
    );
  });

  it("zwraca pusty string dla nieprawidłowego ISO", () => {
    expect(formatEventTimestamp("not-a-date")).toBe("");
  });
});
