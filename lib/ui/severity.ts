/**
 * Centralizacja kolorów + label'i severity. Wcześniej zdefiniowane lokalnie
 * w 3 plikach (SecurityClient, IntelBlocksPanel, EventMapPanel) z drobnymi
 * różnicami → niespójne stylowanie. Single source of truth.
 */

export type Severity = "info" | "low" | "medium" | "high" | "critical";

/** Mapping severity → tone Badge'a / Alert'a (z naszego UI lib). */
export const SEVERITY_BADGE_TONE: Record<
  Severity,
  "neutral" | "info" | "warning" | "danger"
> = {
  info: "info",
  low: "neutral",
  medium: "warning",
  high: "danger",
  critical: "danger",
};

/** Hex kolor dla wykresów / markers / SVG. */
export const SEVERITY_HEX: Record<Severity, string> = {
  info: "#64748b", // slate
  low: "#3b82f6", // blue
  medium: "#f59e0b", // amber
  high: "#f97316", // orange
  critical: "#ef4444", // red
};

/** Label PL dla UI. */
export const SEVERITY_LABEL: Record<Severity, string> = {
  info: "Info",
  low: "Niski",
  medium: "Średni",
  high: "Wysoki",
  critical: "Krytyczny",
};

/** Risk score band (0-100) → severity-like. */
export type RiskBand = "low" | "medium" | "high" | "critical";

export const RISK_BAND_LABEL: Record<RiskBand, string> = {
  low: "Niskie",
  medium: "Średnie",
  high: "Wysokie",
  critical: "Krytyczne",
};

export const RISK_BAND_BADGE_TONE: Record<
  RiskBand,
  "success" | "warning" | "danger"
> = {
  low: "success",
  medium: "warning",
  high: "warning",
  critical: "danger",
};

/** Border-l Tailwind class dla Card'a oznaczającego severity. */
export const RISK_BAND_BORDER: Record<RiskBand, string> = {
  low: "border-l-emerald-500",
  medium: "border-l-amber-500",
  high: "border-l-orange-500",
  critical: "border-l-red-500",
};

/** Score (0-100) → band. */
export function bandFromScore(score: number): RiskBand {
  if (score >= 80) return "critical";
  if (score >= 50) return "high";
  if (score >= 20) return "medium";
  return "low";
}

/** Numeric rank dla sortowania (info=0, critical=4). */
export const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};
