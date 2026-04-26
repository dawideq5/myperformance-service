export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireInfrastructure } from "@/lib/admin-auth";
import { getOvhConfig } from "@/lib/email/db";
import { createSnapshot, deleteSnapshot } from "@/lib/email/ovh";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";
import { getAdminUserIds, notifyUsers } from "@/lib/notify";

interface PostPayload {
  vpsName: string;
  description?: string;
  /** Gdy true — najpierw usuwa istniejący snapshot, potem tworzy nowy. */
  force?: boolean;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireInfrastructure(session);
    const body = (await req.json().catch(() => null)) as PostPayload | null;
    if (!body?.vpsName) throw ApiError.badRequest("vpsName required");

    const config = await getOvhConfig();
    if (!config.appKey || !config.appSecret || !config.consumerKey) {
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "OVH credentials not configured",
        503,
      );
    }
    const creds = {
      endpoint: config.endpoint,
      appKey: config.appKey,
      appSecret: config.appSecret,
      consumerKey: config.consumerKey,
    };
    const description =
      body.description ??
      `Manual snapshot triggered by ${session.user?.email ?? "admin"} at ${new Date().toISOString()}`;

    if (body.force) {
      try {
        await deleteSnapshot(creds, body.vpsName);
      } catch {
        // 404 = brak — ignoruj
      }
    }

    try {
      const result = await createSnapshot(creds, body.vpsName, description);
      void getAdminUserIds().then((ids) =>
        notifyUsers(ids, "admin.snapshot.created", {
          title: "Utworzono snapshot VPS",
          body: `VPS ${body.vpsName} — snapshot zlecony przez ${session.user?.email ?? "admin"}.`,
          severity: "success",
          payload: { vpsName: body.vpsName, snapshotId: result.id },
        }),
      );
      return createSuccessResponse({
        ok: true,
        snapshotId: result.id,
        message:
          "Snapshot zlecony — OVH wykona go w ciągu kilku minut. Pojawi się jako 'lastSnapshot' po odświeżeniu.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      void getAdminUserIds().then((ids) =>
        notifyUsers(ids, "admin.snapshot.failed", {
          title: "Snapshot VPS nie powiódł się",
          body: `VPS ${body.vpsName} — błąd: ${msg.slice(0, 200)}`,
          severity: "error",
          payload: { vpsName: body.vpsName, error: msg },
        }),
      );
      // Snapshot already exists → wskaż UI że można force=true
      if (msg.includes("Snapshot already exists")) {
        throw new ApiError(
          "CONFLICT",
          "Snapshot już istnieje na VPS (OVH limit: 1 aktywny snapshot per VPS). Użyj opcji 'Nadpisz' aby najpierw usunąć stary i utworzyć nowy.",
          409,
        );
      }
      if (msg.includes("403") || msg.includes("not been granted")) {
        throw new ApiError(
          "FORBIDDEN",
          "Token OVH nie ma uprawnień do tworzenia snapshotów. Wygeneruj nowe poświadczenia z regułą POST /vps/*/createSnapshot lub wildcard POST /*.",
          403,
        );
      }
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        `OVH odrzucił operację snapshot: ${msg}`,
        502,
      );
    }
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireInfrastructure(session);
    const url = new URL(req.url);
    const vpsName = url.searchParams.get("vpsName");
    if (!vpsName) throw ApiError.badRequest("vpsName required");

    const config = await getOvhConfig();
    if (!config.appKey || !config.appSecret || !config.consumerKey) {
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "OVH credentials not configured",
        503,
      );
    }
    await deleteSnapshot(
      {
        endpoint: config.endpoint,
        appKey: config.appKey,
        appSecret: config.appSecret,
        consumerKey: config.consumerKey,
      },
      vpsName,
    );
    return createSuccessResponse({
      ok: true,
      message: "Snapshot usunięty.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
