import type { PermissionProvider } from "./providers/types";
import { ChatwootProvider } from "./providers/chatwoot";
import { DirectusProvider } from "./providers/directus";
import { MoodleProvider } from "./providers/moodle";
import { OutlineProvider } from "./providers/outline";

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
  moodle: new MoodleProvider(),
  outline: new OutlineProvider(),
};

export function getProvider(id: string | undefined): PermissionProvider | null {
  if (!id) return null;
  return INSTANCES[id] ?? null;
}

export function listProviders(): PermissionProvider[] {
  return Object.values(INSTANCES);
}
