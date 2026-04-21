/**
 * Minimal JSON logger for the dashboard (server-side only).
 *
 * Outputs a single NDJSON line per event so Coolify/Traefik/Loki can parse
 * without a multi-line grok rule. Use instead of scattered console.log /
 * console.error calls — those are noisy and unstructured.
 *
 *   import { log } from "@/lib/logger";
 *   log.info("certificate issued", { subject, actor });
 *   log.warn("keycloak userinfo failed", { status: res.status });
 *   const child = log.child({ module: "step-ca" });
 *
 * Log level is controlled by the LOG_LEVEL env var (debug|info|warn|error).
 * Defaults to "info" in production, "debug" under NODE_ENV=development.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveMinPriority(): number {
  const envLevel = process.env.LOG_LEVEL?.trim().toLowerCase() as LogLevel | undefined;
  if (envLevel && envLevel in LEVEL_PRIORITY) {
    return LEVEL_PRIORITY[envLevel];
  }
  return process.env.NODE_ENV === "development"
    ? LEVEL_PRIORITY.debug
    : LEVEL_PRIORITY.info;
}

const minPriority = resolveMinPriority();

function emit(level: LogLevel, message: string, fields?: LogFields): void {
  if (LEVEL_PRIORITY[level] < minPriority) return;

  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    message,
  };

  if (fields) {
    for (const [k, v] of Object.entries(fields)) {
      if (v instanceof Error) {
        entry[k] = { name: v.name, message: v.message, stack: v.stack };
      } else {
        entry[k] = v;
      }
    }
  }

  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
}

function buildLogger(bindings: LogFields = {}): Logger {
  const withBindings = (extra?: LogFields): LogFields | undefined =>
    extra ? { ...bindings, ...extra } : Object.keys(bindings).length ? bindings : undefined;

  return {
    debug: (msg, fields) => emit("debug", msg, withBindings(fields)),
    info: (msg, fields) => emit("info", msg, withBindings(fields)),
    warn: (msg, fields) => emit("warn", msg, withBindings(fields)),
    error: (msg, fields) => emit("error", msg, withBindings(fields)),
    child: (extra) => buildLogger({ ...bindings, ...extra }),
  };
}

export const log = buildLogger();
