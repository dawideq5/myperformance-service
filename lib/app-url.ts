const DEFAULT_APP_URL = "https://myperformance.pl";

function trimSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function normalizeKnownHost(url: URL) {
  if (url.hostname === "www.myperformance.pl") {
    url.hostname = "myperformance.pl";
  }

  return url;
}

function toNormalizedUrl(value: string) {
  const normalized = value.trim();
  const withProtocol = /^https?:\/\//i.test(normalized)
    ? normalized
    : `https://${normalized}`;

  return normalizeKnownHost(new URL(trimSlash(withProtocol)));
}

export function getCanonicalAppUrl() {
  const configuredUrl =
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    DEFAULT_APP_URL;

  return trimSlash(toNormalizedUrl(configuredUrl).toString());
}

export function getCanonicalLoginUrl() {
  return `${getCanonicalAppUrl()}/login`;
}

export function getCanonicalDashboardUrl() {
  return `${getCanonicalAppUrl()}/dashboard`;
}

export function normalizeAuthRedirect(url: string, baseUrl?: string) {
  const canonicalBase = new URL(getCanonicalAppUrl());
  const resolvedBase = baseUrl ? toNormalizedUrl(baseUrl) : canonicalBase;

  if (url.startsWith("/")) {
    return new URL(url, canonicalBase).toString();
  }

  try {
    const target = toNormalizedUrl(url);
    if (
      target.origin === canonicalBase.origin ||
      target.origin === resolvedBase.origin
    ) {
      target.protocol = canonicalBase.protocol;
      target.host = canonicalBase.host;
      return target.toString();
    }
  } catch {
    return canonicalBase.toString();
  }

  return canonicalBase.toString();
}
