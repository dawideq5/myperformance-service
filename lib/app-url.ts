import { trimSlash } from "@/lib/utils";

const DEFAULT_PUBLIC_APP_URL = "http://localhost:3000";

export function getPublicAppUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return trimSlash(appUrl || DEFAULT_PUBLIC_APP_URL);
}

export function getPublicLogoutRedirectUrl() {
  return `${getPublicAppUrl()}/`;
}

export function getLoginPath() {
  return "/login";
}

export function getDashboardPath() {
  return "/dashboard";
}
