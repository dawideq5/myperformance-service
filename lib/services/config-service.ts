/**
 * Pure helpers + DTO types for the admin config hub. Validators and format
 * helpers live here so panels stay declarative.
 *
 * No fetch logic — panels call /api/admin/* endpoints directly via fetch.
 */

export interface TargetGroupDTO {
  id: string;
  code: string;
  label: string;
  description: string | null;
  unit: string;
  externalCode: string | null;
  sort: number;
  enabled: boolean;
}

export interface TargetThresholdDTO {
  id: string;
  groupId: string;
  label: string | null;
  fromValue: number;
  toValue: number | null;
  value: number;
  color: string | null;
  sort: number;
}

/**
 * Build the POST/PATCH body for a target group. Trims, normalises code to
 * upper case, coerces sort to a number, and folds blank-string fields to
 * null so Directus stores absent values cleanly.
 */
export function buildTargetGroupBody(input: {
  code: string;
  label: string;
  description: string;
  unit: string;
  externalCode: string;
  sort: string;
  enabled: boolean;
}) {
  return {
    code: input.code.trim().toUpperCase(),
    label: input.label.trim(),
    description: input.description.trim() || null,
    unit: input.unit.trim() || "szt",
    externalCode: input.externalCode.trim() || null,
    sort: Number(input.sort) || 0,
    enabled: input.enabled,
  };
}

/**
 * Compose the threshold POST/PATCH body. `toValue === null` means "open
 * upper bound" — preserved verbatim because the backend distinguishes null
 * from 0.
 */
export function buildThresholdBody(t: TargetThresholdDTO) {
  return {
    label: t.label ?? null,
    fromValue: t.fromValue,
    toValue: t.toValue,
    value: t.value,
    color: t.color ?? null,
    sort: t.sort,
  };
}

/**
 * Parse an API error envelope `{ error: { message } }` into a plain string.
 * Falls back to `HTTP <status>` if the body lacks a message — matches the
 * inline pattern previously duplicated across every CRUD branch.
 */
export async function readApiError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return j?.error?.message ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/**
 * A "new" threshold uses a synthetic id `new-<timestamp>` so the dialog can
 * batch-save unsaved rows alongside existing ones in a single click.
 */
export function isNewThresholdId(id: string): boolean {
  return id.startsWith("new-");
}

export function nextThresholdFromValue(items: TargetThresholdDTO[]): number {
  if (items.length === 0) return 0;
  return Math.max(...items.map((t) => t.toValue ?? t.fromValue)) + 1;
}

export const TARGET_GROUP_UNIT_OPTIONS: Array<{
  value: string;
  label: string;
}> = [
  { value: "szt", label: "Sztuki (szt)" },
  { value: "PLN", label: "Złote (PLN)" },
  { value: "kpl", label: "Komplety (kpl)" },
  { value: "h", label: "Godziny (h)" },
  { value: "other", label: "Inne" },
];

export type ConfigTabId =
  | "overview"
  | "links"
  | "locations"
  | "targets"
  | "certs"
  | "pricelist";
