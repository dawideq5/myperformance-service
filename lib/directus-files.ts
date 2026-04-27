import { getOptionalEnv } from "@/lib/env";
import { log } from "@/lib/logger";

const logger = log.child({ module: "directus-files" });

interface DirectusFolder {
  id: string;
  name: string;
}

interface DirectusFile {
  id: string;
  filename_download: string;
  type?: string;
  folder?: string | null;
}

function getConfig(): { baseUrl: string; token: string; dashboardUrl: string } | null {
  const baseUrl =
    getOptionalEnv("DIRECTUS_INTERNAL_URL") || getOptionalEnv("DIRECTUS_URL");
  const token =
    getOptionalEnv("DIRECTUS_ADMIN_TOKEN") || getOptionalEnv("DIRECTUS_TOKEN");
  // Dashboard URL — używany do generowania absolutnych URL-i do proxy
  // `/api/public/photos/{id}`. Panele (sprzedawca/serwisant) mają osobny
  // origin, więc photos URL musi wskazywać na dashboard.
  const dashboardUrl =
    getOptionalEnv("DASHBOARD_URL") ||
    getOptionalEnv("NEXT_PUBLIC_APP_URL") ||
    getOptionalEnv("NEXTAUTH_URL") ||
    "https://myperformance.pl";
  if (!baseUrl || !token) return null;
  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    token,
    dashboardUrl: dashboardUrl.replace(/\/$/, ""),
  };
}

const FOLDER_NAME = "locations";

/**
 * Find or create folder w Directus Files. Idempotent — przy pierwszym uploadzie
 * tworzy "locations" folder, kolejne reusue.
 */
async function ensureLocationsFolder(): Promise<string | null> {
  const cfg = getConfig();
  if (!cfg) return null;
  try {
    const existing = await fetch(
      `${cfg.baseUrl}/folders?filter[name][_eq]=${FOLDER_NAME}&limit=1`,
      { headers: { Authorization: `Bearer ${cfg.token}` }, cache: "no-store" },
    );
    if (existing.ok) {
      const data = (await existing.json()) as { data?: DirectusFolder[] };
      if (data.data && data.data.length > 0) return data.data[0].id;
    }
    const created = await fetch(`${cfg.baseUrl}/folders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: FOLDER_NAME }),
    });
    if (created.ok) {
      const data = (await created.json()) as { data?: DirectusFolder };
      return data.data?.id ?? null;
    }
  } catch (err) {
    logger.warn("ensureLocationsFolder failed", { err: String(err) });
  }
  return null;
}

export interface UploadedPhoto {
  id: string;
  url: string;
  filename: string;
}

/**
 * Upload zdjęcia do Directus Files w folderze "locations".
 * Zwraca publiczny URL `${DASHBOARD_URL}/api/public/photos/{file_id}` gotowy
 * do zapisania w mp_locations.photos[]. Dashboard proxy strumieniuje plik
 * z Directus admin tokenem (Directus public role nie ma read na files).
 */
export async function uploadLocationPhoto(args: {
  file: Blob;
  filename: string;
  mimeType: string;
  uploaderEmail?: string | null;
}): Promise<UploadedPhoto> {
  const cfg = getConfig();
  if (!cfg) throw new Error("Directus is not configured");

  const folderId = await ensureLocationsFolder();

  // Directus /files akceptuje multipart/form-data.
  const fd = new FormData();
  if (folderId) fd.set("folder", folderId);
  if (args.uploaderEmail) {
    // metadata: upload_user / description — kto wgrał (audit)
    fd.set("description", `Uploaded by ${args.uploaderEmail}`);
  }
  // File field musi być LAST w multipart (Directus quirk).
  fd.set("file", args.file, args.filename);

  const res = await fetch(`${cfg.baseUrl}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}` },
    body: fd,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Directus upload ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { data?: DirectusFile };
  const fileId = data.data?.id;
  if (!fileId) throw new Error("Directus did not return file ID");

  return {
    id: fileId,
    url: `${cfg.dashboardUrl}/api/public/photos/${fileId}`,
    filename: args.filename,
  };
}
