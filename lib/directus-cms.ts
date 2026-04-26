import { getOptionalEnv } from "@/lib/env";
import { log } from "@/lib/logger";

const logger = log.child({ module: "directus-cms" });

/**
 * Directus CMS sync layer. Dashboard pozostaje canonical SoT dla mp_branding
 * i mp_email_templates — Directus dostaje read-only mirror, żeby contentowy
 * zespół widział aktualne wartości w UI Directusa (np. do wglądu lub
 * referencji w innych collectionach).
 *
 * Sync jest jednokierunkowy (push z dashboardu). Edycja w Directusie
 * zostanie nadpisana przy kolejnym sync — to celowe, bo źródło to mp_*.
 */

interface DirectusConfig {
  baseUrl: string;
  token: string;
}

function getConfig(): DirectusConfig | null {
  const baseUrl =
    getOptionalEnv("DIRECTUS_URL") || getOptionalEnv("DIRECTUS_INTERNAL_URL");
  const token =
    getOptionalEnv("DIRECTUS_ADMIN_TOKEN") || getOptionalEnv("DIRECTUS_TOKEN");
  if (!baseUrl || !token) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), token };
}

async function directusFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const cfg = getConfig();
  if (!cfg) throw new Error("Directus is not configured (DIRECTUS_URL + DIRECTUS_ADMIN_TOKEN required)");
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Directus ${init.method ?? "GET"} ${path} → ${res.status} ${body.slice(0, 200)}`,
    );
  }
  if (res.status === 204) return null as T;
  const data = (await res.json()) as { data?: T };
  return (data.data ?? data) as T;
}

interface CollectionSpec {
  collection: string;
  meta?: {
    icon?: string;
    note?: string;
    display_template?: string;
    singleton?: boolean;
  };
  schema?: Record<string, unknown>;
  fields?: Array<{
    field: string;
    type: string;
    schema?: Record<string, unknown>;
    meta?: Record<string, unknown>;
  }>;
}

export async function isConfigured(): Promise<boolean> {
  return getConfig() !== null;
}

/**
 * Tworzy collection w Directusie jeśli nie istnieje. Idempotent.
 */
export async function ensureCollection(spec: CollectionSpec): Promise<void> {
  try {
    await directusFetch(`/collections/${spec.collection}`);
    return; // exists
  } catch {
    // not found — create
  }
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
}

/**
 * Upsert (update lub insert) pojedynczego itemu po kluczu primary.
 * Directus nie ma natywnego upsert — robimy fetch + decyzja.
 */
export async function upsertItem(
  collection: string,
  primaryKey: string,
  item: Record<string, unknown>,
): Promise<void> {
  try {
    await directusFetch(
      `/items/${collection}/${encodeURIComponent(primaryKey)}`,
      { method: "PATCH", body: JSON.stringify(item) },
    );
    return;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("404") && !msg.includes("FORBIDDEN")) {
      throw err;
    }
  }
  await directusFetch(`/items/${collection}`, {
    method: "POST",
    body: JSON.stringify(item),
  });
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

/**
 * Konfiguracja bazowa — kolekcje które dashboard pushuje do Directusa
 * przy `pushAll()`. Dodanie nowej kolekcji = jeden wpis tutaj.
 */
export const COLLECTION_SPECS: CollectionSpec[] = [
  {
    collection: "mp_branding_cms",
    meta: {
      icon: "palette",
      note: "Branding stack-wide (logo, accent, footer). Edytuj w dashboardzie /admin/email.",
      singleton: true,
    },
    fields: [
      {
        field: "id",
        type: "string",
        schema: { is_primary_key: true, has_auto_increment: false },
        meta: { hidden: true, readonly: true },
      },
      {
        field: "logo_url",
        type: "string",
        meta: { interface: "input", readonly: true },
      },
      {
        field: "accent_color",
        type: "string",
        meta: { interface: "select-color", readonly: true },
      },
      {
        field: "footer_html",
        type: "text",
        meta: { interface: "input-rich-text-html", readonly: true },
      },
      {
        field: "synced_at",
        type: "timestamp",
        meta: { interface: "datetime", readonly: true },
      },
    ],
  },
  {
    collection: "mp_email_templates_cms",
    meta: {
      icon: "mail",
      note: "Read-only mirror szablonów Keycloak. Edytuj w dashboardzie /admin/email.",
    },
    fields: [
      {
        field: "id",
        type: "string",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true },
      },
      {
        field: "kind",
        type: "string",
        meta: { interface: "input", readonly: true },
      },
      {
        field: "subject",
        type: "string",
        meta: { interface: "input", readonly: true },
      },
      {
        field: "html",
        type: "text",
        meta: { interface: "input-code", readonly: true, options: { language: "html" } },
      },
      {
        field: "synced_at",
        type: "timestamp",
        meta: { interface: "datetime", readonly: true },
      },
    ],
  },
];
