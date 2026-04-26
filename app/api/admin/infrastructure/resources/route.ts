export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { exec } from "child_process";
import { promisify } from "util";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireInfrastructure } from "@/lib/admin-auth";
import { getOvhConfig } from "@/lib/email/db";
import { listVps } from "@/lib/email/ovh";
import { createSuccessResponse, handleApiError } from "@/lib/api-utils";
import { log } from "@/lib/logger";

const execAsync = promisify(exec);
const logger = log.child({ module: "infra-resources" });

interface VpsUsage {
  cpu: number | null;
  memory: { used: number; total: number } | null;
  disk: { used: number; total: number } | null;
  bandwidth: { in: number; out: number } | null;
}

interface ContainerStat {
  name: string;
  cpuPercent: number;
  memUsage: number;
  memLimit: number;
  memPercent: number;
  netRx: number;
  netTx: number;
  status: string;
}

/**
 * Parsuje "100MiB / 8GiB" → bytes (used, limit).
 */
function parseSize(s: string): number {
  const match = s.match(/([\d.]+)\s*([KMGT]?i?B)/i);
  if (!match) return 0;
  const n = parseFloat(match[1]!);
  const unit = match[2]!.toUpperCase();
  const map: Record<string, number> = {
    B: 1,
    KIB: 1024,
    KB: 1000,
    MIB: 1024 ** 2,
    MB: 1000 ** 2,
    GIB: 1024 ** 3,
    GB: 1000 ** 3,
    TIB: 1024 ** 4,
    TB: 1000 ** 4,
  };
  return n * (map[unit] ?? 1);
}

async function collectDockerStats(): Promise<{
  containers: ContainerStat[];
  error: string | null;
}> {
  try {
    // Format JSON pojedyncze linie — łatwo parse'ować.
    const { stdout } = await execAsync(
      `docker stats --no-stream --format '{{json .}}'`,
      { timeout: 8000, maxBuffer: 5 * 1024 * 1024 },
    );
    const containers: ContainerStat[] = [];
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue;
      try {
        const j = JSON.parse(line) as {
          Name: string;
          CPUPerc: string;
          MemUsage: string;
          MemPerc: string;
          NetIO: string;
        };
        const [memUsedRaw, memLimitRaw] = j.MemUsage.split(" / ");
        const [netRxRaw, netTxRaw] = j.NetIO.split(" / ");
        containers.push({
          name: j.Name,
          cpuPercent: parseFloat(j.CPUPerc.replace("%", "")) || 0,
          memUsage: parseSize(memUsedRaw ?? "0"),
          memLimit: parseSize(memLimitRaw ?? "0"),
          memPercent: parseFloat(j.MemPerc.replace("%", "")) || 0,
          netRx: parseSize(netRxRaw ?? "0"),
          netTx: parseSize(netTxRaw ?? "0"),
          status: "running",
        });
      } catch {
        // skip malformed line
      }
    }
    return { containers, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("docker stats failed", { err: msg });
    return {
      containers: [],
      error: `Docker stats niedostępne: ${msg.slice(0, 100)}`,
    };
  }
}

async function collectVpsUsage(vpsName: string): Promise<{
  usage: VpsUsage | null;
  error: string | null;
}> {
  try {
    const config = await getOvhConfig();
    if (!config.appKey || !config.appSecret || !config.consumerKey) {
      return { usage: null, error: null };
    }
    // OVH API nie ma jednego endpointu z całością — zbieramy disk usage
    // z df via SSH. Dla VPS przez OVH API mamy tylko podstawowe info, a
    // CPU/RAM live to docker stats wystarczy. Dla disk: df.
    let diskUsed = 0;
    let diskTotal = 0;
    try {
      const { stdout } = await execAsync(
        `df -B1 / | awk 'NR==2 {print $2 "|" $3}'`,
        { timeout: 5000 },
      );
      const [total, used] = stdout.trim().split("|").map((x) => parseInt(x, 10));
      if (Number.isFinite(total)) diskTotal = total;
      if (Number.isFinite(used)) diskUsed = used;
    } catch {
      /* ignore */
    }
    return {
      usage: {
        cpu: null, // host CPU summary nie jest istotne, top-down z kontenerów
        memory: null,
        disk:
          diskTotal > 0
            ? { used: diskUsed / 1024 ** 3, total: diskTotal / 1024 ** 3 }
            : null,
        bandwidth: null,
      },
      error: null,
    };
  } catch (err) {
    return {
      usage: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireInfrastructure(session);

    let vpsName: string | undefined;
    try {
      const config = await getOvhConfig();
      if (config.appKey && config.appSecret && config.consumerKey) {
        const list = await listVps({
          endpoint: config.endpoint,
          appKey: config.appKey,
          appSecret: config.appSecret,
          consumerKey: config.consumerKey,
        });
        vpsName = list[0];
      }
    } catch {
      /* ignore */
    }

    const errors: string[] = [];
    const [docker, vpsUsage] = await Promise.all([
      collectDockerStats(),
      vpsName ? collectVpsUsage(vpsName) : Promise.resolve({ usage: null, error: null }),
    ]);
    if (docker.error) errors.push(docker.error);
    if (vpsUsage.error) errors.push(`VPS: ${vpsUsage.error}`);

    return createSuccessResponse({
      vpsUsage: vpsUsage.usage,
      containers: docker.containers,
      collectedAt: new Date().toISOString(),
      errors,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
