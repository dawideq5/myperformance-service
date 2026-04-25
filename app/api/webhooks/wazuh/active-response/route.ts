export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { log } from "@/lib/logger";
import { blockIp, unblockIp, recordEvent } from "@/lib/security/db";

const logger = log.child({ module: "wazuh-active-response" });

/**
 * Wazuh Active Response webhook receiver.
 *
 * Wazuh wykrywa atak (np. brute force, FIM violation, vulnerability)
 * i wywołuje custom integration script który POST'uje tu z action+details.
 *
 * Auth: HMAC-SHA256 signature (header X-Wazuh-Signature) podpisany
 * shared secret z env WAZUH_AR_SECRET. Bez auth → 401.
 *
 * Akcje:
 *   block-ip   — dodaj IP do mp_blocked_ips + cron syncuje do Traefik
 *   unblock-ip — usuń IP z mp_blocked_ips
 *   alert-only — zapisz security event bez akcji (np. FIM violation)
 */

interface ARPayload {
  action: "block-ip" | "unblock-ip" | "alert-only";
  ip?: string;
  ruleId?: string;
  ruleDescription?: string;
  alertLevel?: number; // Wazuh level (0-15)
  agentName?: string;
  durationMinutes?: number;
  details?: Record<string, unknown>;
}

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.WAZUH_AR_SECRET?.trim();
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signature.replace(/^sha256=/, "").trim();
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"));
  } catch {
    return false;
  }
}

function severityFromAlertLevel(level?: number): "info" | "low" | "medium" | "high" | "critical" {
  if (!level) return "info";
  if (level >= 12) return "critical";
  if (level >= 9) return "high";
  if (level >= 6) return "medium";
  if (level >= 3) return "low";
  return "info";
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-wazuh-signature");

  if (!verifySignature(rawBody, signature)) {
    logger.warn("Wazuh AR webhook: bad signature");
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  let payload: ARPayload;
  try {
    payload = JSON.parse(rawBody) as ARPayload;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  if (!payload.action) {
    return NextResponse.json({ error: "action required" }, { status: 400 });
  }

  const sev = severityFromAlertLevel(payload.alertLevel);
  const actor = payload.agentName ? `wazuh-agent:${payload.agentName}` : "wazuh";

  try {
    if (payload.action === "block-ip") {
      if (!payload.ip) {
        return NextResponse.json({ error: "ip required for block-ip" }, { status: 400 });
      }
      await blockIp({
        ip: payload.ip,
        reason: `Wazuh rule ${payload.ruleId ?? "?"}: ${payload.ruleDescription ?? "active response"}`,
        blockedBy: actor,
        source: "wazuh-active-response",
        durationMinutes: payload.durationMinutes ?? 60,
        details: payload.details ?? null,
      });
      await recordEvent({
        severity: sev === "info" ? "high" : sev,
        category: "wazuh.active_response.block",
        source: "wazuh",
        title: `Wazuh: IP ${payload.ip} zablokowany — ${payload.ruleDescription ?? "rule " + (payload.ruleId ?? "?")}`,
        description: `Wazuh wykrył atak (rule ${payload.ruleId}, alert level ${payload.alertLevel}). IP zablokowany na ${payload.durationMinutes ?? 60} min.`,
        srcIp: payload.ip,
        details: payload.details ?? null,
      });
      logger.info("Wazuh AR: IP blocked", { ip: payload.ip, rule: payload.ruleId });
      return NextResponse.json({ ok: true, action: "blocked", ip: payload.ip });
    }

    if (payload.action === "unblock-ip") {
      if (!payload.ip) {
        return NextResponse.json({ error: "ip required for unblock-ip" }, { status: 400 });
      }
      await unblockIp(payload.ip);
      await recordEvent({
        severity: "info",
        category: "wazuh.active_response.unblock",
        source: "wazuh",
        title: `Wazuh: IP ${payload.ip} odblokowany`,
        srcIp: payload.ip,
      });
      return NextResponse.json({ ok: true, action: "unblocked", ip: payload.ip });
    }

    if (payload.action === "alert-only") {
      await recordEvent({
        severity: sev,
        category: `wazuh.${payload.ruleId ?? "alert"}`,
        source: "wazuh",
        title: payload.ruleDescription ?? "Wazuh alert",
        description: `Rule ${payload.ruleId} · level ${payload.alertLevel} · agent ${payload.agentName ?? "?"}`,
        srcIp: payload.ip,
        details: payload.details ?? null,
      });
      return NextResponse.json({ ok: true, action: "logged" });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (err) {
    logger.error("Wazuh AR processing failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
