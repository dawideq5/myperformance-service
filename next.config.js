/** @type {import('next').NextConfig} */

const path = require("path");

const isDev = process.env.NODE_ENV === "development";

// Derive external origins that must be reachable from the browser. All other
// third-party calls (Google APIs, Nominatim, Documenso API, Chatwoot Platform
// API, …) are proxied through our own /api/* routes and stay inside 'self'.
function originOf(...candidates) {
  for (const raw of candidates) {
    const value = raw?.trim();
    if (!value) continue;
    try {
      return new URL(value).origin;
    } catch {
      /* fall through */
    }
  }
  return null;
}

const keycloakOrigin = originOf(
  process.env.NEXT_PUBLIC_KEYCLOAK_URL,
  process.env.KEYCLOAK_URL,
);
const documensoOrigin = originOf(
  process.env.NEXT_PUBLIC_DOCUMENSO_URL,
  process.env.DOCUMENSO_URL,
);

const externalOrigins = [keycloakOrigin, documensoOrigin].filter(Boolean);
const externalSrc = externalOrigins.length ? ` ${externalOrigins.join(" ")}` : "";

const scriptSrc = isDev
  ? "'self' 'unsafe-inline' 'unsafe-eval'"
  : "'self' 'unsafe-inline'"; // TODO: migrate to per-request nonces

const cspDirectives = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${externalSrc}`,
  `frame-src 'self'${externalSrc}`,
  `form-action 'self'${keycloakOrigin ? ` ${keycloakOrigin}` : ""}`,
  "frame-ancestors 'none'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "report-uri /api/csp-report",
];
if (!isDev) cspDirectives.push("upgrade-insecure-requests");

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
      "interest-cohort=()",
      "publickey-credentials-get=(self)",
      "publickey-credentials-create=(self)",
    ].join(", "),
  },
  { key: "Content-Security-Policy", value: cspDirectives.join("; ") },
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
  // mysql2 używa dynamicznego wymagania natywnych bindingów — bundler
  // Next'a go tree-shakuje/przekształca błędnie. Marking as server-external
  // packuje go tak jak `pg`.
  serverExternalPackages: ["mysql2"],
  outputFileTracingIncludes: {
    "/api/integrations/moodle/**": ["./node_modules/mysql2/**/*"],
  },
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,
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
      {
        source: "/api/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
