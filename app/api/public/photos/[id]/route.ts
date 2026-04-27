export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getOptionalEnv } from "@/lib/env";

/**
 * Public photo proxy — streams `/{DIRECTUS}/assets/{id}` przez admin token.
 *
 * Po co: Directus public role nie ma read na `directus_files`, więc
 * `/assets/{id}` zwraca 403 dla anonimowych. Zamiast modyfikować Directus
 * permissions runtime'owo (skrypt seed wymaga osobnego deployu), proxy
 * używa istniejącego DIRECTUS_ADMIN_TOKEN który jest zawsze dostępny po
 * stronie serwera.
 *
 * Bezpieczeństwo: serwujemy tylko pliki w folderze "locations" — sprawdzamy
 * folder przed proxowaniem bytes. Inne foldery (uploads, etc.) zwracają 404.
 *
 * Cache: 1 godzina po stronie browsera + 24h przy CDN edge'u
 * (immutable jeśli content się nie zmienia — file_id jest stabilny).
 */

const FOLDER_NAME = "locations";

let cachedFolderId: string | null = null;

function getDirectusConfig() {
  const baseUrl =
    getOptionalEnv("DIRECTUS_INTERNAL_URL") || getOptionalEnv("DIRECTUS_URL");
  const token =
    getOptionalEnv("DIRECTUS_ADMIN_TOKEN") || getOptionalEnv("DIRECTUS_TOKEN");
  if (!baseUrl || !token) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), token };
}

async function getFolderId(cfg: { baseUrl: string; token: string }) {
  if (cachedFolderId) return cachedFolderId;
  const r = await fetch(
    `${cfg.baseUrl}/folders?filter[name][_eq]=${FOLDER_NAME}&limit=1`,
    { headers: { Authorization: `Bearer ${cfg.token}` }, cache: "no-store" },
  );
  if (!r.ok) return null;
  const data = (await r.json()) as { data?: { id: string }[] };
  cachedFolderId = data?.data?.[0]?.id ?? null;
  return cachedFolderId;
}

async function getFileFolder(
  cfg: { baseUrl: string; token: string },
  fileId: string,
) {
  const r = await fetch(
    `${cfg.baseUrl}/files/${encodeURIComponent(fileId)}?fields=id,folder,type`,
    { headers: { Authorization: `Bearer ${cfg.token}` }, cache: "no-store" },
  );
  if (!r.ok) return null;
  const data = (await r.json()) as {
    data?: { id: string; folder?: string | null; type?: string };
  };
  return data?.data ?? null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const cfg = getDirectusConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: "Directus not configured" },
      { status: 503 },
    );
  }
  const { id: rawId } = await params;
  // UUID v4 albo lookup po nazwie pliku w starszych URL-ach. Akceptujemy
  // tylko bezpieczny zestaw znaków, żeby uniknąć path-traversala w request.
  const id = rawId.replace(/[^A-Za-z0-9._-]/g, "");
  if (!id || id !== rawId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  // Restrict to files w folderze "locations" — tylko zdjęcia punktów są
  // publiczne. Inne pliki Directus pozostają chronione.
  const [folderId, fileMeta] = await Promise.all([
    getFolderId(cfg),
    getFileFolder(cfg, id),
  ]);
  if (!folderId || !fileMeta) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (fileMeta.folder !== folderId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Proxy bytes z `/assets/{id}` używając admin tokena.
  const upstream = await fetch(
    `${cfg.baseUrl}/assets/${encodeURIComponent(id)}`,
    {
      headers: { Authorization: `Bearer ${cfg.token}` },
      cache: "no-store",
    },
  );
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `Upstream ${upstream.status}` },
      { status: 502 },
    );
  }

  const headers = new Headers();
  const ct = upstream.headers.get("content-type") ?? fileMeta.type ?? "image/jpeg";
  headers.set("content-type", ct);
  const cl = upstream.headers.get("content-length");
  if (cl) headers.set("content-length", cl);
  // file_id jest stabilny (UUID nigdy się nie zmienia), więc treść jest
  // niezmienna. 1h client + 24h CDN.
  headers.set("cache-control", "public, max-age=3600, s-maxage=86400, immutable");

  return new Response(upstream.body, { status: 200, headers });
}
