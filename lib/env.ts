/**
 * Server-side environment access helpers.
 *
 * - getRequiredEnv / getOptionalEnv: per-variable accessors
 * - getIntEnv / getBoolEnv: typed parsers with safe defaults
 * - validateServerEnv: startup gate — throws if any critical secret is
 *   missing or still set to a placeholder value
 */

export function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Environment variable ${name} is not configured`);
  }
  return value;
}

export function getOptionalEnv(name: string, defaultValue = ""): string {
  return process.env[name]?.trim() || defaultValue;
}

export function getIntEnv(name: string, defaultValue: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return defaultValue;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : defaultValue;
}

export function getBoolEnv(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return defaultValue;
  if (raw === "true" || raw === "1" || raw === "yes" || raw === "on") return true;
  if (raw === "false" || raw === "0" || raw === "no" || raw === "off") return false;
  return defaultValue;
}

/**
 * Env variables that MUST be present for the dashboard to boot. The list
 * intentionally includes only globally critical secrets — per-feature envs
 * (DOCUMENSO_API_KEY, CHATWOOT_*, STEP_CA_*, ...) are checked lazily inside
 * their respective lib/* modules so an individual feature can stay dark
 * without taking down auth.
 */
const REQUIRED_SERVER_ENV = [
  "NEXTAUTH_SECRET",
  "KEYCLOAK_URL",
  "KEYCLOAK_CLIENT_ID",
  "KEYCLOAK_CLIENT_SECRET",
];

const PLACEHOLDER_PATTERNS = [/^replace-with-/i, /^your-.*-here$/i, /^change-?me$/i];

export interface EnvValidationIssue {
  name: string;
  reason: "missing" | "placeholder";
}

export function collectServerEnvIssues(): EnvValidationIssue[] {
  const issues: EnvValidationIssue[] = [];
  for (const name of REQUIRED_SERVER_ENV) {
    const raw = process.env[name]?.trim();
    if (!raw) {
      issues.push({ name, reason: "missing" });
      continue;
    }
    if (PLACEHOLDER_PATTERNS.some((rx) => rx.test(raw))) {
      issues.push({ name, reason: "placeholder" });
    }
  }
  return issues;
}

let validated = false;

export function validateServerEnv(): void {
  if (validated) return;
  const issues = collectServerEnvIssues();
  if (issues.length > 0) {
    const detail = issues
      .map((i) => `${i.name} (${i.reason})`)
      .join(", ");
    throw new Error(`Server env validation failed: ${detail}`);
  }
  validated = true;
}
