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
const wazuhOrigin = originOf(
  process.env.NEXT_PUBLIC_WAZUH_URL,
  "https://wazuh.myperformance.pl",
);

const externalOrigins = [keycloakOrigin, documensoOrigin, wazuhOrigin].filter(Boolean);
const externalSrc = externalOrigins.length ? ` ${externalOrigins.join(" ")}` : "";

const scriptSrc = isDev
  ? "'self' 'unsafe-inline' 'unsafe-eval'"
  : "'self' 'unsafe-inline'"; // TODO: migrate to per-request nonces

// Map tiles + unpkg (Leaflet marker icons) + Directus (uploaded photos).
// Bez tych mapy się NIE WCZYTUJĄ — browser blokuje tile fetch przez CSP.
// CartoDB Dark Matter dla ciemnego motywu + OSM fallback.
const osmTilesSrc =
  "https://*.basemaps.cartocdn.com https://*.tile.openstreetmap.org https://tile.openstreetmap.org";
const leafletAssetsSrc = "https://unpkg.com";
const directusOrigin = originOf(
  process.env.NEXT_PUBLIC_DIRECTUS_URL,
  process.env.DIRECTUS_URL,
);
const nominatimSrc = "https://nominatim.openstreetmap.org";
const photosSrc = directusOrigin ? ` ${directusOrigin}` : "";

const cspDirectives = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${osmTilesSrc} ${leafletAssetsSrc}${photosSrc}`,
  "font-src 'self' data:",
  `connect-src 'self'${externalSrc} ${osmTilesSrc} ${nominatimSrc}${photosSrc}`,
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

// Report-Only CSP — strict version BEZ 'unsafe-inline'. Browsery NIE blokują
// inline scripts, ale wysyłają report do /api/csp-report dla każdego
// violation. Pozwala monitorować skalę unsafe-inline w aplikacji przed
// migracją do nonce-based strict CSP. Po wyzerowaniu reportów można
// usunąć 'unsafe-inline' z głównego CSP.
const cspReportOnlyDirectives = !isDev
  ? [
      "default-src 'self'",
      "script-src 'self'", // BEZ unsafe-inline — to chcemy osiągnąć
      "style-src 'self'",  // BEZ unsafe-inline
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `connect-src 'self'${externalSrc}`,
      `frame-src 'self'${externalSrc}`,
      `form-action 'self'${keycloakOrigin ? ` ${keycloakOrigin}` : ""}`,
      "frame-ancestors 'none'",
      "worker-src 'self' blob:",
      "base-uri 'self'",
      "object-src 'none'",
      "report-uri /api/csp-report",
      "upgrade-insecure-requests",
    ]
  : null;

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // Cross-Origin-Opener-Policy=same-origin uniemożliwia XS-Leaks i Spectre
  // przez window.opener / window.postMessage z innego origina.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // Process isolation per-origin (mitigation Spectre + Meltdown po stronie
  // przeglądarki). Bezpieczne dla SPA; łamie tylko apki które potrzebują
  // shared memory między origins (my nie używamy).
  { key: "Origin-Agent-Cluster", value: "?1" },
  // Legacy header dla starszych przeglądarek (Flash/Acrobat) — i tak deprecated
  // ale dodanie kosztuje 0 i blokuje crossdomain.xml exploit.
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  // Anty-MIME-sniffing extra dla starszych browserów. nosniff już to robi
  // ale download-options chroni IE/Edge przed automatycznym otwieraniem.
  { key: "X-Download-Options", value: "noopen" },
  {
    key: "Permissions-Policy",
    value: [
      // Sensors / IO
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "accelerometer=()",
      "gyroscope=()",
      "magnetometer=()",
      "ambient-light-sensor=()",
      "battery=()",
      "bluetooth=()",
      "midi=()",
      "usb=()",
      "serial=()",
      "hid=()",
      // Media / display
      "autoplay=()",
      "fullscreen=(self)",
      "picture-in-picture=()",
      "display-capture=()",
      "screen-wake-lock=()",
      // Commerce / privacy
      "payment=()",
      "interest-cohort=()",
      "browsing-topics=()",
      "attribution-reporting=()",
      // WebAuthn — restricted do same-origin (passkey/security key registration)
      "publickey-credentials-get=(self)",
      "publickey-credentials-create=(self)",
      // Cross-origin clipboard — block (Documenso/Moodle używają w iframe ale
      // tam mają własne origin, nie potrzebują naszego permission).
      "clipboard-read=(self)",
      "clipboard-write=(self)",
      // Embedded sync features — blokujemy
      "encrypted-media=()",
      "execution-while-not-rendered=()",
      "execution-while-out-of-viewport=()",
      "web-share=()",
      "xr-spatial-tracking=()",
    ].join(", "),
  },
  { key: "Content-Security-Policy", value: cspDirectives.join("; ") },
  ...(cspReportOnlyDirectives
    ? [
        {
          key: "Content-Security-Policy-Report-Only",
          value: cspReportOnlyDirectives.join("; "),
        },
      ]
    : []),
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
  serverExternalPackages: [
    "mysql2",
    // pdfkit + fontkit ładują natywne assets (afm, fonts) z własnego
    // node_modules — Next bundler tego nie tracker. External żeby Node
    // ładował z node_modules at runtime.
    "pdfkit",
    "fontkit",
  ],
  outputFileTracingIncludes: {
    "/api/integrations/moodle/**": ["./node_modules/mysql2/**/*"],
    "/api/panel/services/**": [
      "./node_modules/pdfkit/**/*",
      "./node_modules/fontkit/**/*",
      "./public/fonts/**/*",
      "./public/logos/**/*",
    ],
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
