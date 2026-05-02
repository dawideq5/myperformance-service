/**
 * Dashboard URL helper for upload-bridge → main dashboard callbacks.
 * Uses DASHBOARD_URL env (set via Coolify), defaulting to production FQDN.
 */
export function getDashboardUrl(): string {
  const raw = process.env.DASHBOARD_URL?.trim() || "https://myperformance.pl";
  return raw.replace(/\/$/, "");
}
