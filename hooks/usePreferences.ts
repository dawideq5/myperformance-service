"use client";

import { useCallback, useEffect, useState } from "react";
import type { NotifEventKey, UserPreferences } from "@/lib/preferences";

interface CatalogEntry {
  label: string;
  category: string;
  defaultInApp: boolean;
  defaultEmail: boolean;
}

export interface PreferencesPayload {
  prefs: UserPreferences;
  catalog: Record<NotifEventKey, CatalogEntry>;
}

interface State {
  data: PreferencesPayload | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

/**
 * Hook do user-prefs (hints toggle + per-event notification matrix).
 * Cache in-memory na poziomie modułu — kolejne mounty re-używają payload
 * dopóki użytkownik nie odświeży karty.
 */
let cached: PreferencesPayload | null = null;
let inflight: Promise<PreferencesPayload> | null = null;

async function fetchPrefs(): Promise<PreferencesPayload> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    const res = await fetch("/api/account/preferences", {
      credentials: "include",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    cached = json.data as PreferencesPayload;
    return cached;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function usePreferences() {
  const [state, setState] = useState<State>({
    data: cached,
    loading: !cached,
    saving: false,
    error: null,
  });

  useEffect(() => {
    if (cached) {
      setState((s) => ({ ...s, data: cached, loading: false }));
      return;
    }
    let cancelled = false;
    fetchPrefs()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, saving: false, error: null });
      })
      .catch((err) => {
        if (!cancelled)
          setState({ data: null, loading: false, saving: false, error: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback(async (patch: Partial<UserPreferences>) => {
    setState((s) => ({ ...s, saving: true, error: null }));
    try {
      const res = await fetch("/api/account/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const next: PreferencesPayload = {
        prefs: json.data.prefs,
        catalog: cached?.catalog ?? ({} as PreferencesPayload["catalog"]),
      };
      cached = next;
      setState({ data: next, loading: false, saving: false, error: null });
      return next.prefs;
    } catch (err) {
      setState((s) => ({ ...s, saving: false, error: String(err) }));
      throw err;
    }
  }, []);

  return {
    prefs: state.data?.prefs ?? null,
    catalog: state.data?.catalog ?? null,
    loading: state.loading,
    saving: state.saving,
    error: state.error,
    update,
  };
}
