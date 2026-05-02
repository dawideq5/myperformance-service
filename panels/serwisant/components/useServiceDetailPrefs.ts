"use client";

/**
 * Wave 20 / Faza 1G — hook do fetchowania + persystencji preferencji
 * Service detail view (kolejność/widoczność zakładek, density, font-size,
 * default landing tab).
 *
 * - Fetch on mount → `/api/relay/account/preferences/serwisant-detail` (GET)
 * - PATCH debounced 500ms — pojedyncze zapisanie po szybkich zmianach UI
 * - Optimistic update — UI nie czeka na odpowiedź serwera
 *
 * Defaultowe wartości pozostają w pamięci do czasu pierwszego fetchu —
 * komponent renderuje od razu, prefs ładują się asynchronicznie.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DensityValue,
  FontSizeValue,
  ViewSettingsValue,
} from "./ViewSettingsModal";

export const DEFAULT_VIEW_SETTINGS: ViewSettingsValue = {
  tabOrder: [],
  tabVisibility: {},
  density: "comfortable",
  fontSize: "normal",
  defaultLandingTab: "diagnoza",
};

interface RawPrefs {
  tabOrder?: string[] | null;
  tabVisibility?: Record<string, boolean>;
  density?: DensityValue;
  fontSize?: FontSizeValue;
  defaultLandingTab?: string;
}

interface ApiResponse {
  data?: { prefs?: RawPrefs };
}

const ENDPOINT = "/api/relay/account/preferences/serwisant-detail";

export function useServiceDetailPrefs(): {
  value: ViewSettingsValue;
  ready: boolean;
  setValue: (next: ViewSettingsValue) => void;
  reset: () => void;
} {
  const [value, setValueState] = useState<ViewSettingsValue>(DEFAULT_VIEW_SETTINGS);
  const [ready, setReady] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const skipNextSaveRef = useRef(false);

  // Fetch initial.
  useEffect(() => {
    let cancelled = false;
    fetch(ENDPOINT, { method: "GET" })
      .then(async (r) => {
        if (!r.ok) return null;
        return (await r.json().catch(() => null)) as ApiResponse | null;
      })
      .then((j) => {
        if (cancelled) return;
        const p = j?.data?.prefs;
        if (p) {
          skipNextSaveRef.current = true;
          setValueState({
            tabOrder: Array.isArray(p.tabOrder) ? p.tabOrder : [],
            tabVisibility:
              p.tabVisibility && typeof p.tabVisibility === "object"
                ? p.tabVisibility
                : {},
            density: p.density ?? DEFAULT_VIEW_SETTINGS.density,
            fontSize: p.fontSize ?? DEFAULT_VIEW_SETTINGS.fontSize,
            defaultLandingTab:
              p.defaultLandingTab ?? DEFAULT_VIEW_SETTINGS.defaultLandingTab,
          });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist (debounced).
  useEffect(() => {
    if (!ready) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      const body = {
        tabOrder: value.tabOrder.length > 0 ? value.tabOrder : null,
        tabVisibility: value.tabVisibility,
        density: value.density,
        fontSize: value.fontSize,
        defaultLandingTab: value.defaultLandingTab,
      };
      fetch(ENDPOINT, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => undefined);
    }, 500);
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [value, ready]);

  const setValue = useCallback((next: ViewSettingsValue) => {
    setValueState(next);
  }, []);

  const reset = useCallback(() => {
    setValueState(DEFAULT_VIEW_SETTINGS);
  }, []);

  return { value, ready, setValue, reset };
}
