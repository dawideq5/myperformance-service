/**
 * Pure helpers and types for the admin/infrastructure UI.
 *
 * Extracted from InfrastructureClient.tsx as part of the faza-3 split.
 * Keep this module DOM-free so it can be imported by server tests.
 */

export interface VpsItem {
  name: string;
  info: {
    displayName: string;
    state: string;
    zone: string;
    offerType: string;
    model: { name: string; disk: number; memory: number; vcore: number };
    vcore: number;
    memoryLimit: number;
    iamState?: string;
  } | null;
  automatedBackup: {
    state: string;
    schedule: string;
    rotation: number;
  } | null;
  lastSnapshot: {
    id: string;
    description: string;
    creationDate: string;
    region: string;
  } | null;
  ips: string[];
}

export interface DnsRecord {
  id: number;
  fieldType: string;
  subDomain: string;
  target: string;
  ttl: number;
  zone: string;
}

export interface MachineInfo {
  ncpu: number | null;
  memTotal: number | null;
  containersRunning: number | null;
  containersStopped: number | null;
  kernel: string | null;
  driver: string | null;
}

export interface ContainerStat {
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

export interface DockerStorage {
  layers: number;
  imagesCount: number;
  imagesSize: number;
  containersSize: number;
  volumesSize: number;
  buildCacheSize: number;
}

export interface ResourcesData {
  machine: MachineInfo;
  containers: ContainerStat[];
  storage: DockerStorage | null;
  collectedAt: string;
  errors: string[];
}

export interface AppAggregate {
  app: string;
  cpu: number;
  mem: number;
  containers: number;
}

export const GB = 1024 ** 3;
export const MB = 1024 ** 2;

export function fmtBytes(n: number): string {
  if (n >= GB) return `${(n / GB).toFixed(2)} GB`;
  if (n >= MB) return `${(n / MB).toFixed(0)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

/** Aggregate per-container stats by Coolify "app" label. Sorted by RAM desc. */
export function aggregateByApp(containers: ContainerStat[]): AppAggregate[] {
  const map = new Map<string, AppAggregate>();
  for (const c of containers) {
    const cur = map.get(c.app) ?? {
      app: c.app,
      cpu: 0,
      mem: 0,
      containers: 0,
    };
    cur.cpu += c.cpuPercent;
    cur.mem += c.memUsage;
    cur.containers += 1;
    map.set(c.app, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.mem - a.mem);
}

/**
 * Color palette for charts/lists in the resources panel.
 * Stable order so neighbouring renders use the same colour for the same app.
 */
export const PALETTE = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#14b8a6", "#f97316", "#84cc16",
  "#3b82f6", "#a855f7", "#64748b", "#eab308", "#22c55e",
];

/**
 * Map a usage percentage onto a tone bucket using the standard thresholds
 * (≥90 danger, ≥70 warning, otherwise success).
 */
export function usageTone(pct: number): "danger" | "warning" | "success" {
  if (pct >= 90) return "danger";
  if (pct >= 70) return "warning";
  return "success";
}

export function usageColorClass(
  tone: "danger" | "warning" | "success",
): string {
  switch (tone) {
    case "danger":
      return "bg-red-500";
    case "warning":
      return "bg-amber-500";
    default:
      return "bg-emerald-500";
  }
}

/** Available DNS zones in OVH. */
export const DNS_ZONES = [
  "myperformance.pl",
  "pakietochronny.pl",
  "zlecenieserwisowe.pl",
] as const;

export type DnsZone = (typeof DNS_ZONES)[number];
