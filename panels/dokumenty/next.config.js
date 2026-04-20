/** @type {import("next").NextConfig} */
const isDev = process.env.NODE_ENV === "development";

function originOf(url) {
  if (!url) return null;
  try { return new URL(url).origin; } catch { return null; }
}
const keycloakOrigin = originOf(
  process.env.NEXT_PUBLIC_KEYCLOAK_URL?.trim() ||
  process.env.KEYCLOAK_URL?.trim() ||
  process.env.KEYCLOAK_ISSUER?.trim() ||
  ""
);
const docusealOrigin = originOf(
  process.env.DOCUSEAL_URL?.trim() ||
  process.env.NEXT_PUBLIC_DOCUSEAL_URL?.trim() ||
  ""
);
const kc = keycloakOrigin ? ` ${keycloakOrigin}` : "";
const ds = docusealOrigin ? ` ${docusealOrigin}` : "";
const scriptSrc = isDev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: [
      "camera=()",
      "microphone=()",
      "geolocation=(self)",
      "payment=()",
      "usb=()",
    ].join(", "),
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `connect-src 'self'${kc}${ds}`,
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `frame-src 'self'${kc}${ds}`,
      `form-action 'self'${kc}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; "),
  },
  ...(!isDev
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
module.exports = nextConfig;
