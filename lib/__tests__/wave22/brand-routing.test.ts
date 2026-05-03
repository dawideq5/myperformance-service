/**
 * Wave 22 / F19 — regresja brand routing (F1).
 *
 * Krytyczny bug fix: do tej pory wszystkie maile szły z `noreply@myperformance.pl`
 * — także zlecenia z lokacji `caseownia@zlecenieserwisowe.pl`. F1 dodał
 * `lib/services/brand.ts` resolver który wybiera brand na podstawie
 * `service.location.brand` (z fallbackiem do service-location, potem do
 * `mp_branding.default_smtp_profile_slug`).
 *
 * Ten test pinuje całą kaskadę resolverwa — każda zmiana logiki wyboru
 * brandu (np. odwrócenie kolejności) wywali test.
 *
 * Mokujemy `getService`/`getLocation`/`getBranding` (3 zewnętrzne dependency)
 * przez `vi.mock` na poziomie modułu. Cache z `lib/services/brand.ts`
 * resetujemy w `beforeEach` przez `clearBrandCache()`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` jest hoistowane na top pliku, więc zwykłe `const fn = vi.fn()`
// jest niedostępne wewnątrz factory. `vi.hoisted` rozwiązuje TDZ — zmienne
// są tworzone PRZED zaladowaniem modułów testowanych.
const { getServiceMock, getLocationMock, getBrandingMock } = vi.hoisted(() => ({
  getServiceMock: vi.fn(),
  getLocationMock: vi.fn(),
  getBrandingMock: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  getService: getServiceMock,
}));

vi.mock("@/lib/locations", () => ({
  getLocation: getLocationMock,
}));

vi.mock("@/lib/email/db", () => ({
  getBranding: getBrandingMock,
}));

// Import AFTER vi.mock — brand.ts resolves the mocks above.
import {
  clearBrandCache,
  getDefaultEmailBrand,
  layoutSlugForBrand,
  resolveBrandFromLocation,
  resolveBrandFromService,
  senderForBrand,
} from "@/lib/services/brand";

beforeEach(() => {
  clearBrandCache();
  getServiceMock.mockReset();
  getLocationMock.mockReset();
  getBrandingMock.mockReset();
  // Default branding row: explicit "myperformance" default.
  getBrandingMock.mockResolvedValue({ defaultSmtpProfileSlug: "myperformance" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Wave 22 / F1 — brand routing", () => {
  describe("senderForBrand", () => {
    it("returns caseownia@zlecenieserwisowe.pl for zlecenieserwisowe", () => {
      const s = senderForBrand("zlecenieserwisowe");
      expect(s.fromAddress).toBe("caseownia@zlecenieserwisowe.pl");
      expect(s.fromName).toBe("Serwis telefonów by Caseownia");
    });

    it("returns noreply@myperformance.pl for myperformance", () => {
      const s = senderForBrand("myperformance");
      expect(s.fromAddress).toBe("noreply@myperformance.pl");
      expect(s.fromName).toBe("MyPerformance");
    });
  });

  describe("layoutSlugForBrand", () => {
    it("layout slug == brand id (zlecenieserwisowe → 'zlecenieserwisowe' template)", () => {
      expect(layoutSlugForBrand("zlecenieserwisowe")).toBe("zlecenieserwisowe");
      expect(layoutSlugForBrand("myperformance")).toBe("myperformance");
    });
  });

  describe("resolveBrandFromService — kaskada", () => {
    it("zwraca brand z sales location (locationId)", async () => {
      getServiceMock.mockResolvedValue({
        locationId: "loc-sales-1",
        serviceLocationId: "loc-svc-1",
      });
      getLocationMock.mockImplementation(async (id: string) => {
        if (id === "loc-sales-1")
          return { id, brand: "zlecenieserwisowe" as const };
        return { id, brand: "myperformance" as const };
      });

      const brand = await resolveBrandFromService("svc-1");
      expect(brand).toBe("zlecenieserwisowe");
    });

    it("fallback do service location gdy sales nie ma brand", async () => {
      getServiceMock.mockResolvedValue({
        locationId: "loc-sales-2",
        serviceLocationId: "loc-svc-2",
      });
      getLocationMock.mockImplementation(async (id: string) => {
        if (id === "loc-sales-2") return { id, brand: null };
        if (id === "loc-svc-2")
          return { id, brand: "zlecenieserwisowe" as const };
        return null;
      });

      const brand = await resolveBrandFromService("svc-2");
      expect(brand).toBe("zlecenieserwisowe");
    });

    it("fallback do mp_branding.default_smtp_profile_slug gdy żadna lokacja nie ma brand", async () => {
      getServiceMock.mockResolvedValue({
        locationId: "loc-sales-3",
        serviceLocationId: null,
      });
      getLocationMock.mockResolvedValue({ id: "loc-sales-3", brand: null });
      getBrandingMock.mockResolvedValue({
        defaultSmtpProfileSlug: "zlecenieserwisowe",
      });

      const brand = await resolveBrandFromService("svc-3");
      expect(brand).toBe("zlecenieserwisowe");
    });

    it("fallback do 'myperformance' gdy mp_branding nie ma defaultu", async () => {
      getServiceMock.mockResolvedValue({
        locationId: null,
        serviceLocationId: null,
      });
      getBrandingMock.mockResolvedValue({ defaultSmtpProfileSlug: null });

      const brand = await resolveBrandFromService("svc-4");
      expect(brand).toBe("myperformance");
    });

    it("ignoruje nieprawidłowe wartości brand z DB (np. literówka)", async () => {
      getServiceMock.mockResolvedValue({
        locationId: "loc-sales-5",
        serviceLocationId: null,
      });
      getLocationMock.mockResolvedValue({
        id: "loc-sales-5",
        brand: "WRONG_BRAND",
      });
      getBrandingMock.mockResolvedValue({
        defaultSmtpProfileSlug: "myperformance",
      });

      const brand = await resolveBrandFromService("svc-5");
      expect(brand).toBe("myperformance");
    });

    it("cache 5 min — drugie wywołanie nie woła getService ponownie", async () => {
      getServiceMock.mockResolvedValue({
        locationId: "loc-cache",
        serviceLocationId: null,
      });
      getLocationMock.mockResolvedValue({
        id: "loc-cache",
        brand: "zlecenieserwisowe" as const,
      });

      const a = await resolveBrandFromService("svc-cache");
      const b = await resolveBrandFromService("svc-cache");
      expect(a).toBe("zlecenieserwisowe");
      expect(b).toBe("zlecenieserwisowe");
      expect(getServiceMock).toHaveBeenCalledTimes(1);
    });

    it("graceful degradation — exception w getService → default brand", async () => {
      getServiceMock.mockRejectedValue(new Error("DB down"));
      getBrandingMock.mockResolvedValue({
        defaultSmtpProfileSlug: "myperformance",
      });

      const brand = await resolveBrandFromService("svc-err");
      expect(brand).toBe("myperformance");
    });
  });

  describe("resolveBrandFromLocation", () => {
    it("zwraca brand bezpośrednio z lokacji", async () => {
      getLocationMock.mockResolvedValue({
        id: "loc-x",
        brand: "zlecenieserwisowe" as const,
      });
      const brand = await resolveBrandFromLocation("loc-x");
      expect(brand).toBe("zlecenieserwisowe");
    });

    it("null locationId → default brand", async () => {
      getBrandingMock.mockResolvedValue({
        defaultSmtpProfileSlug: "zlecenieserwisowe",
      });
      const brand = await resolveBrandFromLocation(null);
      expect(brand).toBe("zlecenieserwisowe");
      expect(getLocationMock).not.toHaveBeenCalled();
    });
  });

  describe("getDefaultEmailBrand", () => {
    it("czyta defaultSmtpProfileSlug z mp_branding", async () => {
      getBrandingMock.mockResolvedValue({
        defaultSmtpProfileSlug: "zlecenieserwisowe",
      });
      expect(await getDefaultEmailBrand()).toBe("zlecenieserwisowe");
    });

    it("fallback do 'myperformance' gdy mp_branding rzuca", async () => {
      getBrandingMock.mockRejectedValue(new Error("no email DB"));
      expect(await getDefaultEmailBrand()).toBe("myperformance");
    });
  });

  describe("end-to-end regresja (F1 critical bug)", () => {
    it("service z lokacji 'caseownia' → sender = caseownia@zlecenieserwisowe.pl", async () => {
      getServiceMock.mockResolvedValue({
        locationId: "loc-caseownia",
        serviceLocationId: null,
      });
      getLocationMock.mockResolvedValue({
        id: "loc-caseownia",
        name: "Caseownia Tychy",
        brand: "zlecenieserwisowe" as const,
      });

      const brand = await resolveBrandFromService("svc-caseownia");
      const sender = senderForBrand(brand);

      // Główny enterprise wymóg: maile dla brandu Caseownia idą z właściwego From.
      expect(brand).toBe("zlecenieserwisowe");
      expect(sender.fromAddress).toBe("caseownia@zlecenieserwisowe.pl");
    });

    it("service z lokalizacji MyPerformance → sender = noreply@myperformance.pl", async () => {
      getServiceMock.mockResolvedValue({
        locationId: "loc-mp",
        serviceLocationId: null,
      });
      getLocationMock.mockResolvedValue({
        id: "loc-mp",
        name: "MyPerformance Centrala",
        brand: "myperformance" as const,
      });

      const brand = await resolveBrandFromService("svc-mp");
      const sender = senderForBrand(brand);

      expect(brand).toBe("myperformance");
      expect(sender.fromAddress).toBe("noreply@myperformance.pl");
    });
  });
});
