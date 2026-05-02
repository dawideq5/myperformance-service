import { withClient } from "@/lib/db";
import seedData from "./seed-data.json";
import { log } from "@/lib/logger";

const logger = log.child({ module: "phones" });

export interface PhoneModel {
  id: string;
  brand: string;
  model: string;
  slug: string;
  releaseYear: number | null;
  aliases: string[];
  isActive: boolean;
  sortOrder: number;
}

interface SeedEntry {
  brand: string;
  model: string;
  year?: number;
  aliases?: string[];
}

/**
 * Slug = brand-model przekształcony na lowercase + hyphenated, ASCII only.
 * Przykład: "Apple" + "iPhone 13 Pro Max" → "apple-iphone-13-pro-max".
 */
export function buildSlug(brand: string, model: string): string {
  const raw = `${brand} ${model}`.toLowerCase();
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

let schemaReady = false;

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await withClient(async (c) => {
    await c.query(`
      CREATE TABLE IF NOT EXISTS mp_phone_models (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        brand         TEXT NOT NULL,
        model         TEXT NOT NULL,
        slug          TEXT NOT NULL UNIQUE,
        release_year  INTEGER,
        aliases       JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_active     BOOLEAN NOT NULL DEFAULT true,
        sort_order    INTEGER NOT NULL DEFAULT 0,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS mp_phone_models_brand_idx ON mp_phone_models (brand);
      CREATE INDEX IF NOT EXISTS mp_phone_models_active_idx ON mp_phone_models (is_active);
    `);
  });
  schemaReady = true;
}

export async function seedDefaultPhoneModels(): Promise<{ added: number; total: number }> {
  await ensureSchema();
  const seed = seedData as SeedEntry[];
  let added = 0;
  await withClient(async (c) => {
    for (let i = 0; i < seed.length; i++) {
      const e = seed[i];
      const slug = buildSlug(e.brand, e.model);
      const sortOrder = (3000 - (e.year ?? 2000)) * 100 + i;
      const r = await c.query(
        `INSERT INTO mp_phone_models (brand, model, slug, release_year, aliases, sort_order)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)
         ON CONFLICT (slug) DO NOTHING`,
        [
          e.brand,
          e.model,
          slug,
          e.year ?? null,
          JSON.stringify(e.aliases ?? []),
          sortOrder,
        ],
      );
      if ((r.rowCount ?? 0) > 0) added++;
    }
  });
  const total = (await listPhoneModels()).length;
  if (added > 0) logger.info("seeded phone models", { added, total });
  return { added, total };
}

interface PhoneModelRow {
  id: string;
  brand: string;
  model: string;
  slug: string;
  release_year: number | null;
  aliases: unknown;
  is_active: boolean;
  sort_order: number;
}

function mapRow(r: PhoneModelRow): PhoneModel {
  let aliases: string[] = [];
  if (Array.isArray(r.aliases))
    aliases = r.aliases.filter((x): x is string => typeof x === "string");
  return {
    id: r.id,
    brand: r.brand,
    model: r.model,
    slug: r.slug,
    releaseYear: r.release_year,
    aliases,
    isActive: r.is_active,
    sortOrder: r.sort_order,
  };
}

export async function listPhoneModels(opts: { activeOnly?: boolean } = {}): Promise<PhoneModel[]> {
  await ensureSchema();
  const r = await withClient((c) =>
    c.query<PhoneModelRow>(
      `SELECT id::text, brand, model, slug, release_year, aliases, is_active, sort_order
         FROM mp_phone_models
        ${opts.activeOnly ? "WHERE is_active = true" : ""}
        ORDER BY sort_order, brand, model`,
    ),
  );
  return r.rows.map(mapRow);
}

/**
 * Wyszukiwanie po brand/model/slug/aliases. Pusty query = top N najnowszych.
 * Limit domyślnie 20 — wystarczy dla autocomplete dropdown.
 */
export async function searchPhoneModels(query: string, limit = 20): Promise<PhoneModel[]> {
  await ensureSchema();
  const q = query.trim().toLowerCase();
  if (!q) {
    const r = await withClient((c) =>
      c.query<PhoneModelRow>(
        `SELECT id::text, brand, model, slug, release_year, aliases, is_active, sort_order
           FROM mp_phone_models
          WHERE is_active = true
          ORDER BY sort_order LIMIT $1`,
        [limit],
      ),
    );
    return r.rows.map(mapRow);
  }
  const like = `%${q}%`;
  const r = await withClient((c) =>
    c.query<PhoneModelRow>(
      `SELECT id::text, brand, model, slug, release_year, aliases, is_active, sort_order
         FROM mp_phone_models
        WHERE is_active = true
          AND (LOWER(brand) LIKE $1 OR LOWER(model) LIKE $1
               OR LOWER(slug) LIKE $1
               OR aliases::text ILIKE $1)
        ORDER BY sort_order LIMIT $2`,
      [like, limit],
    ),
  );
  return r.rows.map(mapRow);
}

export async function getPhoneModelBySlug(slug: string): Promise<PhoneModel | null> {
  await ensureSchema();
  const r = await withClient((c) =>
    c.query<PhoneModelRow>(
      `SELECT id::text, brand, model, slug, release_year, aliases, is_active, sort_order
         FROM mp_phone_models WHERE slug = $1 LIMIT 1`,
      [slug],
    ),
  );
  return r.rows[0] ? mapRow(r.rows[0]) : null;
}
