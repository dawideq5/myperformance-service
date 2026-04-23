"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Clock,
  Coffee,
  Pause,
  Play,
  Plug,
  Square,
} from "lucide-react";

import { Alert, Button, Card } from "@/components/ui";
import { ApiRequestError } from "@/lib/api-client";

import { useAccount } from "@/app/account/AccountProvider";
import {
  kadromierzService,
  type KadromierzAttendance,
  type KadromierzAttendanceBreak,
  type KadromierzShift,
} from "@/app/account/account-service";

type LoadState = "idle" | "loading" | "ready" | "error";

function findOpenBreak(
  attendance: KadromierzAttendance | null,
): KadromierzAttendanceBreak | null {
  if (!attendance?.breaks) return null;
  return attendance.breaks.find((b) => !b.ended_at) ?? null;
}

function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatShiftLabel(shift: KadromierzShift): string {
  try {
    const startT = shift.start.match(/\d{2}:\d{2}/)?.[0] ?? shift.start;
    const endT = shift.end.match(/\d{2}:\d{2}/)?.[0] ?? shift.end;
    return `${startT} – ${endT}`;
  } catch {
    return `${shift.start} – ${shift.end}`;
  }
}

export function KadromierzWorkWidget() {
  const { kadromierzStatus } = useAccount();
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [attendance, setAttendance] = useState<KadromierzAttendance | null>(
    null,
  );
  const [todayShifts, setTodayShifts] = useState<KadromierzShift[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<
    null | "start" | "end" | "break_start" | "break_end"
  >(null);

  const connected = kadromierzStatus?.connected === true;

  const refresh = useCallback(async () => {
    if (!connected) return;
    setLoadState("loading");
    setError(null);
    try {
      const [attResp, schedResp] = await Promise.all([
        kadromierzService.getAttendance(),
        kadromierzService
          .getSchedule({ from: todayISO(), to: todayISO() })
          .catch(() => ({ shifts: [] as KadromierzShift[] })),
      ]);
      setAttendance(attResp.attendance);
      const today = todayISO();
      setTodayShifts(
        (schedResp.shifts ?? []).filter((s) => s.date?.slice(0, 10) === today),
      );
      setLoadState("ready");
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409) {
        setError("Klucz Kadromierz wygasł. Połącz ponownie w ustawieniach.");
      } else {
        setError(
          err instanceof ApiRequestError
            ? err.message
            : "Nie udało się pobrać danych Kadromierza",
        );
      }
      setLoadState("error");
    }
  }, [connected]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleAction = useCallback(
    async (action: "start" | "end" | "break_start" | "break_end") => {
      setPending(action);
      setError(null);
      try {
        let next: { attendance: KadromierzAttendance };
        if (action === "start") {
          next = await kadromierzService.start();
        } else if (action === "end" && attendance) {
          next = await kadromierzService.end(attendance.id);
        } else if (action === "break_start" && attendance) {
          next = await kadromierzService.startBreak(attendance.id);
        } else if (action === "break_end" && attendance) {
          const open = findOpenBreak(attendance);
          if (!open) throw new Error("Nie ma otwartej przerwy");
          next = await kadromierzService.endBreak(attendance.id, open.id);
        } else {
          return;
        }
        setAttendance(next.attendance);
        // Post-clock-out: refresh so any new open shift etc. is picked up.
        if (action === "end") void refresh();
      } catch (err) {
        setError(
          err instanceof ApiRequestError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Operacja nie powiodła się",
        );
      } finally {
        setPending(null);
      }
    },
    [attendance, refresh],
  );

  if (!connected) {
    return (
      <Card padding="md" className="border-orange-500/20">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center flex-shrink-0">
            <Clock className="w-6 h-6 text-orange-500" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-[var(--text-main)]">
              Kadromierz
            </h3>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Połącz swoje konto Kadromierz, aby widzieć grafik i rozpoczynać
              pracę jednym kliknięciem.
            </p>
            <Link
              href="/account?tab=integrations"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] hover:underline"
            >
              <Plug className="w-3.5 h-3.5" aria-hidden="true" />
              Skonfiguruj Kadromierz
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  const isLoading = loadState === "loading" && !attendance;
  const openBreak = findOpenBreak(attendance);
  const working = !!attendance && !attendance.ended_at;
  const onBreak = !!openBreak;
  const noShiftToday = loadState === "ready" && todayShifts.length === 0;

  return (
    <Card padding="md" className="border-orange-500/20">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center flex-shrink-0">
          <Clock className="w-6 h-6 text-orange-500" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-[var(--text-main)]">
            Praca (Kadromierz)
          </h3>
          {isLoading ? (
            <p className="text-sm text-[var(--text-muted)] mt-1">Ładowanie…</p>
          ) : working ? (
            <p className="text-sm text-[var(--text-main)] mt-1">
              {onBreak ? (
                <>
                  <span className="text-orange-500 font-medium">
                    Na przerwie
                  </span>{" "}
                  — rozpoczęta{" "}
                  {openBreak?.started_at
                    ? new Date(openBreak.started_at).toLocaleTimeString(
                        "pl-PL",
                        { hour: "2-digit", minute: "2-digit" },
                      )
                    : ""}
                </>
              ) : (
                <>
                  <span className="text-green-500 font-medium">Pracujesz</span>{" "}
                  {attendance?.started_at
                    ? `od ${new Date(attendance.started_at).toLocaleTimeString(
                        "pl-PL",
                        { hour: "2-digit", minute: "2-digit" },
                      )}`
                    : ""}
                </>
              )}
            </p>
          ) : noShiftToday ? (
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Brak zaplanowanej zmiany na dzisiaj.
            </p>
          ) : todayShifts.length > 0 ? (
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Dzisiejsza zmiana: {todayShifts.map(formatShiftLabel).join(", ")}
            </p>
          ) : (
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Możesz rozpocząć pracę.
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {!working && (
          <Button
            leftIcon={<Play className="w-4 h-4" aria-hidden="true" />}
            loading={pending === "start"}
            onClick={() => void handleAction("start")}
            disabled={pending !== null}
          >
            Rozpocznij pracę
          </Button>
        )}
        {working && !onBreak && (
          <>
            <Button
              variant="secondary"
              leftIcon={<Pause className="w-4 h-4" aria-hidden="true" />}
              loading={pending === "break_start"}
              onClick={() => void handleAction("break_start")}
              disabled={pending !== null}
            >
              Rozpocznij przerwę
            </Button>
            <Button
              leftIcon={<Square className="w-4 h-4" aria-hidden="true" />}
              loading={pending === "end"}
              onClick={() => void handleAction("end")}
              disabled={pending !== null}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Zakończ pracę
            </Button>
          </>
        )}
        {working && onBreak && (
          <Button
            leftIcon={<Coffee className="w-4 h-4" aria-hidden="true" />}
            loading={pending === "break_end"}
            onClick={() => void handleAction("break_end")}
            disabled={pending !== null}
          >
            Wróć z przerwy
          </Button>
        )}
      </div>
    </Card>
  );
}
