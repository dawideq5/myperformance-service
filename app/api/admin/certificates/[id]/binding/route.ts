import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { canManageCertificates } from "@/lib/admin-auth";
import { canonicalSerial } from "@/lib/device-fingerprint";
import {
  getDeviceBinding,
  listBindingEvents,
  recordBindingEvent,
  resetDeviceBinding,
} from "@/lib/persistence";
import { emitBindingEvent } from "@/lib/binding-events";
import { auditLog } from "@/lib/step-ca";

export const runtime = "nodejs";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return { ok: false as const, status: 401 };
  if (!canManageCertificates(session)) return { ok: false as const, status: 403 };
  return { ok: true as const, session };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { id } = await params;
  const serial = canonicalSerial(id);
  if (!serial) return NextResponse.json({ binding: null, events: [] });
  const [binding, events] = await Promise.all([
    getDeviceBinding(serial),
    listBindingEvents(serial, 50),
  ]);
  return NextResponse.json({ binding, events });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  }
  const { id } = await params;
  const serial = canonicalSerial(id);
  if (!serial) {
    return NextResponse.json({ error: "Invalid serial" }, { status: 400 });
  }
  await resetDeviceBinding(serial);
  const actor = auth.session?.user?.email ?? "unknown-admin";
  await recordBindingEvent({ serialNumber: serial, kind: "reset", actor });
  emitBindingEvent({
    kind: "reset",
    serialNumber: serial,
    at: new Date().toISOString(),
    actor,
  });
  auditLog({
    ts: new Date().toISOString(),
    actor,
    action: "reset-binding",
    subject: serial,
    ok: true,
  });
  return NextResponse.json({ ok: true });
}
