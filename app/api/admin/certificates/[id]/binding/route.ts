import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { canManageCertificates } from "@/lib/admin-auth";
import {
  getDeviceBinding,
  resetDeviceBinding,
} from "@/lib/persistence";
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
  const binding = await getDeviceBinding(id);
  return NextResponse.json({ binding });
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
  await resetDeviceBinding(id);
  const actor = auth.session?.user?.email ?? "unknown-admin";
  auditLog({
    ts: new Date().toISOString(),
    actor,
    action: "reset-binding",
    subject: id,
    ok: true,
  });
  return NextResponse.json({ ok: true });
}
