import {
  createItem,
  deleteItem,
  isConfigured as directusConfigured,
  listItems,
  updateItem,
} from "@/lib/directus-cms";
import { log } from "@/lib/logger";

const logger = log.child({ module: "target-groups" });

export type TargetUnit = "szt" | "PLN" | "kpl" | "h" | "other" | string;

export interface TargetGroup {
  id: string;
  code: string;
  label: string;
  description: string | null;
  unit: TargetUnit;
  externalCode: string | null;
  sort: number;
  enabled: boolean;
}

export interface TargetThreshold {
  id: string;
  groupId: string;
  label: string | null;
  fromValue: number;
  toValue: number | null;
  value: number;
  color: string | null;
  sort: number;
}

interface TargetGroupRow {
  id: string;
  code: string;
  label: string;
  description: string | null;
  unit: string | null;
  external_code: string | null;
  sort: number | null;
  enabled: boolean;
}

interface TargetThresholdRow {
  id: string;
  group: string;
  label: string | null;
  from_value: number | string | null;
  to_value: number | string | null;
  value: number | string;
  color: string | null;
  sort: number | null;
}

function toNum(v: number | string | null | undefined, fallback = 0): number {
  if (v == null) return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function mapGroup(r: TargetGroupRow): TargetGroup {
  return {
    id: r.id,
    code: r.code,
    label: r.label,
    description: r.description ?? null,
    unit: (r.unit ?? "szt") as TargetUnit,
    externalCode: r.external_code ?? null,
    sort: r.sort ?? 0,
    enabled: r.enabled !== false,
  };
}

function mapThreshold(r: TargetThresholdRow): TargetThreshold {
  return {
    id: r.id,
    groupId: r.group,
    label: r.label ?? null,
    fromValue: toNum(r.from_value, 0),
    toValue: r.to_value == null ? null : toNum(r.to_value),
    value: toNum(r.value, 0),
    color: r.color ?? null,
    sort: r.sort ?? 0,
  };
}

export async function listTargetGroups(): Promise<TargetGroup[]> {
  if (!(await directusConfigured())) return [];
  try {
    const rows = await listItems<TargetGroupRow>("mp_target_groups", {
      "sort": "sort",
      "limit": 200,
    });
    return rows.map(mapGroup);
  } catch (err) {
    logger.warn("listTargetGroups failed", { err: String(err) });
    return [];
  }
}

export async function listTargetThresholds(
  groupId?: string,
): Promise<TargetThreshold[]> {
  if (!(await directusConfigured())) return [];
  try {
    const query: Record<string, string | number> = {
      sort: "from_value",
      limit: 1000,
    };
    if (groupId) query["filter[group][_eq]"] = groupId;
    const rows = await listItems<TargetThresholdRow>(
      "mp_target_thresholds",
      query,
    );
    return rows.map(mapThreshold);
  } catch (err) {
    logger.warn("listTargetThresholds failed", { err: String(err) });
    return [];
  }
}

export interface TargetGroupInput {
  code: string;
  label: string;
  description?: string | null;
  unit?: TargetUnit;
  externalCode?: string | null;
  sort?: number;
  enabled?: boolean;
}

export function validateTargetGroup(input: Partial<TargetGroupInput>): string[] {
  const errors: string[] = [];
  if (!input.code || !/^[A-Z0-9_]{2,32}$/.test(input.code))
    errors.push('Code: 2-32 znaki, A-Z 0-9 _');
  if (!input.label || input.label.trim().length < 2)
    errors.push("Label: min 2 znaki");
  return errors;
}

function groupInputToDirectus(input: TargetGroupInput): Record<string, unknown> {
  return {
    code: input.code,
    label: input.label,
    description: input.description ?? null,
    unit: input.unit ?? "szt",
    external_code: input.externalCode ?? null,
    sort: input.sort ?? 0,
    enabled: input.enabled !== false,
  };
}

export async function createTargetGroup(
  input: TargetGroupInput,
): Promise<TargetGroup> {
  const errors = validateTargetGroup(input);
  if (errors.length > 0) throw new Error(errors.join("; "));
  const created = await createItem<TargetGroupRow>(
    "mp_target_groups",
    groupInputToDirectus(input),
  );
  return mapGroup(created);
}

export async function updateTargetGroup(
  id: string,
  input: Partial<TargetGroupInput>,
): Promise<TargetGroup> {
  const patch: Record<string, unknown> = {};
  if (input.code !== undefined) patch.code = input.code;
  if (input.label !== undefined) patch.label = input.label;
  if (input.description !== undefined)
    patch.description = input.description ?? null;
  if (input.unit !== undefined) patch.unit = input.unit;
  if (input.externalCode !== undefined)
    patch.external_code = input.externalCode ?? null;
  if (input.sort !== undefined) patch.sort = input.sort;
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  const updated = await updateItem<TargetGroupRow>(
    "mp_target_groups",
    id,
    patch,
  );
  return mapGroup(updated);
}

export async function deleteTargetGroup(id: string): Promise<void> {
  // Cascade delete progi tej grupy najpierw — Directus M2O nie ma
  // automatic cascade w naszym schemacie.
  const thresholds = await listTargetThresholds(id);
  await Promise.all(
    thresholds.map((t) => deleteItem("mp_target_thresholds", t.id)),
  );
  await deleteItem("mp_target_groups", id);
}

export interface TargetThresholdInput {
  groupId: string;
  label?: string | null;
  fromValue: number;
  toValue?: number | null;
  value: number;
  color?: string | null;
  sort?: number;
}

export function validateTargetThreshold(
  input: Partial<TargetThresholdInput>,
): string[] {
  const errors: string[] = [];
  if (!input.groupId) errors.push("groupId required");
  if (input.fromValue == null || !Number.isFinite(input.fromValue))
    errors.push("fromValue: liczba wymagana");
  if (input.toValue != null && !Number.isFinite(input.toValue))
    errors.push("toValue: musi być liczbą");
  if (
    input.fromValue != null &&
    input.toValue != null &&
    input.toValue < input.fromValue
  )
    errors.push("toValue >= fromValue");
  if (input.value == null || !Number.isFinite(input.value))
    errors.push("value: liczba wymagana");
  return errors;
}

function thresholdInputToDirectus(
  input: TargetThresholdInput,
): Record<string, unknown> {
  return {
    group: input.groupId,
    label: input.label ?? null,
    from_value: input.fromValue,
    to_value: input.toValue ?? null,
    value: input.value,
    color: input.color ?? null,
    sort: input.sort ?? 0,
  };
}

export async function createTargetThreshold(
  input: TargetThresholdInput,
): Promise<TargetThreshold> {
  const errors = validateTargetThreshold(input);
  if (errors.length > 0) throw new Error(errors.join("; "));
  const created = await createItem<TargetThresholdRow>(
    "mp_target_thresholds",
    thresholdInputToDirectus(input),
  );
  return mapThreshold(created);
}

export async function updateTargetThreshold(
  id: string,
  input: Partial<TargetThresholdInput>,
): Promise<TargetThreshold> {
  const patch: Record<string, unknown> = {};
  if (input.groupId !== undefined) patch.group = input.groupId;
  if (input.label !== undefined) patch.label = input.label ?? null;
  if (input.fromValue !== undefined) patch.from_value = input.fromValue;
  if (input.toValue !== undefined) patch.to_value = input.toValue ?? null;
  if (input.value !== undefined) patch.value = input.value;
  if (input.color !== undefined) patch.color = input.color ?? null;
  if (input.sort !== undefined) patch.sort = input.sort;
  const updated = await updateItem<TargetThresholdRow>(
    "mp_target_thresholds",
    id,
    patch,
  );
  return mapThreshold(updated);
}

export async function deleteTargetThreshold(id: string): Promise<void> {
  await deleteItem("mp_target_thresholds", id);
}
