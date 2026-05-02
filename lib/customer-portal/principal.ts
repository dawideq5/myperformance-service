import { OTP_COOKIE_NAME, verifyOtpSession } from "./session";

/**
 * Principal dla `/api/customer-portal/*` — albo OTP-bound (publiczny status
 * check, tylko email scope), albo session-bound (zalogowany user przez next-auth
 * Keycloak realm `klienci`). Faza 1 obsługuje tylko OTP path; session-jwt
 * dorobimy z Faza 2 dashboardu.
 */

export interface CustomerPrincipal {
  email: string;
  mode: "otp" | "session";
}

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  const parts = raw.split(/;\s*/);
  for (const p of parts) {
    const idx = p.indexOf("=");
    if (idx < 0) continue;
    const k = p.slice(0, idx).trim();
    if (k === name) return decodeURIComponent(p.slice(idx + 1).trim());
  }
  return null;
}

export function getCustomerPrincipal(req: Request): CustomerPrincipal | null {
  const otpToken = readCookie(req, OTP_COOKIE_NAME);
  if (otpToken) {
    const payload = verifyOtpSession(otpToken);
    if (payload) {
      return { email: payload.email, mode: "otp" };
    }
  }
  // TODO Faza 2: parse next-auth __Secure-next-auth.session-token na realm `klienci`.
  return null;
}
