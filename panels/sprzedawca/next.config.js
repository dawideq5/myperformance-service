/** @type {import("next").NextConfig} */
const isDev = process.env.NODE_ENV === "development";

const keycloakOrigin = (() => {
  const url = process.env.NEXT_PUBLIC_KEYCLOAK_URL?.trim() || process.env.KEYCLOAK_URL?.trim();
  if (!url) return null;
  try { return new URL(url).origin; } catch { return null; }
})();
const dashboardOrigin = (() => {
  const url = process.env.DASHBOARD_URL?.trim() || "https://myperformance.pl";
  try { return new URL(url).origin; } catch { return null; }
})();
const directusOrigin = (() => {
  const url = process.env.NEXT_PUBLIC_DIRECTUS_URL?.trim() || process.env.DIRECTUS_URL?.trim();
  if (!url) return null;
  try { return new URL(url).origin; } catch { return null; }
})();
const kc = keycloakOrigin ? ` ${keycloakOrigin}` : "";
const dash = dashboardOrigin ? ` ${dashboardOrigin}` : "";
const directus = directusOrigin ? ` ${directusOrigin}` : "";
// Mapy: CartoDB Dark Matter (ciemny motyw) + OSM (fallback) + unpkg
// (Leaflet marker icons). Bez tych wpisów panele NIE WYŚWIETLAJĄ MAP.
const mapTilesSrc =
  "https://*.basemaps.cartocdn.com https://*.tile.openstreetmap.org https://tile.openstreetmap.org";
const leafletAssetsSrc = "https://unpkg.com";

// 'wasm-unsafe-eval' wymagane dla Draco/WebAssembly przy ładowaniu modelu 3D
// w konfiguratorze stanu wizualnego (panel-sprzedawca → Dodaj serwis →
// Stan wizualny → 3D walkthrough). Bez tego ładowanie GLB rzuca CSP error.
const scriptSrc = isDev
  ? "'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'"
  : "'self' 'unsafe-inline' 'wasm-unsafe-eval'";

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
      `connect-src 'self'${kc}${dash}${directus} ${mapTilesSrc}`,
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: ${mapTilesSrc} ${leafletAssetsSrc}${dash}${directus}`,
      "font-src 'self' data:",
      `frame-src 'self'${kc}`,
      `form-action 'self'${kc}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
      "worker-src 'self' blob:",
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
    return [
      { source: "/:path*", headers: securityHeaders },
      // GLB/draco files — wymuszony binary content-type + długi cache.
      // Bez tego niektóre browsery (Windows Edge/Chrome) nie dekodują
      // osadzonych PNG tekstur poprawnie.
      {
        source: "/models/:path*.glb",
        headers: [
          { key: "Content-Type", value: "model/gltf-binary" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/draco/:path*.wasm",
        headers: [
          { key: "Content-Type", value: "application/wasm" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
