export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireInfrastructure } from "@/lib/admin-auth";
import { createSuccessResponse, handleApiError } from "@/lib/api-utils";
import { log } from "@/lib/logger";

const logger = log.child({ module: "infra-resources" });

const DOCKER_API_URL =
  process.env.DOCKER_API_URL ?? "http://docker-socket-proxy:2375";

interface ContainerListItem {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
}

interface ContainerStat {
  name: string;
  image: string;
  status: string;
  cpuPercent: number;
  memUsage: number;
  memLimit: number;
  memPercent: number;
  netRx: number;
  netTx: number;
  blockRead: number;
  blockWrite: number;
}

interface DockerStatsResponse {
  cpu_stats: {
    cpu_usage: { total_usage: number };
    system_cpu_usage: number;
    online_cpus?: number;
  };
  precpu_stats: {
    cpu_usage: { total_usage: number };
    system_cpu_usage: number;
  };
  memory_stats: {
    usage: number;
    limit: number;
    stats?: { cache?: number; inactive_file?: number };
  };
  networks?: Record<string, { rx_bytes: number; tx_bytes: number }>;
  blkio_stats: {
    io_service_bytes_recursive?: Array<{ op: string; value: number }>;
  };
}

interface InfoResponse {
  NCPU?: number;
  MemTotal?: number;
  Driver?: string;
  Containers?: number;
  ContainersRunning?: number;
  ContainersStopped?: number;
  KernelVersion?: string;
}

interface MachineInfo {
  ncpu: number | null;
  memTotal: number | null;
  containersRunning: number | null;
  containersStopped: number | null;
  kernel: string | null;
  driver: string | null;
}

function calcCpuPercent(s: DockerStatsResponse): number {
  const cpuDelta =
    s.cpu_stats.cpu_usage.total_usage - s.precpu_stats.cpu_usage.total_usage;
  const sysDelta =
    s.cpu_stats.system_cpu_usage - s.precpu_stats.system_cpu_usage;
  if (sysDelta > 0 && cpuDelta > 0) {
    const cpus = s.cpu_stats.online_cpus ?? 1;
    return (cpuDelta / sysDelta) * cpus * 100;
  }
  return 0;
}

function memUsageMinusCache(s: DockerStatsResponse): number {
  const cache = s.memory_stats.stats?.cache ?? s.memory_stats.stats?.inactive_file ?? 0;
  return Math.max(0, s.memory_stats.usage - cache);
}

function sumNetwork(s: DockerStatsResponse): { rx: number; tx: number } {
  let rx = 0;
  let tx = 0;
  for (const v of Object.values(s.networks ?? {})) {
    rx += v.rx_bytes;
    tx += v.tx_bytes;
  }
  return { rx, tx };
}

function sumBlockIO(s: DockerStatsResponse): { read: number; write: number } {
  let read = 0;
  let write = 0;
  for (const e of s.blkio_stats.io_service_bytes_recursive ?? []) {
    if (e.op === "read" || e.op === "Read") read += e.value;
    else if (e.op === "write" || e.op === "Write") write += e.value;
  }
  return { read, write };
}

async function fetchJson<T>(path: string, timeoutMs = 6000): Promise<T> {
  const res = await fetch(`${DOCKER_API_URL}${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`docker proxy ${path} → ${res.status}`);
  }
  return (await res.json()) as T;
}

async function collectInfo(): Promise<{
  info: MachineInfo;
  error: string | null;
}> {
  try {
    const i = await fetchJson<InfoResponse>("/info");
    return {
      info: {
        ncpu: i.NCPU ?? null,
        memTotal: i.MemTotal ?? null,
        containersRunning: i.ContainersRunning ?? null,
        containersStopped: i.ContainersStopped ?? null,
        kernel: i.KernelVersion ?? null,
        driver: i.Driver ?? null,
      },
      error: null,
    };
  } catch (err) {
    return {
      info: {
        ncpu: null,
        memTotal: null,
        containersRunning: null,
        containersStopped: null,
        kernel: null,
        driver: null,
      },
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function collectContainers(): Promise<{
  containers: ContainerStat[];
  error: string | null;
}> {
  try {
    const list = await fetchJson<ContainerListItem[]>("/containers/json");
    // równoległe stats — limit 30 jednocześnie żeby nie zaprzeć dockera.
    const stats = await Promise.allSettled(
      list.map(async (c) => {
        const s = await fetchJson<DockerStatsResponse>(
          `/containers/${c.Id}/stats?stream=false`,
        );
        const memUsage = memUsageMinusCache(s);
        const memLimit = s.memory_stats.limit;
        const net = sumNetwork(s);
        const block = sumBlockIO(s);
        return {
          name: (c.Names[0] ?? c.Id).replace(/^\//, ""),
          image: c.Image,
          status: c.Status,
          cpuPercent: calcCpuPercent(s),
          memUsage,
          memLimit,
          memPercent: memLimit > 0 ? (memUsage / memLimit) * 100 : 0,
          netRx: net.rx,
          netTx: net.tx,
          blockRead: block.read,
          blockWrite: block.write,
        } satisfies ContainerStat;
      }),
    );
    const containers: ContainerStat[] = [];
    for (const r of stats) {
      if (r.status === "fulfilled") containers.push(r.value);
    }
    return { containers, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("docker-socket-proxy unreachable", { err: msg });
    return {
      containers: [],
      error: `Docker stats niedostępne: ${msg.slice(0, 120)}`,
    };
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireInfrastructure(session);

    const errors: string[] = [];
    const [info, containers] = await Promise.all([
      collectInfo(),
      collectContainers(),
    ]);
    if (info.error) errors.push(`Info: ${info.error}`);
    if (containers.error) errors.push(containers.error);

    return createSuccessResponse({
      machine: info.info,
      containers: containers.containers,
      collectedAt: new Date().toISOString(),
      errors,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
