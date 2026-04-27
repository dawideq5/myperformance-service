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
  Labels?: Record<string, string>;
  SizeRw?: number;
  SizeRootFs?: number;
}

interface SystemDfResponse {
  LayersSize: number;
  Images: Array<{ Size: number; SharedSize: number }>;
  Containers: Array<{ SizeRw: number; SizeRootFs: number }>;
  Volumes: Array<{ UsageData?: { Size: number } }>;
  BuildCache?: Array<{ Size: number }>;
}

interface FilesystemRow {
  device: string;
  mountpoint: string;
  fstype: string;
  totalBytes: number;
  usedBytes: number;
  availBytes: number;
}

interface ContainerStat {
  name: string;
  app: string;
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
  diskRw: number;
  diskRootFs: number;
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

// Storage cache — /system/df jest WOLNY (walk po wszystkich layerach +
// liczy volumes). Refreshujemy w tle, request odpytujący dostaje to co
// jest, fallback na poprzedni snapshot gdy timeout.
let storageCache: {
  data: SystemDfResponse | null;
  fetchedAt: number;
  inFlight: Promise<SystemDfResponse> | null;
} = { data: null, fetchedAt: 0, inFlight: null };
const STORAGE_TTL_MS = 5 * 60_000; // 5 min

async function getStorageCached(): Promise<SystemDfResponse | null> {
  const now = Date.now();
  const fresh = storageCache.data && now - storageCache.fetchedAt < STORAGE_TTL_MS;
  if (fresh) return storageCache.data;
  if (storageCache.inFlight) {
    // Don't block na trwającym fetchu — zwróć stale, refresh w tle
    if (storageCache.data) return storageCache.data;
    try {
      return await storageCache.inFlight;
    } catch {
      return null;
    }
  }
  storageCache.inFlight = (async () => {
    const data = await fetchJson<SystemDfResponse>("/system/df", 30_000);
    storageCache = { data, fetchedAt: Date.now(), inFlight: null };
    return data;
  })();
  try {
    return await storageCache.inFlight;
  } catch (err) {
    storageCache.inFlight = null;
    if (storageCache.data) return storageCache.data; // serve stale on err
    throw err;
  }
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

/**
 * Heurystyka: wyciągamy "app name" z labelek Coolify lub z nazwy kontenera.
 * Coolify dodaje `coolify.applicationId` lub `coolify.serviceId` do labelek
 * uruchamianych aplikacji. Container name pattern: `<service>-<uuid>` albo
 * `<uuid>-<timestamp>`. Próbujemy uzyskać czytelną nazwę aplikacji.
 */
function deriveAppName(c: ContainerListItem): string {
  const labels = c.Labels ?? {};
  // Wazuh containers labelują się hostname'em
  if (labels["com.docker.compose.project"]?.length) {
    const proj = labels["com.docker.compose.project"];
    if (proj.includes("wazuh")) return "Wazuh SIEM";
    return `compose:${proj}`;
  }
  // Coolify managed-service uses managed=service id
  const serviceName = labels["coolify.serviceId"] || labels["coolify.applicationId"];
  if (serviceName) return `coolify:${serviceName.slice(0, 12)}`;

  const name = (c.Names[0] ?? "").replace(/^\//, "");
  // Pattern: keycloak-<24chars>, postgres-<24chars> → wyciągamy prefix
  const friendly = name.match(
    /^(keycloak|postgres|postgresql|redis|mariadb|directus|outline|moodle|chatwoot|chatwoot-rails|chatwoot-sidekiq|smtp|web|worker|documenso|database|coolify|coolify-db|coolify-redis|coolify-realtime|coolify-proxy|docker-socket-proxy)/i,
  );
  if (friendly) {
    const norm = friendly[1]!.toLowerCase();
    const map: Record<string, string> = {
      keycloak: "Keycloak",
      postgres: "PostgreSQL",
      postgresql: "PostgreSQL",
      redis: "Redis",
      mariadb: "MariaDB",
      directus: "Directus CMS",
      outline: "Outline",
      moodle: "Moodle",
      chatwoot: "Chatwoot",
      "chatwoot-rails": "Chatwoot",
      "chatwoot-sidekiq": "Chatwoot",
      smtp: "Postal",
      web: "Postal",
      worker: "Postal",
      documenso: "Documenso",
      database: "Documenso",
      coolify: "Coolify",
      "coolify-db": "Coolify",
      "coolify-redis": "Coolify",
      "coolify-realtime": "Coolify",
      "coolify-proxy": "Traefik (Coolify)",
      "docker-socket-proxy": "Docker proxy",
    };
    return map[norm] ?? norm;
  }
  // Wazuh containers: wazuh.manager-<uuid>, wazuh.indexer-<uuid>, wazuh.dashboard-<uuid>
  if (name.startsWith("wazuh.")) return "Wazuh SIEM";
  // Coolify app pattern: <24-char-uuid>-<timestamp> → application UUID
  const uuidMatch = name.match(/^([a-z0-9]{24})-/);
  if (uuidMatch) {
    const u = uuidMatch[1]!;
    const map: Record<string, string> = {
      cft13k98wnuqm4u8p6freksn: "Dashboard (Next.js)",
      pu8b37hw19akg5gx1445j3f2: "Directus CMS",
      hg0i1ii7tg5btyok3o2gqnf0: "Keycloak",
      gpzcsydkhww03dxunov3r8vf: "Docuseal",
      zdlueek1sg2dgdbi7nk5xrh5: "Chatwoot",
      q4ir8kyx1af5ibh926bxno9f: "Plunk",
      dvx7b9t8ng9ymsbdsnenrr01: "step-ca",
      j25t315yl6ei2yrqsu8678hl: "Panel sprzedawca",
      h2azkj3hconcktdleledntcj: "Panel serwisant",
      wx710sd7tvmu9f7qsbu907u3: "Panel kierowca",
      o4roacrk9qxh08gwv37iphd1: "Outline",
      iut9wf1rz9ey54g7lbkje0je: "Postal",
      upzcjtn9rcswer2vg2vey5d3: "Moodle",
      c9dxxjvb3rskueiuguudbqgb: "Documenso",
      l2ga2hk4o66obbw9uoe60wgc: "Wazuh SIEM",
    };
    return map[u] ?? `Inne (${u.slice(0, 8)}…)`;
  }
  return "Inne";
}

async function collectContainers(): Promise<{
  containers: ContainerStat[];
  error: string | null;
}> {
  try {
    // size=true daje SizeRw/SizeRootFs per container (kosztowne ale przydatne)
    const list = await fetchJson<ContainerListItem[]>(
      "/containers/json?size=true",
    );
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
          app: deriveAppName(c),
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
          diskRw: c.SizeRw ?? 0,
          diskRootFs: c.SizeRootFs ?? 0,
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

async function collectStorage(): Promise<{
  filesystems: FilesystemRow[];
  dockerDf: {
    layers: number;
    imagesCount: number;
    imagesSize: number;
    containersSize: number;
    volumesSize: number;
    buildCacheSize: number;
  } | null;
  error: string | null;
}> {
  try {
    const df = await getStorageCached();
    if (!df) {
      return {
        filesystems: [],
        dockerDf: null,
        error: "Storage data not yet collected (próbuj za chwilę).",
      };
    }
    const imagesSize = df.Images.reduce((s, i) => s + i.Size, 0);
    const containersSize = df.Containers.reduce(
      (s, c) => s + (c.SizeRw ?? 0) + (c.SizeRootFs ?? 0),
      0,
    );
    const volumesSize = df.Volumes.reduce(
      (s, v) => s + (v.UsageData?.Size ?? 0),
      0,
    );
    const buildCacheSize = (df.BuildCache ?? []).reduce(
      (s, b) => s + b.Size,
      0,
    );
    return {
      filesystems: [],
      dockerDf: {
        layers: df.LayersSize,
        imagesCount: df.Images.length,
        imagesSize,
        containersSize,
        volumesSize,
        buildCacheSize,
      },
      error: null,
    };
  } catch (err) {
    return {
      filesystems: [],
      dockerDf: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    requireInfrastructure(session);

    const errors: string[] = [];
    const [info, containers, storage] = await Promise.all([
      collectInfo(),
      collectContainers(),
      collectStorage(),
    ]);
    if (info.error) errors.push(`Info: ${info.error}`);
    if (containers.error) errors.push(containers.error);
    if (storage.error) errors.push(`Storage: ${storage.error}`);

    return createSuccessResponse({
      machine: info.info,
      containers: containers.containers,
      storage: storage.dockerDf,
      collectedAt: new Date().toISOString(),
      errors,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
