export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { uploadLocationPhoto } from "@/lib/directus-files";

const MAX_BYTES = 5 * 1024 * 1024;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PANEL_CORS_HEADERS });
}

/** Panel-facing upload — wgrywa zdjęcie do folderu Directus "locations"
 * (proxy /api/public/photos/{id} obsługuje serwowanie). Auth: Bearer KC token.
 */
export async function POST(req: Request) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json(
      { error: "Expected multipart/form-data" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const file = formData.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json(
      { error: "Brak pliku" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Plik za duży (max 5 MB)" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const mime = file.type ?? "application/octet-stream";
  if (!mime.startsWith("image/")) {
    return NextResponse.json(
      { error: "Wymagane: image/* (jpg, png, webp, heic)" },
      { status: 400, headers: PANEL_CORS_HEADERS },
    );
  }
  const filename =
    (formData.get("filename") as string | null) ??
    (file as unknown as { name?: string }).name ??
    "panel-photo.jpg";

  try {
    const result = await uploadLocationPhoto({
      file,
      filename,
      mimeType: mime,
      uploaderEmail: user.email,
    });
    return NextResponse.json(
      { data: result },
      { headers: PANEL_CORS_HEADERS },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502, headers: PANEL_CORS_HEADERS },
    );
  }
}
