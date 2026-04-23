import type { PermissionProvider } from "./providers/types";
import { ChatwootProvider } from "./providers/chatwoot";
import { DirectusProvider } from "./providers/directus";
import { DocumensoProvider } from "./providers/documenso";
import { MoodleProvider } from "./providers/moodle";
import { OutlineProvider } from "./providers/outline";
import { PostalProvider } from "./providers/postal";
import { scheduleStartupKcSync } from "./kc-sync";

/**
 * Runtime registry natywnych providerów.
 *
 * Area z `areas.ts` mają `nativeProviderId` wskazujący tutaj. Gdy area jest
 * `keycloak-only` → provider nie istnieje (undefined) i cała logika żyje
 * wyłącznie w realmie KC.
 */
const INSTANCES: Record<string, PermissionProvider> = {
  chatwoot: new ChatwootProvider(),
  directus: new DirectusProvider(),
  documenso: new DocumensoProvider(),
  moodle: new MoodleProvider(),
  outline: new OutlineProvider(),
  postal: new PostalProvider(),
};

// Enterprise KC sync — tworzy realm roles + composite groups na podstawie
// AREAS + provider-dynamic roles. Non-blocking, non-fatal. Wywoływane
// jednokrotnie przy pierwszym imporcie tego modułu (czyli de facto przy
// pierwszym użyciu warstwy permissions).
if (typeof process !== "undefined" && process.env.IAM_SKIP_STARTUP_SYNC !== "1") {
  scheduleStartupKcSync();
}

export function getProvider(id: string | undefined): PermissionProvider | null {
  if (!id) return null;
  return INSTANCES[id] ?? null;
}

export function listProviders(): PermissionProvider[] {
  return Object.values(INSTANCES);
}
