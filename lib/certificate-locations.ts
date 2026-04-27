import { withClient } from "@/lib/db";
import { log } from "@/lib/logger";
import { listLocationsByIds, type Location } from "@/lib/locations";

const logger = log.child({ module: "certificate-locations" });

/**
 * Many-to-many mapping cert ↔ punkty. Cert klienta może być wystawiony na
 * jeden lub więcej punktów (sklepów/serwisów). Po loginie:
 *   - 1 punkt → auto-redirect na panel z wybranym punktem
 *   - >1 → strona wyboru z mapą + listą
 *
 * Schema:
 *   - certificate_id (FK do issued_certificates.id)
 *   - location_id (UUID z Directus mp_locations)
 *   - assigned_at, assigned_by
 *   - PK (certificate_id, location_id)
 */

let schemaReady = false;

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await withClient(async (c) => {
    await c.query(`
      CREATE TABLE IF NOT EXISTS mp_certificate_locations (
        certificate_id TEXT NOT NULL,
        location_id    UUID NOT NULL,
        assigned_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        assigned_by    TEXT,
        PRIMARY KEY (certificate_id, location_id)
      );
      CREATE INDEX IF NOT EXISTS mp_cert_loc_cert_idx
        ON mp_certificate_locations (certificate_id);
      CREATE INDEX IF NOT EXISTS mp_cert_loc_loc_idx
        ON mp_certificate_locations (location_id);
    `);
  });
  schemaReady = true;
}

export async function getLocationIdsForCertificate(
  certId: string,
): Promise<string[]> {
  await ensureSchema();
  return withClient(async (c) => {
    const r = await c.query<{ location_id: string }>(
      `SELECT location_id::text FROM mp_certificate_locations WHERE certificate_id = $1`,
      [certId],
    );
    return r.rows.map((row) => row.location_id);
  });
}

export async function getLocationsForCertificate(
  certId: string,
): Promise<Location[]> {
  const ids = await getLocationIdsForCertificate(certId);
  if (ids.length === 0) return [];
  return listLocationsByIds(ids);
}

export async function setCertificateLocations(args: {
  certificateId: string;
  locationIds: string[];
  assignedBy: string;
}): Promise<void> {
  await ensureSchema();
  await withClient(async (c) => {
    await c.query("BEGIN");
    try {
      await c.query(
        `DELETE FROM mp_certificate_locations WHERE certificate_id = $1`,
        [args.certificateId],
      );
      for (const lid of args.locationIds) {
        await c.query(
          `INSERT INTO mp_certificate_locations (certificate_id, location_id, assigned_by)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [args.certificateId, lid, args.assignedBy],
        );
      }
      await c.query("COMMIT");
    } catch (err) {
      await c.query("ROLLBACK");
      throw err;
    }
  });
  logger.info("certificate locations updated", {
    certificateId: args.certificateId,
    count: args.locationIds.length,
  });
}

/**
 * Zwraca wszystkie aktywne (nie-revoked, nie-expired) punkty do których
 * user ma cert. Używane w panel launcher żeby zdecydować:
 *   - 0 → brak certu (pokazuj "Pobierz certyfikat")
 *   - 1 → auto-redirect na panel?location=ID
 *   - >1 → strona wyboru z mapą
 */
export async function getActiveLocationsForUser(args: {
  email: string;
  panelType?: "sales" | "service" | string;
}): Promise<Location[]> {
  await ensureSchema();
  const ids = await withClient(async (c) => {
    const r = await c.query<{ location_id: string }>(
      `SELECT DISTINCT cl.location_id::text
         FROM mp_certificate_locations cl
         JOIN issued_certificates c ON c.id = cl.certificate_id
        WHERE LOWER(c.email) = LOWER($1)
          AND c.revoked_at IS NULL
          AND (c.not_after IS NULL OR c.not_after > now())`,
      [args.email],
    );
    return r.rows.map((row) => row.location_id);
  });
  if (ids.length === 0) return [];
  const locations = await listLocationsByIds(ids);
  if (args.panelType === "sales" || args.panelType === "service") {
    return locations.filter((l) => l.type === args.panelType);
  }
  return locations;
}
