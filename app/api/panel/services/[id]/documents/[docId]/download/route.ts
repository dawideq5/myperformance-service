export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PANEL_CORS_HEADERS, getPanelUserFromRequest } from "@/lib/panel-auth";
import { getService } from "@/lib/services";
import {
  getServiceDocument,
  updateServiceDocument,
} from "@/lib/service-documents";
import { downloadDocumentPdf } from "@/lib/documenso";
import { getOptionalEnv } from "@/lib/env";
import { log } from "@/lib/logger";

/**
 * Wave 21 / Faza 1B — pobieranie wersji dokumentu zlecenia.
 *
 * GET /api/panel/services/[id]/documents/[docId]/download?version=signed|original
 *
 * Logika:
 *  - `version=original`  → bytes z Directus dla `original_pdf_file_id`
 *    (gdy ustawione). Bez `original_pdf_file_id` → 404 — original PDF żyje w
 *    Documenso dopóki nie zostanie podpisany.
 *  - `version=signed`    → bytes dla `signed_pdf_file_id`. Gdy null ale
 *    `documenso_doc_id` set, fetchujemy z Documenso `/documents/{id}/download`
 *    i CACHE'ujemy upload do Directus (folder `service-documents-signed`),
 *    aktualizując mp_service_documents.signed_pdf_file_id.
 */

const logger = log.child({ module: "panel-services-documents-download" });

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PANEL_CORS_HEADERS });
}

function userOwns(
  service: { locationId: string | null; serviceLocationId: string | null },
  locationIds: string[],
): boolean {
  if (locationIds.length === 0) return false;
  if (service.locationId && locationIds.includes(service.locationId)) return true;
  if (
    service.serviceLocationId &&
    locationIds.includes(service.serviceLocationId)
  )
    return true;
  return false;
}

async function fetchDirectusFile(fileId: string): Promise<Response | null> {
  const baseUrl =
    getOptionalEnv("DIRECTUS_INTERNAL_URL") || getOptionalEnv("DIRECTUS_URL");
  const token =
    getOptionalEnv("DIRECTUS_ADMIN_TOKEN") || getOptionalEnv("DIRECTUS_TOKEN");
  if (!baseUrl || !token) return null;
  try {
    const r = await fetch(
      `${baseUrl.replace(/\/$/, "")}/assets/${encodeURIComponent(fileId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    return r;
  } catch (err) {
    logger.warn("fetchDirectusFile failed", { fileId, err: String(err) });
    return null;
  }
}

async function uploadSignedToDirectus(args: {
  serviceId: string;
  documentId: string;
  filename: string;
  pdfBytes: ArrayBuffer;
}): Promise<string | null> {
  const baseUrl =
    getOptionalEnv("DIRECTUS_INTERNAL_URL") || getOptionalEnv("DIRECTUS_URL");
  const token =
    getOptionalEnv("DIRECTUS_ADMIN_TOKEN") || getOptionalEnv("DIRECTUS_TOKEN");
  if (!baseUrl || !token) return null;
  try {
    // Folder lookup/create — `service-documents-signed`. Idempotent.
    const folderName = "service-documents-signed";
    let folderId: string | null = null;
    try {
      const exists = await fetch(
        `${baseUrl.replace(/\/$/, "")}/folders?filter[name][_eq]=${encodeURIComponent(folderName)}&limit=1`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      if (exists.ok) {
        const j = (await exists.json()) as { data?: Array<{ id: string }> };
        folderId = j.data?.[0]?.id ?? null;
      }
      if (!folderId) {
        const created = await fetch(`${baseUrl.replace(/\/$/, "")}/folders`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: folderName }),
        });
        if (created.ok) {
          const j = (await created.json()) as { data?: { id: string } };
          folderId = j.data?.id ?? null;
        }
      }
    } catch {
      /* ignore — uploadujemy bez folderu */
    }

    const fd = new FormData();
    if (folderId) fd.set("folder", folderId);
    fd.set(
      "description",
      `service:${args.serviceId} document:${args.documentId} (signed cache)`,
    );
    fd.set(
      "file",
      new Blob([args.pdfBytes], { type: "application/pdf" }),
      args.filename,
    );
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/files`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    if (!res.ok) {
      logger.warn("uploadSignedToDirectus upload failed", {
        documentId: args.documentId,
        status: res.status,
      });
      return null;
    }
    const j = (await res.json()) as { data?: { id: string } };
    return j.data?.id ?? null;
  } catch (err) {
    logger.warn("uploadSignedToDirectus error", {
      documentId: args.documentId,
      err: String(err),
    });
    return null;
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const user = await getPanelUserFromRequest(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PANEL_CORS_HEADERS },
    );
  }
  const { id, docId } = await params;
  const service = await getService(id);
  if (!service) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }
  if (!userOwns(service, user.locationIds)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: PANEL_CORS_HEADERS },
    );
  }

  const document = await getServiceDocument(docId);
  if (!document || document.serviceId !== id) {
    return NextResponse.json(
      { error: "Document not found" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }

  const url = new URL(req.url);
  const version =
    url.searchParams.get("version") === "signed" ? "signed" : "original";

  const baseFilename = `${document.kind}-${service.ticketNumber ?? id}-${version}.pdf`;

  if (version === "original") {
    if (!document.originalPdfFileId) {
      return NextResponse.json(
        { error: "Original PDF nie jest jeszcze zapisany w Directus" },
        { status: 404, headers: PANEL_CORS_HEADERS },
      );
    }
    const r = await fetchDirectusFile(document.originalPdfFileId);
    if (!r || !r.ok) {
      return NextResponse.json(
        { error: "Nie udało się pobrać oryginału z Directus" },
        { status: 502, headers: PANEL_CORS_HEADERS },
      );
    }
    const bytes = await r.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        ...PANEL_CORS_HEADERS,
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${baseFilename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // version === "signed"
  if (document.signedPdfFileId) {
    const r = await fetchDirectusFile(document.signedPdfFileId);
    if (r && r.ok) {
      const bytes = await r.arrayBuffer();
      return new NextResponse(bytes, {
        status: 200,
        headers: {
          ...PANEL_CORS_HEADERS,
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${baseFilename}"`,
          "Cache-Control": "no-store",
        },
      });
    }
    // Fallback: cache miss → spróbuj świeżo pociągnąć z Documenso poniżej.
    logger.warn("signed file_id present but Directus fetch failed, falling back to Documenso", {
      documentId: document.id,
      fileId: document.signedPdfFileId,
    });
  }

  if (document.documensoDocId == null) {
    return NextResponse.json(
      { error: "Brak podpisanej wersji — dokument nie ma referencji Documenso" },
      { status: 404, headers: PANEL_CORS_HEADERS },
    );
  }

  // Pull świeżą wersję z Documenso.
  let pdfResp: Response;
  try {
    pdfResp = await downloadDocumentPdf(document.documensoDocId);
  } catch (err) {
    logger.warn("documenso download failed", {
      documentId: document.id,
      docId: document.documensoDocId,
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Nie udało się pobrać podpisanej wersji z Documenso" },
      { status: 502, headers: PANEL_CORS_HEADERS },
    );
  }
  if (!pdfResp.ok) {
    return NextResponse.json(
      { error: `Documenso ${pdfResp.status}` },
      { status: 502, headers: PANEL_CORS_HEADERS },
    );
  }
  const bytes = await pdfResp.arrayBuffer();

  // Cache w Directus + update mp_service_documents.signed_pdf_file_id.
  void (async () => {
    const fileId = await uploadSignedToDirectus({
      serviceId: id,
      documentId: document.id,
      filename: baseFilename,
      pdfBytes: bytes,
    });
    if (fileId) {
      await updateServiceDocument(document.id, {
        signedPdfFileId: fileId,
        status: "signed",
      }).catch((err) => {
        logger.warn("updateServiceDocument signed cache failed", {
          documentId: document.id,
          err: String(err),
        });
      });
    }
  })();

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      ...PANEL_CORS_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${baseFilename}"`,
      "Cache-Control": "no-store",
    },
  });
}
