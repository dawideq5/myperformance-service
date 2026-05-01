export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { log } from "@/lib/logger";
import { getUserIdByEmail, notifyUser } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";

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
  // user_graded
  grade?: string | number;
  itemName?: string;
  relateduserid?: number;
  relatedUserEmail?: string;
  // group_member_added
  groupName?: string;
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
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`webhook:moodle:${ip}`, {
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

  const HANDLED_EVENTS = [
    "\\core\\event\\user_enrolment_created",
    "user_enrolment_created",
    "\\core\\event\\user_graded",
    "user_graded",
    "\\core\\event\\group_member_added",
    "group_member_added",
  ];
  if (!HANDLED_EVENTS.includes(payload.eventname ?? "")) {
    return NextResponse.json({ ok: true, ignored: payload.eventname });
  }

  // --- user_graded: użytkownik otrzymał ocenę ---
  if (
    payload.eventname === "\\core\\event\\user_graded" ||
    payload.eventname === "user_graded"
  ) {
    // relateduserid = user który dostał ocenę; fallback na userEmail
    const targetEmail = payload.relatedUserEmail ?? payload.userEmail;
    if (!targetEmail) {
      return NextResponse.json({ ok: true, ignored: "no-email" });
    }
    const uid = await getUserIdByEmail(targetEmail);
    if (!uid) {
      return NextResponse.json({ ok: true, ignored: "no-kc-user" });
    }
    const gradeValue = payload.grade !== undefined ? String(payload.grade) : "—";
    const itemLabel = payload.itemName ?? "zadanie";
    const courseLabel = payload.courseName ?? `#${payload.courseId}`;
    await notifyUser(uid, "moodle.grade.received", {
      title: "Nowa ocena w Akademii",
      body: `Otrzymałeś ocenę ${gradeValue} za ${itemLabel} w kursie ${courseLabel}.`,
      severity: "success",
      payload: {
        courseId: payload.courseId,
        courseName: payload.courseName,
        itemName: payload.itemName,
        grade: payload.grade,
      },
    });
    logger.info("moodle grade_received notified", { uid, courseId: payload.courseId });
    return NextResponse.json({ ok: true });
  }

  // --- group_member_added: użytkownik dołączył do grupy ---
  if (
    payload.eventname === "\\core\\event\\group_member_added" ||
    payload.eventname === "group_member_added"
  ) {
    const targetEmail = payload.relatedUserEmail ?? payload.userEmail;
    if (!targetEmail) {
      return NextResponse.json({ ok: true, ignored: "no-email" });
    }
    const uid = await getUserIdByEmail(targetEmail);
    if (!uid) {
      return NextResponse.json({ ok: true, ignored: "no-kc-user" });
    }
    const groupLabel = payload.groupName ?? "nieznanej grupy";
    const courseLabel = payload.courseName ?? `#${payload.courseId}`;
    await notifyUser(uid, "moodle.group.joined", {
      title: `Dołączono do grupy: ${groupLabel}`,
      body: `Zostałeś dodany do grupy '${groupLabel}' w kursie ${courseLabel}.`,
      severity: "info",
      payload: {
        courseId: payload.courseId,
        courseName: payload.courseName,
        groupName: payload.groupName,
      },
    });
    logger.info("moodle group_member_added notified", { uid, courseId: payload.courseId });
    return NextResponse.json({ ok: true });
  }

  // --- user_enrolment_created ---
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
