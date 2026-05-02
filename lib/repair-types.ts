import {
  createItem,
  deleteItem,
  isConfigured as directusConfigured,
  listItems,
  updateItem,
} from "@/lib/directus-cms";
import { listPricelist, matchesPricelist, type PricelistItem } from "@/lib/pricelist";
import { log } from "@/lib/logger";

const logger = log.child({ module: "repair-types" });

export type CombinableMode = "yes" | "no" | "only_with" | "except";
export type TimeUnit = "minutes" | "hours" | "days";

export interface RepairType {
  id: string;
  code: string;
  label: string;
  /** Kategoria UI — np. "Wyświetlacze", "Baterie", "Czyszczenie". Cennik
   * grupuje pozycje po category z tej tabeli (deduplikowane Set). */
  category: string;
  icon: string;
  color: string;
  description: string | null;
  defaultWarrantyMonths: number | null;
  timeMin: number | null;
  timeMax: number | null;
  timeUnit: TimeUnit;
  combinableMode: CombinableMode;
  combinableWith: string[];
  sumsMode: CombinableMode;
  sumsWith: string[];
  isActive: boolean;
  sortOrder: number;
}

interface RepairTypeRow {
  id: string;
  code: string;
  label: string;
  category: string | null;
  icon: string | null;
  color: string | null;
  description: string | null;
  default_warranty_months: number | null;
  time_min: number | null;
  time_max: number | null;
  time_unit: string | null;
  combinable_mode: string | null;
  combinable_with: string[] | string | null;
  sums_mode: string | null;
  sums_with: string[] | string | null;
  is_active: boolean | null;
  sort_order: number | null;
}

function parseJsonList(v: string[] | string | null | undefined): string[] {
  if (Array.isArray(v)) return v.filter((s) => typeof s === "string");
  if (typeof v === "string" && v.trim().length > 0) {
    try {
      const arr = JSON.parse(v);
      return Array.isArray(arr) ? arr.filter((s) => typeof s === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapRow(r: RepairTypeRow): RepairType {
  return {
    id: r.id,
    code: r.code,
    label: r.label,
    category: (r.category ?? "Inne").trim() || "Inne",
    icon: r.icon ?? "Wrench",
    color: r.color ?? "#3b82f6",
    description: r.description ?? null,
    defaultWarrantyMonths: r.default_warranty_months ?? null,
    timeMin: r.time_min ?? null,
    timeMax: r.time_max ?? null,
    timeUnit: ((r.time_unit ?? "minutes") as TimeUnit),
    combinableMode: ((r.combinable_mode ?? "yes") as CombinableMode),
    combinableWith: parseJsonList(r.combinable_with),
    sumsMode: ((r.sums_mode ?? "yes") as CombinableMode),
    sumsWith: parseJsonList(r.sums_with),
    isActive: r.is_active !== false,
    sortOrder: r.sort_order ?? 0,
  };
}

export async function listRepairTypes(opts: { activeOnly?: boolean } = {}): Promise<
  RepairType[]
> {
  if (!(await directusConfigured())) return [];
  const query: Record<string, string | number> = {
    sort: "sort_order,label",
    limit: 500,
  };
  if (opts.activeOnly) query["filter[is_active][_eq]"] = "true";
  try {
    const rows = await listItems<RepairTypeRow>("mp_repair_types", query);
    return rows.map(mapRow);
  } catch (err) {
    logger.warn("listRepairTypes failed", { err: String(err) });
    return [];
  }
}

export async function getRepairTypeByCode(
  code: string,
): Promise<RepairType | null> {
  if (!(await directusConfigured())) return null;
  try {
    const rows = await listItems<RepairTypeRow>("mp_repair_types", {
      "filter[code][_eq]": code,
      limit: 1,
    });
    return rows[0] ? mapRow(rows[0]) : null;
  } catch {
    return null;
  }
}

export interface RepairTypeInput {
  code: string;
  label: string;
  category?: string;
  icon?: string;
  color?: string;
  description?: string | null;
  defaultWarrantyMonths?: number | null;
  timeMin?: number | null;
  timeMax?: number | null;
  timeUnit?: TimeUnit;
  combinableMode?: CombinableMode;
  combinableWith?: string[];
  sumsMode?: CombinableMode;
  sumsWith?: string[];
  isActive?: boolean;
  sortOrder?: number;
}

function inputToRow(input: Partial<RepairTypeInput>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.code !== undefined) patch.code = input.code;
  if (input.label !== undefined) patch.label = input.label;
  if (input.category !== undefined) patch.category = input.category;
  if (input.icon !== undefined) patch.icon = input.icon;
  if (input.color !== undefined) patch.color = input.color;
  if (input.description !== undefined) patch.description = input.description;
  if (input.defaultWarrantyMonths !== undefined)
    patch.default_warranty_months = input.defaultWarrantyMonths;
  if (input.timeMin !== undefined) patch.time_min = input.timeMin;
  if (input.timeMax !== undefined) patch.time_max = input.timeMax;
  if (input.timeUnit !== undefined) patch.time_unit = input.timeUnit;
  if (input.combinableMode !== undefined)
    patch.combinable_mode = input.combinableMode;
  if (input.combinableWith !== undefined)
    patch.combinable_with = input.combinableWith;
  if (input.sumsMode !== undefined) patch.sums_mode = input.sumsMode;
  if (input.sumsWith !== undefined) patch.sums_with = input.sumsWith;
  if (input.isActive !== undefined) patch.is_active = input.isActive;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  return patch;
}

export function validateRepairType(
  input: Partial<RepairTypeInput>,
): string[] {
  const errors: string[] = [];
  if (!input.code || !/^[A-Z0-9_]{2,40}$/.test(input.code))
    errors.push("Kod: 2-40 znaków, A-Z 0-9 _");
  if (!input.label?.trim()) errors.push("Etykieta wymagana");
  if (input.timeMin != null && input.timeMax != null && input.timeMax < input.timeMin)
    errors.push("Czas max musi być >= czas min");
  return errors;
}

export async function createRepairType(
  input: RepairTypeInput,
): Promise<RepairType> {
  const errors = validateRepairType(input);
  if (errors.length > 0) throw new Error(errors.join("; "));
  const created = await createItem<RepairTypeRow>(
    "mp_repair_types",
    inputToRow(input) as Partial<RepairTypeRow>,
  );
  return mapRow(created);
}

export async function updateRepairType(
  id: string,
  input: Partial<RepairTypeInput>,
): Promise<RepairType> {
  const updated = await updateItem<RepairTypeRow>(
    "mp_repair_types",
    id,
    inputToRow(input),
  );
  return mapRow(updated);
}

export async function deleteRepairType(id: string): Promise<void> {
  await deleteItem("mp_repair_types", id);
}

/** Wyciąga kody repair_types z description zlecenia. Description zawiera
 * etykiety polskie rozdzielone " · " (zob. serializeRepairTypes w panelu).
 * Mapowanie label.toLowerCase() → code z `types`. Nieznane fragmenty są
 * pomijane (np. wpisy "Inne: <user text>"). */
export function extractRepairCodesFromDescription(
  description: string | null | undefined,
  types: RepairType[],
): string[] {
  if (!description?.trim()) return [];
  const labelToCode = new Map(
    types.map((t) => [t.label.toLowerCase(), t.code]),
  );
  const parts = description.split(/[·,]/).map((s) => s.trim()).filter(Boolean);
  const codes: string[] = [];
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower.startsWith("inne:") || lower === "inne") continue;
    const code = labelToCode.get(lower);
    if (code) codes.push(code);
  }
  return [...new Set(codes)];
}

// === Quote computation ===

export interface QuoteLine {
  code: string;
  label: string;
  price: number | null;
  warrantyMonths: number | null;
}

export interface Quote {
  /** Linie wyceny — po jednej dla każdego kodu naprawy w żądaniu. */
  lines: QuoteLine[];
  /** Razem (gdy wszystkie kody mają sumowanie + wszystkie ceny dostępne). */
  total: number | null;
  /** Gdy true — kombinacja wymaga indywidualnej wyceny przez serwisanta.
   * UI powinno schować pole z kwotą i pokazać komunikat. */
  contactServiceman: boolean;
  /** Powód kontaktu z serwisantem (gdy contactServiceman=true). */
  reason: string | null;
  /** Walidacyjne błędy combinable rules (zestaw nielegalny). */
  combinationErrors: string[];
}

/** Sprawdza zestaw kodów napraw przeciw combinable rules. */
export function validateCombination(
  codes: string[],
  types: RepairType[],
): string[] {
  if (codes.length <= 1) return [];
  const byCode = new Map(types.map((t) => [t.code, t]));
  const errors: string[] = [];
  for (const code of codes) {
    const t = byCode.get(code);
    if (!t) continue;
    const others = codes.filter((c) => c !== code);
    switch (t.combinableMode) {
      case "no":
        errors.push(
          `${t.label} nie może być łączona z innymi naprawami w jednym zleceniu.`,
        );
        break;
      case "only_with": {
        const allowed = new Set(t.combinableWith);
        const blocked = others.filter((c) => !allowed.has(c));
        if (blocked.length > 0) {
          const names = blocked
            .map((c) => byCode.get(c)?.label ?? c)
            .join(", ");
          errors.push(
            `${t.label} może być łączona tylko z wybranymi naprawami; konflikt: ${names}.`,
          );
        }
        break;
      }
      case "except": {
        const blocked = new Set(t.combinableWith);
        const conflict = others.filter((c) => blocked.has(c));
        if (conflict.length > 0) {
          const names = conflict
            .map((c) => byCode.get(c)?.label ?? c)
            .join(", ");
          errors.push(`${t.label} nie łączy się z: ${names}.`);
        }
        break;
      }
      default:
        break;
    }
  }
  return [...new Set(errors)];
}

/** Sprawdza czy w danej kombinacji ceny są sumowane czy wymagają kontaktu
 * z serwisantem. Zwraca {sums: true, ...} gdy wszystkie kody mają sumsMode
 * pasujący, false gdy choć jeden wymaga indywidualnej wyceny. */
export function checkSumsCombination(
  codes: string[],
  types: RepairType[],
): { sums: boolean; reason: string | null } {
  if (codes.length <= 1) return { sums: true, reason: null };
  const byCode = new Map(types.map((t) => [t.code, t]));
  for (const code of codes) {
    const t = byCode.get(code);
    if (!t) continue;
    const others = codes.filter((c) => c !== code);
    switch (t.sumsMode) {
      case "no":
        return {
          sums: false,
          reason: `${t.label}: skontaktuj się z serwisantem w celu ustalenia kwoty zlecenia.`,
        };
      case "only_with": {
        const allowed = new Set(t.sumsWith);
        const violating = others.filter((c) => !allowed.has(c));
        if (violating.length > 0) {
          return {
            sums: false,
            reason: `${t.label}: kombinacja wymaga indywidualnej wyceny przez serwisanta.`,
          };
        }
        break;
      }
      case "except": {
        const blocked = new Set(t.sumsWith);
        const violating = others.filter((c) => blocked.has(c));
        if (violating.length > 0) {
          return {
            sums: false,
            reason: `${t.label}: skontaktuj się z serwisantem dla tej kombinacji napraw.`,
          };
        }
        break;
      }
      default:
        break;
    }
  }
  return { sums: true, reason: null };
}

/** Compute quote from repair codes + device. Łączy mp_repair_types z mp_pricelist.
 * Pricelist linkowany przez `repair_type_code` (1:1 do mp_repair_types.code);
 * legacy fallback przez pricelist.code (gdy starsza pozycja bez FK). */
export async function computeQuote(
  codes: string[],
  device: {
    brand?: string | null;
    model?: string | null;
    phoneModelSlug?: string | null;
  } = {},
): Promise<Quote> {
  const types = await listRepairTypes({ activeOnly: true });
  const pricelist = await listPricelist({ enabledOnly: true });
  return computeQuoteSync(codes, device, types, pricelist);
}

/** Sync version (przyjmuje pre-fetched data) — używane przez API
 * endpoint który już ma listę types/pricelist w cache. */
export function computeQuoteSync(
  codes: string[],
  device: {
    brand?: string | null;
    model?: string | null;
    phoneModelSlug?: string | null;
  },
  types: RepairType[],
  pricelist: PricelistItem[],
): Quote {
  const byCode = new Map(types.map((t) => [t.code, t]));
  const lines: QuoteLine[] = codes.map((code) => {
    const t = byCode.get(code);
    const matches = pricelist.filter(
      (p) =>
        (p.repairTypeCode === code || p.code === code) &&
        matchesPricelist(p, device),
    );
    matches.sort((a, b) => {
      // Preferuj pozycje z dopasowanym phoneModelSlug, potem brand+model.
      const ax =
        (a.phoneModelSlug ? 4 : 0) + (a.brand ? 2 : 0) + (a.modelPattern ? 1 : 0);
      const bx =
        (b.phoneModelSlug ? 4 : 0) + (b.brand ? 2 : 0) + (b.modelPattern ? 1 : 0);
      return bx - ax;
    });
    const price = matches[0]?.price ?? null;
    return {
      code,
      label: t?.label ?? code,
      price,
      warrantyMonths:
        matches[0]?.warrantyMonths ?? t?.defaultWarrantyMonths ?? null,
    };
  });
  const combinationErrors = validateCombination(codes, types);
  const { sums, reason } = checkSumsCombination(codes, types);
  let total: number | null = null;
  if (sums) {
    const allHavePrice = lines.every((l) => l.price != null);
    if (allHavePrice) {
      total = lines.reduce((sum, l) => sum + (l.price ?? 0), 0);
    }
  }
  return {
    lines,
    total,
    contactServiceman: !sums,
    reason,
    combinationErrors,
  };
}

/** Zwraca listę pozycji wyceny (label + price z pricelist) na podstawie
 * description zlecenia i urządzenia. Używane przez generator PDF — żeby
 * potwierdzenie pokazywało zestawienie cen identyczne z wyceną w panelu. */
export async function getPriceLinesForService(
  description: string | null | undefined,
  device: { brand?: string | null; model?: string | null } = {},
): Promise<{ label: string; price: number }[]> {
  const types = await listRepairTypes({ activeOnly: true });
  const codes = extractRepairCodesFromDescription(description, types);
  if (codes.length === 0) return [];
  const pricelist = await listPricelist({ enabledOnly: true });
  const byCode = new Map(types.map((t) => [t.code, t]));
  const lines: { label: string; price: number }[] = [];
  for (const code of codes) {
    const t = byCode.get(code);
    const matches = pricelist.filter(
      (p) => p.code === code && matchesPricelist(p, device),
    );
    matches.sort((a, b) => {
      const ax = (a.brand ? 1 : 0) + (a.modelPattern ? 1 : 0);
      const bx = (b.brand ? 1 : 0) + (b.modelPattern ? 1 : 0);
      return bx - ax;
    });
    const price = matches[0]?.price;
    if (price == null) continue; // pozycja bez ceny — pomiń
    lines.push({ label: t?.label ?? code, price });
  }
  return lines;
}

// === Seed default repair types ===

/** Domyślny katalog 17 typów napraw. Seed-owany przy startupie jeśli baza pusta.
 * Reguły combinable/sums:
 *   EXPERTISE: combinable=no (wyłączna naprawa).
 *   CLEANING: combinable=yes, sums=yes (każda kombinacja sumuje).
 *   Inne wymiany (display, battery, ...): combinable=yes (można łączyć w
 *   jedno zlecenie), sums=only_with[CLEANING] (z czyszczeniem sumuje, z
 *   inną wymianą = kontakt z serwisantem dla zniżki/oferty).
 */
export const DEFAULT_REPAIR_TYPES: RepairTypeInput[] = [
  {
    code: "EXPERTISE",
    label: "Ekspertyza",
    category: "Diagnostyka",
    icon: "ClipboardList",
    color: "#06B6D4",
    defaultWarrantyMonths: null,
    timeMin: 30,
    timeMax: 120,
    timeUnit: "minutes",
    combinableMode: "no",
    sumsMode: "no",
    sortOrder: 1,
  },
  {
    code: "SCREEN_REPLACEMENT",
    label: "Wymiana wyświetlacza",
    category: "Wyświetlacze",
    icon: "Smartphone",
    color: "#3b82f6",
    defaultWarrantyMonths: 6,
    timeMin: 1,
    timeMax: 3,
    timeUnit: "days",
    combinableMode: "yes",
    sumsMode: "yes",
    sortOrder: 10,
  },
  {
    code: "BATTERY_REPLACEMENT",
    label: "Wymiana baterii",
    category: "Baterie",
    icon: "Battery",
    color: "#22c55e",
    defaultWarrantyMonths: 6,
    timeMin: 1,
    timeMax: 2,
    timeUnit: "days",
    combinableMode: "yes",
    sumsMode: "yes",
    sortOrder: 20,
  },
  {
    code: "CHARGING_PORT_REPLACEMENT",
    label: "Wymiana gniazda ładowania",
    category: "Gniazda",
    icon: "Cable",
    color: "#f59e0b",
    defaultWarrantyMonths: 3,
    timeMin: 1,
    timeMax: 3,
    timeUnit: "days",
    combinableMode: "yes",
    sumsMode: "yes",
    sortOrder: 30,
  },
  {
    code: "EARPIECE_SPEAKER_REPLACEMENT",
    label: "Wymiana głośnika rozmów",
    category: "Audio",
    icon: "Volume2",
    color: "#a855f7",
    defaultWarrantyMonths: 3,
    timeMin: 1,
    timeMax: 2,
    timeUnit: "days",
    combinableMode: "yes",
    sumsMode: "yes",
    sortOrder: 40,
  },
  {
    code: "MEDIA_SPEAKER_REPLACEMENT",
    label: "Wymiana głośnika multimedialnego",
    category: "Audio",
    icon: "Speaker",
    color: "#a855f7",
    defaultWarrantyMonths: 3,
    timeMin: 1,
    timeMax: 2,
    timeUnit: "days",
    combinableMode: "yes",
    sumsMode: "yes",
    sortOrder: 50,
  },
  {
    code: "BACK_PANEL_REPLACEMENT",
    label: "Wymiana panelu tylnego",
    category: "Obudowy",
    icon: "TabletSmartphone",
    color: "#ef4444",
    defaultWarrantyMonths: 3,
    timeMin: 1,
    timeMax: 3,
    timeUnit: "days",
    combinableMode: "yes",
    sumsMode: "yes",
    sortOrder: 60,
  },
  {
    code: "FRAME_REPLACEMENT",
    label: "Wymiana korpusu",
    category: "Obudowy",
    icon: "Wrench",
    color: "#ef4444",
    defaultWarrantyMonths: 3,
    timeMin: 2,
    timeMax: 5,
    timeUnit: "days",
    combinableMode: "yes",
    sumsMode: "yes",
    sortOrder: 70,
  },
  {
    code: "CAMERA_GLASS_REPLACEMENT",
    label: "Wymiana szkła aparatu",
    category: "Aparaty",
    icon: "Camera",
    color: "#3b82f6",
    defaultWarrantyMonths: 3,
    timeMin: 1,
    timeMax: 2,
    timeUnit: "days",
    combinableMode: "yes",
    sumsMode: "yes",
    sortOrder: 80,
  },
  {
    code: "SOFTWARE_FAULT",
    label: "Usterka oprogramowania",
    category: "Software",
    icon: "Code",
    color: "#06B6D4",
    defaultWarrantyMonths: null,
    timeMin: 1,
    timeMax: 3,
    timeUnit: "days",
    combinableMode: "yes",
    sumsMode: "yes",
    sortOrder: 90,
  },
  {
    code: "SIM_SD_SLOT",
    label: "Gniazdo SIM/SD",
    category: "Gniazda",
    icon: "PackageOpen",
    color: "#f59e0b",
    defaultWarrantyMonths: 3,
    timeMin: 1,
    timeMax: 2,
    timeUnit: "days",
    combinableMode: "yes",
    sumsMode: "yes",
    sortOrder: 100,
  },
  {
    code: "MICROPHONE_REPLACEMENT",
    label: "Wymiana mikrofonu",
    category: "Audio",
    icon: "Mic",
    color: "#a855f7",
    defaultWarrantyMonths: 3,
    timeMin: 1,
    timeMax: 2,
    timeUnit: "days",
    combinableMode: "yes",
    sumsMode: "yes",
    sortOrder: 110,
  },
  {
    code: "SIM_TRAY_REPLACEMENT",
    label: "Wymiana tacki SIM",
    category: "Gniazda",
    icon: "PackageOpen",
    color: "#f59e0b",
    defaultWarrantyMonths: 1,
    timeMin: 30,
    timeMax: 120,
    timeUnit: "minutes",
    combinableMode: "yes",
    sumsMode: "yes",
    sortOrder: 120,
  },
  {
    code: "DATA_RECOVERY",
    label: "Odzysk danych",
    category: "Software",
    icon: "Database",
    color: "#06B6D4",
    defaultWarrantyMonths: null,
    timeMin: 1,
    timeMax: 7,
    timeUnit: "days",
    combinableMode: "yes",
    sumsMode: "yes",
    sortOrder: 130,
  },
  {
    code: "UNKNOWN_LOCK",
    label: "Nieznany wzór/kod blokady",
    category: "Software",
    icon: "KeyRound",
    color: "#ef4444",
    defaultWarrantyMonths: null,
    timeMin: 1,
    timeMax: 14,
    timeUnit: "days",
    combinableMode: "yes",
    sumsMode: "yes",
    sortOrder: 140,
  },
  {
    code: "FRP_GOOGLE",
    label: "FRP (usunięcie blokady Google)",
    category: "Software",
    icon: "Shield",
    color: "#ef4444",
    defaultWarrantyMonths: null,
    timeMin: 1,
    timeMax: 7,
    timeUnit: "days",
    combinableMode: "yes",
    sumsMode: "yes",
    sortOrder: 150,
  },
  {
    code: "CLEANING",
    label: "Czyszczenie urządzenia",
    category: "Czyszczenie",
    icon: "Sparkles",
    color: "#22c55e",
    defaultWarrantyMonths: null,
    timeMin: 30,
    timeMax: 60,
    timeUnit: "minutes",
    combinableMode: "yes",
    sumsMode: "yes",
    sortOrder: 160,
  },
  {
    code: "OTHER",
    label: "Inne",
    category: "Inne",
    icon: "HelpCircle",
    color: "#64748b",
    defaultWarrantyMonths: null,
    combinableMode: "yes",
    sumsMode: "yes",
    sortOrder: 999,
  },
];

/** Seed default repair types do bazy. Idempotent — pomija gdy code istnieje. */
export async function seedDefaultRepairTypes(): Promise<{
  created: number;
  skipped: number;
}> {
  if (!(await directusConfigured())) return { created: 0, skipped: 0 };
  const existing = await listRepairTypes();
  const existingCodes = new Set(existing.map((t) => t.code));
  let created = 0;
  let skipped = 0;
  for (const def of DEFAULT_REPAIR_TYPES) {
    if (existingCodes.has(def.code)) {
      skipped++;
      continue;
    }
    try {
      await createRepairType(def);
      created++;
    } catch (err) {
      logger.warn("seedDefaultRepairTypes: create failed", {
        code: def.code,
        err: String(err),
      });
    }
  }
  if (created > 0) {
    logger.info("seedDefaultRepairTypes ok", { created, skipped });
  }
  return { created, skipped };
}
