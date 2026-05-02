/**
 * CORS helpers dla `/api/customer-portal/*` — apka kliencka chodzi na
 * https://zlecenieserwisowe.pl, dashboard API na https://myperformance.pl.
 * Przeglądarka wymaga `Access-Control-Allow-Origin` + `Allow-Credentials` żeby
 * cookie OTP session leciał cross-origin.
 *
 * Allowlista: zlecenieserwisowe.pl + www.zlecenieserwisowe.pl + dev (3000).
 * Inne origin → odpowiadamy bez nagłówków CORS, request pójdzie ale bez cookie.
 */

const ALLOWED_ORIGINS = new Set<string>([
  "https://zlecenieserwisowe.pl",
  "https://www.zlecenieserwisowe.pl",
  "http://localhost:3001",
  "http://localhost:3000",
]);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  if (!ALLOWED_ORIGINS.has(origin)) {
    return {};
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    Vary: "Origin",
  };
}

export function preflightResponse(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}
