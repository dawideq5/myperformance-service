export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { searchPhoneModels } from "@/lib/phones";

/**
 * GET /api/phones/search?q=iphone+13
 * Zwraca top 20 modeli pasujących do query (brand/model/slug/aliases).
 * Pusty q → top 20 najpopularniejszych. Tylko zalogowani userzy.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const limitRaw = Number(url.searchParams.get("limit") ?? 20);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 100 ? limitRaw : 20;
  const phones = await searchPhoneModels(q, limit);
  return NextResponse.json(
    { phones: phones.map((p) => ({ brand: p.brand, model: p.model, slug: p.slug, year: p.releaseYear })) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
