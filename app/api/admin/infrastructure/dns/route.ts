export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireInfrastructure } from "@/lib/admin-auth";
import { getOvhConfig } from "@/lib/email/db";
import {
  listDnsRecords,
  getDnsRecord,
  createDnsRecord,
  deleteDnsRecord,
  refreshDnsZone,
} from "@/lib/email/ovh";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";

async function getCreds() {
  const config = await getOvhConfig();
  if (!config.appKey || !config.appSecret || !config.consumerKey) {
    throw new ApiError("SERVICE_UNAVAILABLE", "OVH credentials not configured", 503);
  }
  return {
    endpoint: config.endpoint,
    appKey: config.appKey,
    appSecret: config.appSecret,
    consumerKey: config.consumerKey,
  };
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireInfrastructure(session);
    const url = new URL(req.url);
    const zone = url.searchParams.get("zone");
    if (!zone) throw ApiError.badRequest("zone query required");

    const creds = await getCreds();
    const ids = await listDnsRecords(creds, zone);
    // Fetch szczegóły — limit 200 record-ów żeby nie spamować OVH.
    const limited = ids.slice(0, 200);
    const records = await Promise.all(
      limited.map((id) => getDnsRecord(creds, zone, id).catch(() => null)),
    );
    return createSuccessResponse({
      zone,
      total: ids.length,
      shown: records.length,
      records: records.filter((r): r is NonNullable<typeof r> => r !== null),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

interface PostPayload {
  zone: string;
  fieldType: string;
  subDomain: string;
  target: string;
  ttl?: number;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireInfrastructure(session);
    const body = (await req.json().catch(() => null)) as PostPayload | null;
    if (!body?.zone || !body?.fieldType || body?.subDomain === undefined || !body?.target) {
      throw ApiError.badRequest("zone + fieldType + subDomain + target required");
    }
    const creds = await getCreds();
    const created = await createDnsRecord(creds, body.zone, {
      fieldType: body.fieldType,
      subDomain: body.subDomain,
      target: body.target,
      ttl: body.ttl ?? 3600,
    });
    await refreshDnsZone(creds, body.zone);
    return createSuccessResponse({ record: created });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    requireInfrastructure(session);
    const url = new URL(req.url);
    const zone = url.searchParams.get("zone");
    const id = url.searchParams.get("id");
    if (!zone || !id) throw ApiError.badRequest("zone + id required");
    const creds = await getCreds();
    await deleteDnsRecord(creds, zone, Number(id));
    await refreshDnsZone(creds, zone);
    return createSuccessResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
