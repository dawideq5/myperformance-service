import { getOptionalEnv } from "@/lib/env";
import { log } from "@/lib/logger";
import type { DirectusConfig } from "./types";

/**
 * Directus REST client wrapper. Czyta konfigurację z env (DIRECTUS_URL +
 * DIRECTUS_ADMIN_TOKEN) i opakowuje fetch z autoryzacją + parsowaniem `data`.
 */

export const logger = log.child({ module: "directus-cms" });

export function getConfig(): DirectusConfig | null {
  const baseUrl =
    getOptionalEnv("DIRECTUS_URL") || getOptionalEnv("DIRECTUS_INTERNAL_URL");
  const token =
    getOptionalEnv("DIRECTUS_ADMIN_TOKEN") || getOptionalEnv("DIRECTUS_TOKEN");
  if (!baseUrl || !token) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), token };
}

export async function directusFetch<T = unknown>(
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

export async function isConfigured(): Promise<boolean> {
  return getConfig() !== null;
}
