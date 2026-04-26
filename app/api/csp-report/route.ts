export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { recordEvent } from "@/lib/security/db";
import { log } from "@/lib/logger";

const logger = log.child({ module: "csp-report" });

interface CspReport {
  "csp-report"?: {
    "document-uri"?: string;
    "violated-directive"?: string;
    "blocked-uri"?: string;
    "source-file"?: string;
    "line-number"?: number;
  };
}

/**
 * Endpoint odbierający raporty CSP violation. Strict CSP (`default-src 'self'`,
 * `frame-ancestors 'none'`) blokuje XSS i clickjacking; każdy odrzucony
 * load lądy tutaj. Logujemy + zapisujemy w mp_security_events jako 'low'
 * — wysoka liczba w krótkim czasie sygnalizuje próbę injection albo
 * uzasadnia tweak CSP.
 */
export async function POST(req: Request) {
  try {
    const payload = (await req.json().catch(() => null)) as CspReport | null;
    const r = payload?.["csp-report"];
    if (!r) return NextResponse.json({ ok: true });

    const srcIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      undefined;

    logger.info("csp violation", {
      doc: r["document-uri"],
      directive: r["violated-directive"],
      blocked: r["blocked-uri"],
    });

    await recordEvent({
      severity: "low",
      category: "csp.violation",
      source: "browser",
      title: `CSP: ${r["violated-directive"] ?? "unknown directive"}`,
      description: `Blocked: ${r["blocked-uri"] ?? "?"} on ${r["document-uri"] ?? "?"}`,
      srcIp,
      details: {
        violatedDirective: r["violated-directive"],
        blockedUri: r["blocked-uri"],
        documentUri: r["document-uri"],
        sourceFile: r["source-file"],
        lineNumber: r["line-number"],
      },
    }).catch((err) => {
      logger.warn("csp record failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
