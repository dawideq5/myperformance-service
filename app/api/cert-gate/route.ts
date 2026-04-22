import { NextResponse } from "next/server";
import { getOptionalEnv } from "@/lib/env";
import {
  canonicalSerial,
  diffFingerprints,
  extractFingerprintComponents,
  FINGERPRINT_FIELD_LABELS,
  hashFingerprintComponents,
  type DeviceFingerprintComponents,
  type FingerprintDiff,
} from "@/lib/device-fingerprint";
import {
  getDeviceBinding,
  recordBindingEvent,
  recordDeviceBindingDenial,
  upsertDeviceBinding,
} from "@/lib/persistence";
import { emitBindingEvent } from "@/lib/binding-events";

export const runtime = "nodejs";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function formatReason(diff: FingerprintDiff[]): string {
  if (diff.length === 0) return "Wykryto nieznaną zmianę urządzenia.";
  const fields = diff.map((d) => FINGERPRINT_FIELD_LABELS[d.field]);
  return `Urządzenie zmieniło konfigurację: ${fields.join(", ")}.`;
}

export async function POST(req: Request) {
  const expected = getOptionalEnv("CERT_GATE_SECRET").trim();
  const provided = req.headers.get("x-cert-gate-secret")?.trim() ?? "";
  if (!expected) {
    return NextResponse.json(
      { error: "CERT_GATE_SECRET not configured" },
      { status: 503 },
    );
  }
  if (!provided || !timingSafeEqual(expected, provided)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    serial?: string;
    components?: DeviceFingerprintComponents;
    ip?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { serial: rawSerial, components, ip } = body;
  if (!rawSerial || !components) {
    return NextResponse.json(
      { error: "Missing serial or components" },
      { status: 400 },
    );
  }
  const serial = canonicalSerial(rawSerial);
  if (!serial) {
    return NextResponse.json({ error: "Invalid serial" }, { status: 400 });
  }

  // Normalise + rehash server-side (defensive — never trust client hash).
  const normalisedComponents = extractFingerprintComponents({
    "user-agent": components.userAgent ?? "",
    "sec-ch-ua-platform": components.platform ?? "",
    "sec-ch-ua": components.browserBrand ?? "",
    "accept-language": components.acceptLanguage ?? "",
    "sec-ch-ua-mobile": components.mobile ?? "",
  });
  const hash = await hashFingerprintComponents(normalisedComponents);
  const current = { hash, components: normalisedComponents };

  const existing = await getDeviceBinding(serial);
  const now = new Date().toISOString();
  if (!existing) {
    await upsertDeviceBinding(serial, current.hash, current.components);
    await recordBindingEvent({
      serialNumber: serial,
      kind: "created",
      ip,
      userAgent: current.components.userAgent,
      components: current.components,
    });
    emitBindingEvent({
      kind: "created",
      serialNumber: serial,
      at: now,
      ip,
      userAgent: current.components.userAgent,
      components: current.components,
    });
    return NextResponse.json({ ok: true, firstUse: true });
  }

  if (existing.hash === current.hash) {
    // Heartbeat — update last_seen_at only; don't flood events/SSE.
    await upsertDeviceBinding(serial, current.hash, current.components);
    return NextResponse.json({ ok: true, firstUse: false });
  }

  const diff = diffFingerprints(existing.components, current.components);
  await recordDeviceBindingDenial(serial, diff, ip, current.components.userAgent);
  await recordBindingEvent({
    serialNumber: serial,
    kind: "denied",
    ip,
    userAgent: current.components.userAgent,
    components: current.components,
    diff,
  });
  emitBindingEvent({
    kind: "denied",
    serialNumber: serial,
    at: now,
    ip,
    userAgent: current.components.userAgent,
    components: current.components,
    diff,
  });
  return NextResponse.json(
    {
      ok: false,
      reason: formatReason(diff),
      diff,
    },
    { status: 403 },
  );
}
