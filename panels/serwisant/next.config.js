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
const livekitOrigin = (() => {
  const raw = process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim() || "wss://livekit.myperformance.pl";
  const url = raw.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  try { return new URL(url).origin; } catch { return null; }
})();
const livekitWss = livekitOrigin ? ` wss://${new URL(livekitOrigin).host}` : "";
const livekitHttps = livekitOrigin ? ` ${livekitOrigin}` : "";
const kc = keycloakOrigin ? ` ${keycloakOrigin}` : "";
const dash = dashboardOrigin ? ` ${dashboardOrigin}` : "";
const directus = directusOrigin ? ` ${directusOrigin}` : "";
// Mapy: CartoDB Dark Matter (ciemny motyw) + OSM (fallback) + unpkg
// (Leaflet marker icons). Bez tych wpisów panele NIE WYŚWIETLAJĄ MAP.
const mapTilesSrc =
  "https://*.basemaps.cartocdn.com https://*.tile.openstreetmap.org https://tile.openstreetmap.org";
const leafletAssetsSrc = "https://unpkg.com";

// 'wasm-unsafe-eval' wymagane dla Draco/WebAssembly przy ładowaniu modelu 3D
// w podglądzie urządzenia (panel-serwisant → DiagnozaTab → Pokaż urządzenie).
// Bez tego ładowanie GLB rzuca CSP error.
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
      // blob: + data: wymagane przez GLTFLoader — embedded PNG textury w .glb
      // są wyodrębniane jako blob: URL i ładowane via fetch. Bez tego CSP
      // blokuje texture loading na ścisłych browserach (Windows Edge/Chrome).
      `connect-src 'self' blob: data:${kc}${dash}${directus}${livekitWss}${livekitHttps} ${mapTilesSrc}`,
      `media-src 'self' blob:`,
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
