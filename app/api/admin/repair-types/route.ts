export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { canAccessConfigHub } from "@/lib/admin-auth";
import {
  createRepairType,
  listRepairTypes,
  type RepairTypeInput,
} from "@/lib/repair-types";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessConfigHub(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const types = await listRepairTypes();
  return NextResponse.json({ types });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !canAccessConfigHub(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: Partial<RepairTypeInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.code || !body.label) {
    return NextResponse.json(
      { error: "code i label są wymagane" },
      { status: 400 },
    );
  }
  try {
    const created = await createRepairType(body as RepairTypeInput);
    return NextResponse.json({ type: created });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Create failed" },
      { status: 500 },
    );
  }
}
