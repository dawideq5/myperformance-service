/**
 * Wave 22 / F1 — brand routing dla maili.
 *
 * Każda lokacja sprzedaży/serwisu ma `brand` (`myperformance` |
 * `zlecenieserwisowe`). Resolver bierze brand z lokacji powiązanej ze
 * zleceniem; jeśli nie ustawione, fallback do `mp_branding.default_smtp_profile_slug`.
 *
 * Wynik resolverwa wybiera:
 *   - SMTP profile (`profileSlug` w `sendMail`)
 *   - Layout (`mp_email_layouts.slug` z DEFAULT_LAYOUT_HTML per brand)
 *   - From: address + display name (dziedziczone ze SMTP profile)
 */
import { getService } from "@/lib/services";
import { getLocation } from "@/lib/locations";
import { getBranding } from "@/lib/email/db";
import { log } from "@/lib/logger";

const logger = log.child({ module: "brand" });

export type EmailBrand = "myperformance" | "zlecenieserwisowe";

const VALID_BRANDS: EmailBrand[] = ["myperformance", "zlecenieserwisowe"];

interface CacheEntry {
  brand: EmailBrand;
  expiresAt: number;
}

const SERVICE_CACHE_TTL_MS = 5 * 60 * 1000;
const serviceCache = new Map<string, CacheEntry>();
let defaultCache: CacheEntry | null = null;

function isValidBrand(v: unknown): v is EmailBrand {
  return typeof v === "string" && (VALID_BRANDS as string[]).includes(v);
}

/** Globalny default — z `mp_branding.default_smtp_profile_slug` z fallbackiem
 * do `myperformance`. Cachowany 5 min. */
export async function getDefaultEmailBrand(): Promise<EmailBrand> {
  if (defaultCache && defaultCache.expiresAt > Date.now()) {
    return defaultCache.brand;
  }
  let brand: EmailBrand = "myperformance";
  try {
    const branding = await getBranding();
    if (isValidBrand(branding?.defaultSmtpProfileSlug)) {
      brand = branding.defaultSmtpProfileSlug;
    }
  } catch (err) {
    logger.warn("brand.default_lookup_failed", { err: String(err) });
  }
  defaultCache = { brand, expiresAt: Date.now() + SERVICE_CACHE_TTL_MS };
  return brand;
}

/** Resolve brand dla zlecenia. Kolejność:
 *   1. service.locationId → location.brand
 *   2. service.serviceLocationId → serviceLocation.brand (fallback gdy
 *      sales location nie ma brand)
 *   3. globalny default
 *
 * Cache 5 min per serviceId. */
export async function resolveBrandFromService(
  serviceId: string,
): Promise<EmailBrand> {
  const cached = serviceCache.get(serviceId);
  if (cached && cached.expiresAt > Date.now()) return cached.brand;

  let brand: EmailBrand | null = null;
  try {
    const service = await getService(serviceId);
    if (service?.locationId) {
      const loc = await getLocation(service.locationId);
      if (isValidBrand(loc?.brand)) brand = loc.brand;
    }
    if (!brand && service?.serviceLocationId) {
      const loc = await getLocation(service.serviceLocationId);
      if (isValidBrand(loc?.brand)) brand = loc.brand;
    }
  } catch (err) {
    logger.warn("brand.service_lookup_failed", {
      serviceId,
      err: String(err),
    });
  }

  if (!brand) brand = await getDefaultEmailBrand();
  serviceCache.set(serviceId, {
    brand,
    expiresAt: Date.now() + SERVICE_CACHE_TTL_MS,
  });
  return brand;
}

/** Resolve brand z lokacji bezpośrednio (gdy serviceId niedostępny — np. w
 * customer-portal OTP gdzie znamy tylko email klienta). */
export async function resolveBrandFromLocation(
  locationId: string | null | undefined,
): Promise<EmailBrand> {
  if (!locationId) return getDefaultEmailBrand();
  try {
    const loc = await getLocation(locationId);
    if (isValidBrand(loc?.brand)) return loc.brand;
  } catch (err) {
    logger.warn("brand.location_lookup_failed", {
      locationId,
      err: String(err),
    });
  }
  return getDefaultEmailBrand();
}

/** Sender info per brand. Profile slugi są zaseed'owane w
 * `lib/email/db/smtp-profiles.ts`. From-address i from-name dziedziczone
 * z SMTP profile, ale czasem callsite chce override (audit/ legacy). */
export function senderForBrand(brand: EmailBrand): {
  fromAddress: string;
  fromName: string;
} {
  if (brand === "zlecenieserwisowe") {
    return {
      fromAddress: "caseownia@zlecenieserwisowe.pl",
      fromName: "Serwis telefonów by Caseownia",
    };
  }
  return {
    fromAddress: "noreply@myperformance.pl",
    fromName: "MyPerformance",
  };
}

/** Layout slug per brand (mp_email_layouts.slug). Fallback do "default" gdy
 * konkretny layout nie istnieje (np. tuż po deployu, przed seed'em). */
export function layoutSlugForBrand(brand: EmailBrand): string {
  return brand;
}

/** Czyść cache — używać po update lokacji (admin UI), albo w testach. */
export function clearBrandCache(): void {
  serviceCache.clear();
  defaultCache = null;
}
