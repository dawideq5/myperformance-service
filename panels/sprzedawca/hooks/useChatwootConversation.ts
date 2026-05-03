"use client";

/**
 * useChatwootConversation — wykrywa aktywną Chatwoot conversation w panelu
 * sprzedawcy. ChatwootWidget odpala SDK na `<script>` + idle do momentu, gdy
 * sprzedawca otworzy bubble i wyśle/odbierze wiadomość. Wtedy SDK zaczyna
 * emitować `chatwoot:on-message` event na `window`.
 *
 * Strategia detekcji conversation_id (best-effort, wszystkie idempotentne):
 *   1. `chatwoot:on-message` event detail — różne wersje SDK pakują payload
 *      inaczej (`message.conversation_id`, top-level `conversation_id`, lub
 *      cały message object). Próbujemy wszystkich kształtów.
 *   2. Cookie `cw_conversation` (lub `cw-message`) — Chatwoot Web Widget
 *      ustawia po pierwszej wiadomości. Walidacja: signed JWT z claim
 *      `conversation_id`. Decode bez weryfikacji (frontend i tak nie ma
 *      Chatwoot secretu — backend snapshot endpoint potwierdzi rzeczywistość).
 *   3. localStorage `cw_conversation` — fallback w przeglądarkach z
 *      restrykcyjnymi cookies (Safari ITP).
 *
 * Hook zwraca `{ conversationId, hasConversation, source }`. Wartość zostaje
 * stable między re-renderami (useState + setState dopiero przy zmianie).
 *
 * Brak konwersacji → `{ conversationId: null, hasConversation: false }`.
 * Sprzedawca może wtedy disabled'ować przycisk "Rozmowa wideo z serwisantem".
 */

import { useEffect, useState } from "react";

type Source = "event" | "cookie" | "localStorage" | null;

interface State {
  conversationId: number | null;
  hasConversation: boolean;
  source: Source;
}

const INITIAL: State = {
  conversationId: null,
  hasConversation: false,
  source: null,
};

const POLL_MS = 2_000;

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const decoded = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)"),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function extractFromCookie(): number | null {
  const raw = readCookie("cw_conversation");
  if (!raw) return null;
  const payload = decodeJwtPayload(raw);
  if (!payload) return null;
  const candidates = [
    payload.conversation_id,
    payload.source_id,
    payload.id,
  ];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c) && c > 0) {
      return Math.floor(c);
    }
    if (typeof c === "string" && /^\d+$/.test(c)) {
      const n = Number(c);
      if (n > 0) return n;
    }
  }
  return null;
}

function extractFromLocalStorage(): number | null {
  try {
    const raw = window.localStorage.getItem("cw_conversation");
    if (!raw) return null;
    if (/^\d+$/.test(raw)) return Number(raw);
    const payload = decodeJwtPayload(raw);
    if (payload && typeof payload.conversation_id === "number") {
      return payload.conversation_id;
    }
  } catch {
    // localStorage może być niedostępny (private mode, blokada)
  }
  return null;
}

function extractFromEventDetail(detail: unknown): number | null {
  if (!detail || typeof detail !== "object") return null;
  const d = detail as Record<string, unknown>;
  const candidates: unknown[] = [
    d.conversation_id,
    d.conversationId,
    d.id,
    (d.message as Record<string, unknown> | undefined)?.conversation_id,
    (d.data as Record<string, unknown> | undefined)?.conversation_id,
  ];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c) && c > 0) {
      return Math.floor(c);
    }
    if (typeof c === "string" && /^\d+$/.test(c)) {
      const n = Number(c);
      if (n > 0) return n;
    }
  }
  return null;
}

export function useChatwootConversation(): State {
  const [state, setState] = useState<State>(INITIAL);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const update = (next: { id: number | null; source: Source }): void => {
      setState((prev) => {
        if (prev.conversationId === next.id && prev.source === next.source) {
          return prev;
        }
        return {
          conversationId: next.id,
          hasConversation: next.id != null,
          source: next.source,
        };
      });
    };

    const tryCookieAndStorage = (): void => {
      const fromCookie = extractFromCookie();
      if (fromCookie != null) {
        update({ id: fromCookie, source: "cookie" });
        return;
      }
      const fromLs = extractFromLocalStorage();
      if (fromLs != null) {
        update({ id: fromLs, source: "localStorage" });
        return;
      }
      // Brak — utrzymujemy poprzedni state. Nie czyścimy bo SDK potem
      // może pokazać event po nawigacji.
    };

    const onMessage = (event: Event): void => {
      const ce = event as CustomEvent<unknown>;
      const id = extractFromEventDetail(ce.detail);
      if (id != null) {
        update({ id, source: "event" });
      }
    };

    window.addEventListener("chatwoot:on-message", onMessage);

    // Pierwszy odczyt + polling cookies (ITP/3rd-party cookie quirks
    // sprawiają że event może nie odpalić; cookie i tak się ustawia).
    tryCookieAndStorage();
    const id = window.setInterval(tryCookieAndStorage, POLL_MS);

    return () => {
      window.removeEventListener("chatwoot:on-message", onMessage);
      window.clearInterval(id);
    };
  }, []);

  return state;
}
