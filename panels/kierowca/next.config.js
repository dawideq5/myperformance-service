/** @type {import("next").NextConfig} */
const isDev = process.env.NODE_ENV === "development";

const keycloakOrigin = (() => {
  const url = process.env.NEXT_PUBLIC_KEYCLOAK_URL?.trim() || process.env.KEYCLOAK_URL?.trim();
  if (!url) return null;
  try { return new URL(url).origin; } catch { return null; }
})();
const kc = keycloakOrigin ? ` ${keycloakOrigin}` : "";
const scriptSrc = isDev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";
// Leaflet — kafelki CARTO dark + ikony pinezek z unpkg.
const mapTilesSrc = "https://*.basemaps.cartocdn.com";
const leafletAssetsSrc = "https://unpkg.com";

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
      `connect-src 'self'${kc}`,
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: ${mapTilesSrc} ${leafletAssetsSrc}`,
      "font-src 'self' data:",
      `frame-src 'self'${kc}`,
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
  // Strict Mode dubluje mounty w dev — Leaflet rzuca "Map container
  // is already initialized" bo drugi `L.map()` trafia na zajęty `_leaflet_id`.
  // W prod Strict Mode nie podwaja, więc to wyłączenie nie zmniejsza
  // bezpieczeństwa — jest to dev-only quirk biblioteki react-leaflet.
  reactStrictMode: false,
  poweredByHeader: false,
  // Pin tracing root do tego panelu — bez tego Next.js wykrywa lockfile
  // root projektu i emituje warning na każdym restarcie.
  outputFileTracingRoot: __dirname,
  // Edge middleware NIE widzi process.env vars przekazanych z command-line.
  // Mapping przez `env:` inlinuje wartości w bundle middleware'u.
  env: {
    DEV_CERT_BYPASS: process.env.DEV_CERT_BYPASS ?? "",
    CERT_GATE_URL: process.env.CERT_GATE_URL ?? "",
    CERT_GATE_SECRET: process.env.CERT_GATE_SECRET ?? "",
    CERT_GATE_DEBUG: process.env.CERT_GATE_DEBUG ?? "",
    MTLS_REQUIRED: process.env.MTLS_REQUIRED ?? "",
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
module.exports = nextConfig;
