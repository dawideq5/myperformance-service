import { directusFetch, logger } from "./client";
import type { CollectionSpec } from "./types";

/**
 * CRUD na poziomie kolekcji + items. Wszystkie operacje są idempotentne lub
 * tolerują 404 (deleteItem). ensureCollection reconciles meta + fields z
 * pojedynczego CollectionSpec — używane przy starcie dashboardu do bootstrapu
 * Directus schema.
 */

/**
 * Tworzy collection w Directusie jeśli nie istnieje. Idempotent.
 */
export async function ensureCollection(spec: CollectionSpec): Promise<void> {
  let exists = true;
  try {
    await directusFetch(`/collections/${spec.collection}`);
  } catch {
    exists = false;
  }

  if (!exists) {
    await directusFetch(`/collections`, {
      method: "POST",
      body: JSON.stringify({
        collection: spec.collection,
        meta: {
          icon: "settings",
          note: "Read-only mirror z dashboard MyPerformance — edytuj w /admin/email",
          ...(spec.meta ?? {}),
        },
        schema: spec.schema ?? {},
        fields: spec.fields ?? [],
      }),
    });
    logger.info("Directus collection created", { collection: spec.collection });
    return;
  }

  // Collection istnieje — reconcile meta + fields. Bez tego DIR-5 polish
  // (display_template, sort_field, archive_field, dropdown choices itd.)
  // nigdy nie trafiłby do produkcji, bo przy starcie kolekcje już istnieją.
  if (spec.meta) {
    await directusFetch(`/collections/${spec.collection}`, {
      method: "PATCH",
      body: JSON.stringify({ meta: spec.meta }),
    }).catch((err) => {
      logger.warn("collection meta patch failed", {
        collection: spec.collection,
        err: String(err),
      });
    });
  }

  if (spec.fields && spec.fields.length > 0) {
    let existingFieldNames = new Set<string>();
    try {
      const fields = await directusFetch<Array<{ field: string }>>(
        `/fields/${spec.collection}`,
      );
      existingFieldNames = new Set(fields.map((f) => f.field));
    } catch {
      // Brak możliwości pobrania pól — robimy POST zawsze, niech Directus
      // sam zwróci konflikt jeśli pole istnieje (i wtedy spadnie do PATCH).
    }

    for (const field of spec.fields) {
      const isPrimary =
        field.schema && (field.schema as { is_primary_key?: boolean }).is_primary_key === true;
      // Primary keys: skip — istnieją od momentu create collection, PATCH na
      // PK jest niebezpieczny (Directus odrzuca zmianę typu/specials).
      if (isPrimary) continue;

      if (existingFieldNames.has(field.field)) {
        // PATCH — tylko meta + schema (type rzadko się zmienia, a Directus
        // odrzuca zmianę typu na pełnej kolumnie z danymi).
        await directusFetch(
          `/fields/${spec.collection}/${field.field}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              meta: field.meta ?? {},
              ...(field.schema ? { schema: field.schema } : {}),
            }),
          },
        ).catch((err) => {
          logger.warn("field patch failed", {
            collection: spec.collection,
            field: field.field,
            err: String(err),
          });
        });
      } else {
        await directusFetch(`/fields/${spec.collection}`, {
          method: "POST",
          body: JSON.stringify(field),
        }).catch((err) => {
          logger.warn("field create failed", {
            collection: spec.collection,
            field: field.field,
            err: String(err),
          });
        });
      }
    }
  }

  logger.info("Directus collection reconciled", { collection: spec.collection });
}

/**
 * Upsert (update lub insert) pojedynczego itemu po kluczu primary.
 *
 * Directus quirk: PATCH na non-existent item zwraca 204 (success, no content)
 * ALE nic nie tworzy — to nie jest natywny upsert. Trzeba sprawdzić
 * istnienie pierwsze przez GET. Inny fix: try POST najpierw (insert),
 * jeśli 400 z "RECORD_NOT_UNIQUE" → PATCH. Idziemy POST-first bo szybsze
 * dla idempotent seedów (tylko 1 request gdy item istnieje, 1 dla insert).
 */
export async function upsertItem(
  collection: string,
  primaryKey: string,
  item: Record<string, unknown>,
): Promise<void> {
  // Try POST insert
  try {
    await directusFetch(`/items/${collection}`, {
      method: "POST",
      body: JSON.stringify(item),
    });
    return;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // 400 RECORD_NOT_UNIQUE / "primary key" → existing item, fallback PATCH
    if (
      msg.includes("RECORD_NOT_UNIQUE") ||
      msg.includes("primary") ||
      msg.includes("400") ||
      msg.includes("409")
    ) {
      await directusFetch(
        `/items/${collection}/${encodeURIComponent(primaryKey)}`,
        { method: "PATCH", body: JSON.stringify(item) },
      );
      return;
    }
    throw err;
  }
}

/**
 * Create item w collection. Zwraca utworzony obiekt z auto-generated PK.
 * Dla idempotent seeds użyj `upsertItem` zamiast (próbuje POST + fallback
 * PATCH). createItem jest dla user-driven create (np. admin POST z UI).
 */
export async function createItem<T = Record<string, unknown>>(
  collection: string,
  item: Record<string, unknown>,
): Promise<T> {
  return directusFetch<T>(`/items/${collection}`, {
    method: "POST",
    body: JSON.stringify(item),
  });
}

/**
 * Update item w collection (PATCH). Zwraca zaktualizowany obiekt.
 * Directus partial update — wystarczy podać tylko pola które się zmieniły.
 */
export async function updateItem<T = Record<string, unknown>>(
  collection: string,
  primaryKey: string,
  item: Record<string, unknown>,
): Promise<T> {
  return directusFetch<T>(
    `/items/${collection}/${encodeURIComponent(primaryKey)}`,
    { method: "PATCH", body: JSON.stringify(item) },
  );
}

export async function deleteItem(
  collection: string,
  primaryKey: string,
): Promise<void> {
  try {
    await directusFetch(
      `/items/${collection}/${encodeURIComponent(primaryKey)}`,
      { method: "DELETE" },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("404")) return; // already gone
    throw err;
  }
}

export async function listItems<T = unknown>(
  collection: string,
  query: Record<string, string | number> = {},
): Promise<T[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) qs.set(k, String(v));
  const path = `/items/${collection}${qs.toString() ? `?${qs.toString()}` : ""}`;
  return directusFetch<T[]>(path);
}
