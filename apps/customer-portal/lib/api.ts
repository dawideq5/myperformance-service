/**
 * BFF helper — wszystkie wywołania `/api/customer-portal/*` idą do dashboardu
 * (env DASHBOARD_URL). W produkcji to `https://myperformance.pl`. Cookie
 * `customer_portal_otp_session` jest scope=.zlecenieserwisowe.pl, więc nie
 * leci do myperformance.pl. Aby auth zadziałał cross-origin musimy:
 *   - wywoływać z `credentials: "include"` (cookie z ustawioną Domain=.zlecenieserwisowe.pl
 *     leci do *.zlecenieserwisowe.pl, więc przekierowujemy przez subdomain
 *     `api.zlecenieserwisowe.pl` jeśli ustawiona; w innym wypadku front-app
 *     proxy przez `/api/proxy/*` w portal — Faza 2 dorobi nginx route).
 *   - W FAZIE 1 najprostsze: front portal ma własne `/api/customer-portal/*`
 *     route handlers ktore robią fetch do dashboardu. Wtedy cookie zostaje
 *     na zlecenieserwisowe.pl (same-origin) — dashboard widzi tylko request
 *     bez cookie i zwraca dane wyłącznie po podpisanym tokenie z body /
 *     headera. ALE OTP session musi być dostępne do auth — więc cookie set
 *     przez nasze proxy.
 *
 * Implementation: `apiFetch` dudni do `/api/proxy/...` na portalu (same-origin).
 * Proxy handler na portalu re-issues request do dashboardu, copies cookies in
 * both directions. Patrz `apps/customer-portal/app/api/proxy/[...path]/route.ts`.
 */

const PROXY_PREFIX = "/api/proxy";

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  const url = `${PROXY_PREFIX}${path.startsWith("/") ? path : `/${path}`}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : "network",
    };
  }
  let payload: unknown = undefined;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: "non_json", body: text };
    }
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error:
        (payload as { error?: string } | undefined)?.error ?? `http_${res.status}`,
    };
  }
  return { ok: true, status: res.status, data: payload as T };
}
