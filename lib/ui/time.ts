/**
 * Polski relative time formatter. Zwraca "2h temu", "wczoraj 14:30",
 * "5 dni temu" itd. Idea: w ListView pokazujemy relative dla świeżych
 * zdarzeń + tooltip z pełną datą po hover.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export function formatRelative(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const now = Date.now();
  const diff = now - date.getTime();

  if (diff < 0) {
    // future
    return "za " + formatDiff(-diff);
  }
  if (diff < MINUTE) return "przed chwilą";
  if (diff < HOUR) {
    const m = Math.floor(diff / MINUTE);
    return `${m} ${plural(m, "minuta", "minuty", "minut")} temu`;
  }
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    return `${h} ${plural(h, "godzina", "godziny", "godzin")} temu`;
  }
  if (diff < 2 * DAY) {
    return `wczoraj ${date.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}`;
  }
  if (diff < WEEK) {
    const d = Math.floor(diff / DAY);
    return `${d} ${plural(d, "dzień", "dni", "dni")} temu`;
  }
  // > 7 dni — data formatowana
  return date.toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "short",
    ...(date.getFullYear() !== new Date().getFullYear() && {
      year: "numeric",
    }),
  });
}

export function formatAbsolute(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return date.toLocaleString("pl-PL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const lastDigit = n % 10;
  const last2 = n % 100;
  if (last2 >= 12 && last2 <= 14) return many;
  if (lastDigit >= 2 && lastDigit <= 4) return few;
  return many;
}

function formatDiff(ms: number): string {
  if (ms < HOUR) {
    const m = Math.max(1, Math.floor(ms / MINUTE));
    return `${m} ${plural(m, "minuta", "minuty", "minut")}`;
  }
  if (ms < DAY) {
    const h = Math.floor(ms / HOUR);
    return `${h} ${plural(h, "godzina", "godziny", "godzin")}`;
  }
  const d = Math.floor(ms / DAY);
  return `${d} ${plural(d, "dzień", "dni", "dni")}`;
}
