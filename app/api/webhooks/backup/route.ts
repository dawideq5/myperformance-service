export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { log } from "@/lib/logger";
import { getAdminUserIds, notifyUsers } from "@/lib/notify";
import { recordEvent } from "@/lib/security/db";
import { rateLimit } from "@/lib/rate-limit";

const logger = log.child({ module: "backup-webhook" });

/**
 * Backup status webhook. Cron na hoście (nightly backup script) wywołuje
 * po sukcesie/porażce, podaje rozmiar archiwum, czas trwania, ewentualny
 * błąd. Dashboard:
 *   - zapisuje security event (severity=info dla success, error dla fail)
 *   - notifuje wszystkich adminów (admin.backup.completed / admin.backup.failed)
 *
 * Auth: HMAC-SHA256 signature (header X-Backup-Signature) podpisany
 * shared secret z env BACKUP_WEBHOOK_SECRET.
 *
 * Payload:
 *   {
 *     "status": "completed" | "failed",
 *     "archiveSize": 12345678,        // bytes
 *     "durationSec": 423,
 *     "destination": "s3://...",
 *     "error": "..."                  // tylko jeśli failed
 *   }
 */

interface BackupPayload {
  status: "completed" | "failed";
  archiveSize?: number;
  durationSec?: number;
  destination?: string;
  error?: string;
}

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.BACKUP_WEBHOOK_SECRET?.trim();
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

function formatBytes(n?: number): string {
  if (!n) return "?";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`webhook:backup:${ip}`, {
    capacity: 60,
    refillPerSec: 1,
  });
  if (!rl.allowed) {
    logger.warn("webhook rate-limited", { ip });
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-backup-signature");
  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  let payload: BackupPayload;
  try {
    payload = JSON.parse(rawBody) as BackupPayload;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const sizeStr = formatBytes(payload.archiveSize);
  const durationStr = payload.durationSec
    ? `${Math.round(payload.durationSec / 60)} min ${payload.durationSec % 60}s`
    : "?";

  if (payload.status === "completed") {
    await recordEvent({
      severity: "info",
      category: "backup.completed",
      source: "backup-cron",
      title: "Backup nocny wykonany",
      description: `Archiwum ${sizeStr}, czas ${durationStr}${payload.destination ? `, lokalizacja ${payload.destination}` : ""}`,
      details: payload as unknown as Record<string, unknown>,
    });
    const ids = await getAdminUserIds();
    await notifyUsers(ids, "admin.backup.completed", {
      title: "Backup nocny wykonany",
      body: `Rozmiar: ${sizeStr}, czas: ${durationStr}.`,
      severity: "success",
      payload: payload as unknown as Record<string, unknown>,
    });
    logger.info("backup completed", { size: payload.archiveSize, dur: payload.durationSec });
    return NextResponse.json({ ok: true });
  }

  if (payload.status === "failed") {
    await recordEvent({
      severity: "high",
      category: "backup.failed",
      source: "backup-cron",
      title: "Backup nocny nie powiódł się",
      description: payload.error ?? "(brak szczegółów)",
      details: payload as unknown as Record<string, unknown>,
    });
    const ids = await getAdminUserIds();
    await notifyUsers(ids, "admin.backup.failed", {
      title: "Backup nocny NIE powiódł się",
      body: `Błąd: ${payload.error ?? "(brak szczegółów)"}. Sprawdź /admin/infrastructure → VPS + Backup.`,
      severity: "error",
      forceEmail: true,
      payload: payload as unknown as Record<string, unknown>,
    });
    logger.warn("backup failed", { error: payload.error });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown status" }, { status: 400 });
}
