import { withClient } from "@/lib/db";
import { listCertificates } from "@/lib/persistence";
import { listLocations, type Location } from "@/lib/locations";

export interface ConfigOverviewStats {
  locations: {
    total: number;
    sales: number;
    service: number;
    enabled: number;
    geocoded: number;
  };
  certificates: {
    total: number;
    active: number;
    revoked: number;
    expiringSoon: number;
  };
  assignments: {
    totalLinks: number;
    certsWithLocations: number;
    certsWithoutLocations: number;
    locationsWithCerts: number;
    locationsWithoutCerts: number;
  };
}

export async function getConfigOverviewStats(): Promise<ConfigOverviewStats> {
  const [locations, certs, assignmentRows] = await Promise.all([
    listLocations({ enabledOnly: false }),
    listCertificates(),
    withClient(async (c) => {
      const r = await c.query<{ certificate_id: string; location_id: string }>(
        `SELECT certificate_id, location_id::text FROM mp_certificate_locations`,
      );
      return r.rows;
    }).catch(() => [] as Array<{ certificate_id: string; location_id: string }>),
  ]);

  const now = Date.now();
  const expiringWindow = 14 * 24 * 60 * 60 * 1000;

  const activeCerts = certs.filter((c) => !c.revokedAt);
  const expiringSoon = activeCerts.filter((c) => {
    if (!c.notAfter) return false;
    const exp = new Date(c.notAfter).getTime();
    return exp > now && exp - now < expiringWindow;
  }).length;

  const certIds = new Set(assignmentRows.map((r) => r.certificate_id));
  const locIds = new Set(assignmentRows.map((r) => r.location_id));

  return {
    locations: {
      total: locations.length,
      sales: locations.filter((l) => l.type === "sales").length,
      service: locations.filter((l) => l.type === "service").length,
      enabled: locations.filter((l) => l.enabled).length,
      geocoded: locations.filter((l) => l.lat != null && l.lng != null).length,
    },
    certificates: {
      total: certs.length,
      active: activeCerts.length,
      revoked: certs.length - activeCerts.length,
      expiringSoon,
    },
    assignments: {
      totalLinks: assignmentRows.length,
      certsWithLocations: certIds.size,
      certsWithoutLocations: activeCerts.filter((c) => !certIds.has(c.id))
        .length,
      locationsWithCerts: locIds.size,
      locationsWithoutCerts: locations.filter((l) => !locIds.has(l.id))
        .length,
    },
  };
}

export interface CertLinkRow {
  certId: string;
  certSubject: string;
  certEmail: string | null;
  certRoles: string[];
  revoked: boolean;
  notAfter: string | null;
  locations: Pick<Location, "id" | "name" | "warehouseCode" | "type">[];
}

export async function listCertLinks(): Promise<CertLinkRow[]> {
  const [certs, assignmentRows, locations] = await Promise.all([
    listCertificates(),
    withClient(async (c) => {
      const r = await c.query<{ certificate_id: string; location_id: string }>(
        `SELECT certificate_id, location_id::text FROM mp_certificate_locations`,
      );
      return r.rows;
    }).catch(() => [] as Array<{ certificate_id: string; location_id: string }>),
    listLocations({ enabledOnly: false }),
  ]);

  const locById = new Map(locations.map((l) => [l.id, l]));
  const linksByCert = new Map<string, string[]>();
  for (const row of assignmentRows) {
    const arr = linksByCert.get(row.certificate_id) ?? [];
    arr.push(row.location_id);
    linksByCert.set(row.certificate_id, arr);
  }

  return certs.map((c) => {
    const locIds = linksByCert.get(c.id) ?? [];
    const locs = locIds
      .map((lid) => locById.get(lid))
      .filter((x): x is Location => Boolean(x))
      .map((l) => ({
        id: l.id,
        name: l.name,
        warehouseCode: l.warehouseCode,
        type: l.type,
      }));
    return {
      certId: c.id,
      certSubject: c.subject,
      certEmail: c.email,
      certRoles: c.roles ?? (c.role ? [c.role] : []),
      revoked: Boolean(c.revokedAt),
      notAfter: c.notAfter,
      locations: locs,
    };
  });
}
