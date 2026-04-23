import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/app/auth";

export interface GeocodingResult {
  displayName: string;
  lat: number;
  lon: number;
  type?: string;
  importance?: number;
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT =
  "MyPerformance/1.0 (self-hosted; contact: admin@myperformance.local)";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 3) {
    return NextResponse.json({ results: [] });
  }
  if (q.length > 120) {
    return NextResponse.json({ error: "Query too long" }, { status: 400 });
  }

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "6");
  url.searchParams.set("addressdetails", "0");
  url.searchParams.set("accept-language", "pl,en");

  try {
    const resp = await fetch(url.toString(), {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      next: { revalidate: 3600 },
    });

    if (!resp.ok) {
      return NextResponse.json({ results: [] });
    }

    interface NominatimItem {
      display_name?: string;
      lat?: string | number;
      lon?: string | number;
      type?: string;
      importance?: number;
    }
    const items: NominatimItem[] = await resp.json();
    const results: GeocodingResult[] = items.map((it) => ({
      displayName: String(it.display_name ?? ""),
      lat: Number(it.lat),
      lon: Number(it.lon),
      type: it.type ? String(it.type) : undefined,
      importance: typeof it.importance === "number" ? it.importance : undefined,
    }));

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
