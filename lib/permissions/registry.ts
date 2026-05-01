import type { PermissionProvider } from "./providers/types";
import { ChatwootProvider } from "./providers/chatwoot";
import { DirectusProvider } from "./providers/directus";
import { DocumensoProvider } from "./providers/documenso";
import { MoodleProvider } from "./providers/moodle";
import { OutlineProvider } from "./providers/outline";
import { PostalProvider } from "./providers/postal";
// UWAGA: nie importuj `./kc-sync` na poziomie modułu — `kc-sync` importuje
// `getProvider` z tego pliku, więc dwustronny statyczny import tworzył
// circular dependency objawiający się TDZ ("Cannot access 'B' before
// initialization") podczas `next build` w fazie collect-page-data.
// Startupowy bootstrap KC odbywa się teraz w `instrumentation.ts`
// poprzez `await import("@/lib/permissions/kc-sync")` — dynamiczny import
// jest bezpieczny, bo wykonuje się dopiero po pełnej inicjalizacji modułu.

/**
 * Runtime registry natywnych providerów (config-driven).
 *
 * Wpis (`ProviderEntry`) deklaruje id + factory (lazy instancjonowanie) +
 * opcjonalną flagę `required`. Faza 4 wave 1 — fundament pod externalizację
 * konfiguracji w wave 2.
 *
 * Area z `areas.ts` mają `nativeProviderId` wskazujący tutaj. Gdy area jest
 * `keycloak-only` → provider nie istnieje (undefined) i cała logika żyje
 * wyłącznie w realmie KC.
 *
 * Lazy semantics: `factory()` jest wywoływane przy `getProvider()` /
 * `listConfiguredProviders()`. Na chwilę obecną instancjonowanie jest tanie
 * (pool DB powstaje dopiero przy pierwszej operacji), ale architektura
 * pozwala dodać caching gdy będzie trzeba.
 */
export interface ProviderEntry {
  id: string;
  factory: () => PermissionProvider;
  /**
   * Gdy `true` — brak konfiguracji (env vars) dla tego providera traktowany
   * jako fatal przy starcie. Domyślnie `false` (provider opcjonalny).
   */
  required?: boolean;
}

export const PROVIDER_REGISTRY: ProviderEntry[] = [
  { id: "chatwoot", factory: () => new ChatwootProvider() },
  { id: "directus", factory: () => new DirectusProvider() },
  { id: "documenso", factory: () => new DocumensoProvider() },
  { id: "moodle", factory: () => new MoodleProvider() },
  { id: "outline", factory: () => new OutlineProvider() },
  { id: "postal", factory: () => new PostalProvider() },
];

/**
 * Cache instancji providerów. Factory jest wywoływane raz per id — kolejne
 * `getProvider` zwraca tę samą instancję (zachowanie zgodne z poprzednim
 * `INSTANCES` recordem).
 */
const INSTANCE_CACHE: Map<string, PermissionProvider> = new Map();

function instantiate(entry: ProviderEntry): PermissionProvider {
  const cached = INSTANCE_CACHE.get(entry.id);
  if (cached) return cached;
  const inst = entry.factory();
  INSTANCE_CACHE.set(entry.id, inst);
  return inst;
}

// Enterprise KC sync (tworzenie realm roles + composite groups na podstawie
// AREAS + provider-dynamic roles) jest startowany z `instrumentation.ts`
// — po pełnym zainicjalizowaniu modułów, bez ryzyka TDZ.
// Pozostawiamy honorowanie `IAM_SKIP_STARTUP_SYNC=1` po tej drugiej stronie.

/**
 * Zwraca providera po id. Returns null gdy:
 *  - id nieznane (brak w `PROVIDER_REGISTRY`),
 *  - id puste/undefined (np. area `keycloak-only` bez `nativeProviderId`),
 *  - provider nie jest skonfigurowany (`isConfigured()` zwraca false) —
 *    callers traktują to jako "integracja niedostępna".
 */
export function getProvider(id: string | undefined | null): PermissionProvider | null {
  if (!id) return null;
  const entry = PROVIDER_REGISTRY.find((e) => e.id === id);
  if (!entry) return null;
  const inst = instantiate(entry);
  return inst.isConfigured() ? inst : null;
}

/**
 * Lista wszystkich providerów które mają komplet env vars. Używane przez
 * /api/admin/iam/diagnostics (overview wszystkich integracji) i przez
 * reconcile job (pętla po app'kach do drift detection).
 */
export function listConfiguredProviders(): PermissionProvider[] {
  return PROVIDER_REGISTRY.map((entry) => instantiate(entry)).filter((p) => p.isConfigured());
}

/**
 * Lista wszystkich providerów (skonfigurowanych i nie). Używane głównie
 * przez panel diagnostyczny żeby pokazać "Documenso: brak DOCUMENSO_DB_URL".
 */
export function listAllProviders(): PermissionProvider[] {
  return PROVIDER_REGISTRY.map((entry) => instantiate(entry));
}

/**
 * Backwards-compat alias dla `listAllProviders()`. Stare call-sites mogły
 * używać tej nazwy — zostawiamy dla łagodnego refactoringu (deprecated).
 *
 * @deprecated Use `listConfiguredProviders()` lub `listAllProviders()`.
 */
export function listProviders(): PermissionProvider[] {
  return listAllProviders();
}
