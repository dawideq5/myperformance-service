"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

/**
 * Wave22 / F14 — Chatwoot floating widget dla panelu sprzedawcy.
 *
 * Use case: sprzedawca przyjmuje urządzenie na serwis i potrzebuje
 * skonsultować np. wycenę albo dostępność części z serwisantem. Klika
 * dymek czatu (default Chatwoot bottom-right), system łączy z
 * serwisantami przypisanymi do inboxa, a po stronie agenta widoczny
 * jest pełny kontekst: identyfikacja sprzedawcy + custom attributes z
 * aktualnie otwartego zlecenia (service_id, ticket_number, location_id).
 *
 * Routing do serwisanta: skonfigurowane po stronie Chatwoot inbox
 * (Auto Assignment > agenci z odpowiednią rolą). Tutaj tagujemy
 * konwersację `service-consultation` żeby ułatwić raportowanie/regułkę.
 *
 * Dlaczego nie raw <script>:
 * - React 18 ma quirki z hydration dla <script> w JSX.
 * - Chcemy idempotentny mount — jeśli nawigacja w panelu re-mount'uje
 *   layout (np. w przyszłości z Soft Navigation w innym kształcie),
 *   nie chcemy wstrzykiwać drugiego SDK.
 *
 * Dlaczego cleanup nie odłącza skryptu:
 * - SDK Chatwoot trzyma stan w singletonie (`window.$chatwoot`),
 *   ponowne load + run powoduje duplicate websocket/iframe i błędy w
 *   konsoli. `reset()` odłącza usera, ale samo SDK zostaje.
 */

const SDK_SCRIPT_ID = "chatwoot-sdk";

const DEFAULT_BASE_URL = "https://chat.myperformance.pl";
const DEFAULT_WEBSITE_TOKEN = "fpRgZiQqZzqgdmMeCRGsr4uX";

type IdentityResponse = {
  identifier: string;
  hash: string | null;
  email: string;
  name: string;
};

async function fetchIdentity(): Promise<IdentityResponse | null> {
  try {
    const res = await fetch("/api/chatwoot/identity", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    return (await res.json()) as IdentityResponse;
  } catch {
    return null;
  }
}

function loadSdk(baseUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("document undefined"));
      return;
    }
    const existing = document.getElementById(SDK_SCRIPT_ID) as
      | HTMLScriptElement
      | null;
    if (existing) {
      // Już wstrzyknięty — jeśli SDK się załadował to resolve od razu,
      // w przeciwnym razie poczekaj na onload.
      if (window.chatwootSDK) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Chatwoot SDK script failed to load")),
        { once: true },
      );
      return;
    }
    const script = document.createElement("script");
    script.id = SDK_SCRIPT_ID;
    script.src = `${baseUrl.replace(/\/$/, "")}/packs/js/sdk.js`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Chatwoot SDK script failed to load"));
    document.head.appendChild(script);
  });
}

function applyUser(identity: IdentityResponse): void {
  if (typeof window === "undefined" || !window.$chatwoot) return;
  try {
    window.$chatwoot.setUser(identity.identifier, {
      email: identity.email,
      name: identity.name,
      ...(identity.hash ? { identifier_hash: identity.hash } : {}),
    });
    window.$chatwoot.setLocale("pl");
    // Tag konwersacji — ułatwia routing/raportowanie po stronie inbox.
    window.$chatwoot.setLabel("service-consultation");
  } catch {
    // Ignorujemy — błąd SDK nie powinien wywalać UI panelu.
  }
}

export function ChatwootWidget(): null {
  const { status } = useSession();

  useEffect(() => {
    // Mount widget tylko dla zalogowanych userów. /login + /forbidden
    // niech zostają czyste.
    if (status !== "authenticated") return;
    if (typeof window === "undefined") return;

    const baseUrl =
      process.env.NEXT_PUBLIC_CHATWOOT_BASE_URL?.trim() || DEFAULT_BASE_URL;
    const websiteToken =
      process.env.NEXT_PUBLIC_CHATWOOT_SPRZEDAWCA_WEBSITE_TOKEN?.trim() ||
      DEFAULT_WEBSITE_TOKEN;

    let cancelled = false;
    let readyHandler: ((event: Event) => void) | null = null;

    const init = async () => {
      const identity = await fetchIdentity();
      if (cancelled) return;

      try {
        await loadSdk(baseUrl);
      } catch {
        return;
      }
      if (cancelled) return;

      // run() jest idempotentny po stronie Chatwoot dla tego samego
      // websiteToken — drugie wywołanie nie tworzy drugiego widgeta.
      try {
        window.chatwootSDK?.run({
          websiteToken,
          baseUrl,
        });
      } catch {
        return;
      }

      // setUser musi iść PO chatwoot:ready (przed tym `$chatwoot` jest
      // undefined). Jeśli SDK już się załadował (np. soft-navigation),
      // hasLoaded === true i wywołujemy od razu.
      if (window.$chatwoot?.hasLoaded && identity) {
        applyUser(identity);
      } else if (identity) {
        readyHandler = () => {
          if (!cancelled) applyUser(identity);
        };
        window.addEventListener("chatwoot:ready", readyHandler, { once: true });
      }
    };

    void init();

    return () => {
      cancelled = true;
      if (readyHandler) {
        window.removeEventListener("chatwoot:ready", readyHandler);
        readyHandler = null;
      }
      // Świadomie NIE odpinamy skryptu SDK — Chatwoot trzyma singleton.
    };
  }, [status]);

  return null;
}
