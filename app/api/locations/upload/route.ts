export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
  requireSession,
} from "@/lib/api-utils";
import {
  canAccessKeycloakAdmin,
  canManageCertificates,
} from "@/lib/admin-auth";
import { uploadLocationPhoto } from "@/lib/directus-files";

/**
 * POST /api/locations/upload (multipart/form-data, pole `file`)
 * Wgrywa zdjęcie do Directus Files w folderze "locations" i zwraca
 * publiczny URL gotowy do zapisania w mp_locations.photos[].
 *
 * Limit: 5 MB, image/* MIME, admin only.
 */
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireSession(session);
    if (!canManageCertificates(session) && !canAccessKeycloakAdmin(session)) {
      throw ApiError.forbidden("Wymagane uprawnienia admina");
    }

    const formData = await req.formData().catch(() => null);
    if (!formData) throw ApiError.badRequest("Expected multipart/form-data");
    const file = formData.get("file");
    if (!(file instanceof Blob) || file.size === 0) {
      throw ApiError.badRequest("Brak pliku");
    }
    if (file.size > MAX_BYTES) {
      throw ApiError.badRequest(`Plik za duży (max 5 MB)`);
    }
    const mime = file.type ?? "application/octet-stream";
    if (!mime.startsWith("image/")) {
      throw ApiError.badRequest("Wymagane: image/* (jpg, png, webp, gif)");
    }
    const filename =
      (formData.get("filename") as string | null) ??
      (file as unknown as { name?: string }).name ??
      "location-photo.jpg";

    try {
      const result = await uploadLocationPhoto({
        file,
        filename,
        mimeType: mime,
        uploaderEmail: session.user?.email ?? null,
      });
      return createSuccessResponse(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: { code: "DIRECTUS_UPLOAD", message: msg } },
        { status: 502 },
      );
    }
  } catch (error) {
    return handleApiError(error);
  }
}
