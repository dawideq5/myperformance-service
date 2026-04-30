"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiRequestError } from "@/lib/api-client";
import {
  monthGridBounds,
  shiftsToEvents,
  sortEvents,
} from "@/lib/services/calendar-service";
import { calendarService } from "@/app/account/calendar-service";
import {
  kadromierzService,
  moodleService,
} from "@/app/account/account-service";
import type { CalendarEvent } from "@/app/account/types";

interface UseCalendarSourcesArgs {
  googleConnected: boolean;
  kadromierzConnected: boolean;
  moodleConnected: boolean;
  viewDate: Date;
}

/**
 * Owns the four event sources (local, Google, Kadromierz, Moodle) for the
 * account calendar tab. Refetches the visible month on bound changes,
 * exposes a manual `sync` to refresh all sources simultaneously, and offers
 * setters for optimistic updates after create/update/delete.
 */
export function useCalendarSources({
  googleConnected,
  kadromierzConnected,
  moodleConnected,
  viewDate,
}: UseCalendarSourcesArgs) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [kadromierzShifts, setKadromierzShifts] = useState<CalendarEvent[]>(
    [],
  );
  const [moodleEvents, setMoodleEvents] = useState<CalendarEvent[]>([]);
  const [googleMonthEvents, setGoogleMonthEvents] = useState<CalendarEvent[]>(
    [],
  );
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [googleNeedsReconnect, setGoogleNeedsReconnect] = useState(false);
  const [monthSyncing, setMonthSyncing] = useState(false);

  const bounds = useMemo(() => monthGridBounds(viewDate), [viewDate]);
  const boundsKey = `${bounds.from.toISOString()}|${bounds.to.toISOString()}`;

  const watchEnsuredRef = useRef(false);

  const fetchEvents = useCallback(async () => {
    try {
      const { events: data } = await calendarService.list();
      setEvents(sortEvents(data ?? []));
      setLoadError(null);
    } catch (err) {
      if (err instanceof ApiRequestError && err.isUnauthorized) return;
      setLoadError(
        err instanceof Error ? err.message : "Nie udało się pobrać wydarzeń",
      );
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  // Ensure Google watch channel exists exactly once per mount. The channel
  // pushes server-side events into the stored cache; live month-view queries
  // run below without persisting.
  useEffect(() => {
    if (!googleConnected || watchEnsuredRef.current) return;
    watchEnsuredRef.current = true;
    void calendarService.ensureWatch().catch(() => {});
  }, [googleConnected]);

  // Fetch Kadromierz shifts for the visible month whenever viewDate changes
  // or the integration connects. Failures leave the previous state in place.
  useEffect(() => {
    if (!kadromierzConnected) {
      setKadromierzShifts([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const resp = await kadromierzService.getSchedule({
          from: bounds.from.toISOString().slice(0, 10),
          to: bounds.to.toISOString().slice(0, 10),
        });
        if (cancelled) return;
        setKadromierzShifts(shiftsToEvents(resp.shifts ?? []));
      } catch {
        if (!cancelled) setKadromierzShifts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kadromierzConnected, boundsKey]);

  // Fetch Moodle events for the visible month. The backend applies role +
  // provisioning checks; we just pass the range.
  useEffect(() => {
    if (!moodleConnected) {
      setMoodleEvents([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const resp = await moodleService.getEvents({
          from: String(Math.floor(bounds.from.getTime() / 1000)),
          to: String(Math.floor(bounds.to.getTime() / 1000)),
        });
        if (cancelled) return;
        setMoodleEvents(resp.events ?? []);
      } catch {
        if (!cancelled) setMoodleEvents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moodleConnected, boundsKey]);

  // Live Google fetch for the visible month (no persistence). The baseline
  // persisted sync runs on the "Synchronizuj" button below.
  useEffect(() => {
    if (!googleConnected) {
      setGoogleMonthEvents([]);
      setGoogleNeedsReconnect(false);
      return;
    }
    let cancelled = false;
    setMonthSyncing(true);
    (async () => {
      try {
        const result = await calendarService.syncGoogle({
          from: bounds.from.toISOString(),
          to: bounds.to.toISOString(),
          persist: false,
        });
        if (cancelled) return;
        if (result.needsReconnect) {
          setGoogleNeedsReconnect(true);
          setGoogleMonthEvents([]);
        } else {
          setGoogleNeedsReconnect(false);
          setGoogleMonthEvents(result.events ?? []);
        }
      } catch {
        if (!cancelled) {
          setGoogleMonthEvents([]);
        }
      } finally {
        if (!cancelled) setMonthSyncing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleConnected, boundsKey]);

  /**
   * Refresh every connected source for the current month grid. Returns a
   * summary the caller turns into UI feedback. We use Promise.allSettled so
   * one failed source doesn't take down the whole sync.
   */
  const syncAll = useCallback(async (): Promise<{
    refreshedSources: number;
    failedSources: number;
    googleNeedsReconnect: boolean;
    error?: string;
  }> => {
    try {
      const [localRes, googleRes, kadromierzRes, moodleRes] =
        await Promise.allSettled([
          calendarService.list(),
          googleConnected
            ? calendarService.syncGoogle({
                from: bounds.from.toISOString(),
                to: bounds.to.toISOString(),
                persist: false,
              })
            : Promise.resolve(null),
          kadromierzConnected
            ? kadromierzService.getSchedule({
                from: bounds.from.toISOString().slice(0, 10),
                to: bounds.to.toISOString().slice(0, 10),
              })
            : Promise.resolve(null),
          moodleConnected
            ? moodleService.getEvents({
                from: String(Math.floor(bounds.from.getTime() / 1000)),
                to: String(Math.floor(bounds.to.getTime() / 1000)),
              })
            : Promise.resolve(null),
        ]);

      let failedSources = 0;
      let refreshedSources = 1;
      let googleReconnect = false;

      if (localRes.status === "fulfilled") {
        setEvents(sortEvents(localRes.value.events ?? []));
      } else {
        failedSources += 1;
      }

      if (googleConnected) {
        refreshedSources += 1;
        if (googleRes.status === "fulfilled" && googleRes.value) {
          if (googleRes.value.needsReconnect) {
            googleReconnect = true;
            setGoogleNeedsReconnect(true);
            setGoogleMonthEvents([]);
          } else {
            setGoogleNeedsReconnect(false);
            setGoogleMonthEvents(googleRes.value.events ?? []);
          }
        } else {
          failedSources += 1;
          setGoogleMonthEvents([]);
        }
      }

      if (kadromierzConnected) {
        refreshedSources += 1;
        if (kadromierzRes.status === "fulfilled" && kadromierzRes.value) {
          setKadromierzShifts(shiftsToEvents(kadromierzRes.value.shifts ?? []));
        } else {
          failedSources += 1;
          setKadromierzShifts([]);
        }
      }

      if (moodleConnected) {
        refreshedSources += 1;
        if (moodleRes.status === "fulfilled" && moodleRes.value) {
          setMoodleEvents(moodleRes.value.events ?? []);
        } else {
          failedSources += 1;
          setMoodleEvents([]);
        }
      }

      return {
        refreshedSources,
        failedSources,
        googleNeedsReconnect: googleReconnect,
      };
    } catch (err) {
      return {
        refreshedSources: 0,
        failedSources: 1,
        googleNeedsReconnect: false,
        error:
          err instanceof ApiRequestError
            ? err.message
            : "Nie udało się odświeżyć danych kalendarza",
      };
    }
  }, [bounds, googleConnected, kadromierzConnected, moodleConnected]);

  return {
    events,
    setEvents,
    kadromierzShifts,
    setKadromierzShifts,
    moodleEvents,
    setMoodleEvents,
    googleMonthEvents,
    setGoogleMonthEvents,
    initialLoading,
    loadError,
    googleNeedsReconnect,
    setGoogleNeedsReconnect,
    monthSyncing,
    bounds,
    fetchEvents,
    syncAll,
  };
}
