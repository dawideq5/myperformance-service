// Single source of truth dla linku "Powrót do dashboardu". Client components
// w "use client" widzą tylko zmienne `NEXT_PUBLIC_*` inlinowane przy buildzie.
// W dev: http://localhost:3000. W prod: https://myperformance.pl.
const base =
  process.env.NEXT_PUBLIC_DASHBOARD_URL?.trim().replace(/\/$/, "") ||
  "https://myperformance.pl";

export const DASHBOARD_HOME_URL = `${base}/dashboard`;
