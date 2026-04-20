/** @type {import('next').NextConfig} */

const path = require("path");

const isDev = process.env.NODE_ENV === "development";

// Derive Keycloak origin for CSP (allow loading resources from auth server)
const keycloakOrigin = (() => {
  const url = process.env.NEXT_PUBLIC_KEYCLOAK_URL?.trim() ||
    process.env.KEYCLOAK_URL?.trim();
  if (!url) return null;
  try { return new URL(url).origin; } catch { return null; }
})();

const documensoOrigin = (() => {
  const url = process.env.DOCUMENSO_URL?.trim() ||
    process.env.NEXT_PUBLIC_DOCUMENSO_URL?.trim();
  if (!url) return null;
  try { return new URL(url).origin; } catch { return null; }
})();

const keycloakCspSrc = keycloakOrigin ? ` ${keycloakOrigin}` : "";
const documensoCspSrc = documensoOrigin ? ` ${documensoOrigin}` : "";

const scriptSrc = isDev
  ? "'self' 'unsafe-inline' 'unsafe-eval'"
  : "'self' 'unsafe-inline'";

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
      "geolocation=()",
      "payment=()",
      "usb=()",
      "publickey-credentials-get=(self)",
      "publickey-credentials-create=(self)",
    ].join(", "),
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `connect-src 'self'${keycloakCspSrc}${documensoCspSrc} https://nominatim.openstreetmap.org https://www.googleapis.com`,
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `frame-src 'self'${keycloakCspSrc}${documensoCspSrc}`,
      `form-action 'self'${keycloakCspSrc}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; "),
  },
  ...(!isDev
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  webpack(config) {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@": path.resolve(__dirname),
    };
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
