export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireAdminPanel } from "@/lib/admin-auth";
import { getOvhConfig } from "@/lib/email/db";
import {
  listVps,
  getVpsInfo,
  getAutomatedBackup,
  getSnapshot,
  getVpsIps,
} from "@/lib/email/ovh";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
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
    const names = await listVps(creds);
    const vpsList = await Promise.all(
      names.map(async (name) => {
        const [info, backup, snapshot, ips] = await Promise.all([
          getVpsInfo(creds, name).catch(() => null),
          getAutomatedBackup(creds, name).catch(() => null),
          getSnapshot(creds, name).catch(() => null),
          getVpsIps(creds, name).catch(() => []),
        ]);
        return {
          name,
          info: info && {
            displayName: info.displayName,
            state: info.state,
            zone: info.zone,
            offerType: info.offerType,
            model: info.model,
            vcore: info.vcore,
            memoryLimit: info.memoryLimit,
            iamState: info.iam?.state,
          },
          automatedBackup: backup,
          lastSnapshot: snapshot,
          ips,
        };
      }),
    );
    return createSuccessResponse({ vps: vpsList });
  } catch (error) {
    return handleApiError(error);
  }
}
