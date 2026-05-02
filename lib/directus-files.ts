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
const SERVICE_PHOTOS_FOLDER = "service-photos";
const SERVICE_INVOICES_FOLDER = "service-invoices";

/**
 * Find or create folder w Directus Files (idempotent).
 */
async function ensureFolderByName(name: string): Promise<string | null> {
  const cfg = getConfig();
  if (!cfg) return null;
  try {
    const existing = await fetch(
      `${cfg.baseUrl}/folders?filter[name][_eq]=${encodeURIComponent(name)}&limit=1`,
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
      body: JSON.stringify({ name }),
    });
    if (created.ok) {
      const data = (await created.json()) as { data?: DirectusFolder };
      return data.data?.id ?? null;
    }
  } catch (err) {
    logger.warn("ensureFolderByName failed", { name, err: String(err) });
  }
  return null;
}

async function ensureLocationsFolder(): Promise<string | null> {
  return ensureFolderByName(FOLDER_NAME);
}

async function ensureServicePhotosFolder(): Promise<string | null> {
  return ensureFolderByName(SERVICE_PHOTOS_FOLDER);
}

async function ensureServiceInvoicesFolder(): Promise<string | null> {
  return ensureFolderByName(SERVICE_INVOICES_FOLDER);
}

/** Eksponowane do auth proxy (`/api/public/service-photos/[id]`) — pozwala
 * sprawdzić, czy plik leży w folderze service-photos zanim go zwrócimy. */
export async function getServicePhotosFolderId(): Promise<string | null> {
  return ensureServicePhotosFolder();
}

/** Eksponowane do auth proxy (`/api/public/service-invoices/[id]`) — folder
 * service-invoices trzyma skany/zdjęcia faktur za komponenty zlecenia. */
export async function getServiceInvoicesFolderId(): Promise<string | null> {
  return ensureServiceInvoicesFolder();
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

export interface UploadedServicePhoto {
  fileId: string;
  url: string;
  thumbnailUrl?: string;
}

/**
 * Upload zdjęcia związanego ze zleceniem serwisowym — folder "service-photos".
 *
 * Zwraca publiczny URL przez auth proxy `/api/public/service-photos/{id}`,
 * który dopiero po sprawdzeniu uprawnień ownera serwuje bytes z Directusa.
 * Sam Directus public role nie ma wglądu do tego folderu.
 */
export async function uploadServicePhoto(args: {
  file: Blob;
  filename: string;
  mimeType: string;
  serviceId: string;
  stage: string;
  uploadedBy: string;
}): Promise<UploadedServicePhoto> {
  const cfg = getConfig();
  if (!cfg) throw new Error("Directus is not configured");

  const folderId = await ensureServicePhotosFolder();

  const fd = new FormData();
  if (folderId) fd.set("folder", folderId);
  fd.set(
    "description",
    `service:${args.serviceId} stage:${args.stage} by:${args.uploadedBy}`,
  );
  // File MUST be last in multipart (Directus quirk).
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
    fileId,
    url: `${cfg.dashboardUrl}/api/public/service-photos/${fileId}`,
    // Directus auto-generuje thumbnail przez `?key=...` lub `?width=...`.
    // Auth proxy obsłuży opcjonalne forwarding query params (deferowane do UI).
    thumbnailUrl: `${cfg.dashboardUrl}/api/public/service-photos/${fileId}?width=400`,
  };
}

export interface UploadedServiceInvoice {
  fileId: string;
  url: string;
}

/**
 * Upload skanu/zdjęcia faktury (lub paragonu) za komponent użyty w naprawie —
 * folder "service-invoices". Zwraca publiczny URL przez auth proxy
 * `/api/public/service-invoices/{id}` (sprawdzany ownership zlecenia
 * powiązanego z file_id przez mp_service_components).
 */
export async function uploadServiceInvoice(args: {
  file: Blob;
  filename: string;
  mimeType: string;
  serviceId: string;
  componentId: string;
  uploadedBy: string;
}): Promise<UploadedServiceInvoice> {
  const cfg = getConfig();
  if (!cfg) throw new Error("Directus is not configured");

  const folderId = await ensureServiceInvoicesFolder();

  const fd = new FormData();
  if (folderId) fd.set("folder", folderId);
  fd.set(
    "description",
    `service:${args.serviceId} component:${args.componentId} by:${args.uploadedBy}`,
  );
  // File MUST be last in multipart (Directus quirk).
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
    fileId,
    url: `${cfg.dashboardUrl}/api/public/service-invoices/${fileId}`,
  };
}

/**
 * Czyści (delete) plik w Directus Files. Best-effort — gdy auth proxy zwraca
 * 404 / file już nie istnieje, traktujemy jako sukces (idempotent).
 */
export async function deleteDirectusFile(fileId: string): Promise<boolean> {
  const cfg = getConfig();
  if (!cfg) return false;
  try {
    const r = await fetch(
      `${cfg.baseUrl}/files/${encodeURIComponent(fileId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${cfg.token}` },
      },
    );
    return r.ok || r.status === 404;
  } catch (err) {
    logger.warn("deleteDirectusFile failed", { fileId, err: String(err) });
    return false;
  }
}
