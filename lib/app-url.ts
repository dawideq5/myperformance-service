const DEFAULT_PUBLIC_APP_URL = "https://myperformance.pl";

const trimSlash = (value: string) => value.replace(/\/+$/, "");

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
