export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { log } from "@/lib/logger";
import { getUserIdByEmail, notifyUser } from "@/lib/notify";

const logger = log.child({ module: "moodle-webhook" });

/**
 * Moodle event webhook (MDL Web Services events stream → external listener).
 * Mapujemy `\\core\\event\\user_enrolment_created` na moodle.course.assigned.
 *
 * Auth: HMAC-SHA256 sygnatura w `X-Moodle-Signature`. Secret w env
 * MOODLE_WEBHOOK_SECRET. Bez secretu odpowiadamy 401.
 */

interface MoodleEventPayload {
  eventname?: string;
  userId?: number;
  userEmail?: string;
  courseId?: number;
  courseName?: string;
  roleAssigned?: string;
}

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.MOODLE_WEBHOOK_SECRET?.trim();
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

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-moodle-signature");
  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  let payload: MoodleEventPayload;
  try {
    payload = JSON.parse(rawBody) as MoodleEventPayload;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  if (
    payload.eventname !== "\\core\\event\\user_enrolment_created" &&
    payload.eventname !== "user_enrolment_created"
  ) {
    return NextResponse.json({ ok: true, ignored: payload.eventname });
  }

  if (!payload.userEmail) {
    return NextResponse.json({ ok: true, ignored: "no-email" });
  }

  const uid = await getUserIdByEmail(payload.userEmail);
  if (!uid) {
    return NextResponse.json({ ok: true, ignored: "no-kc-user" });
  }

  await notifyUser(uid, "moodle.course.assigned", {
    title: `Przypisano Cię do kursu: ${payload.courseName ?? `#${payload.courseId}`}`,
    body: `Otwórz Akademię żeby zobaczyć materiały kursu i terminy.${payload.roleAssigned ? ` Twoja rola w kursie: ${payload.roleAssigned}.` : ""}`,
    severity: "info",
    payload: {
      courseId: payload.courseId,
      courseName: payload.courseName,
      roleAssigned: payload.roleAssigned,
    },
  });

  logger.info("moodle enrolment notified", { uid, courseId: payload.courseId });
  return NextResponse.json({ ok: true });
}
