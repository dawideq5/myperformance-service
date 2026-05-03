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
const chatwootOrigin = originOf(
  process.env.NEXT_PUBLIC_CHATWOOT_BASE_URL,
  "https://chat.myperformance.pl",
);
const livekitOrigin = originOf(
  process.env.NEXT_PUBLIC_LIVEKIT_URL?.replace(/^wss:/, "https:"),
  "https://livekit.myperformance.pl",
);
const livekitWssOrigin = livekitOrigin
  ? `wss://${new URL(livekitOrigin).host}`
  : "";

const externalOrigins = [keycloakOrigin, documensoOrigin, wazuhOrigin, chatwootOrigin, livekitOrigin].filter(Boolean);
const externalSrc = externalOrigins.length ? ` ${externalOrigins.join(" ")}` : "";

// Chatwoot SDK ładuje skrypt z chat.myperformance.pl/packs/js/sdk.js +
// inject style + websocket. Bez chatwootOrigin w script-src/style-src
// browser blokuje SDK — widget się nie pojawia.
const chatwootScriptSrc = chatwootOrigin ? ` ${chatwootOrigin}` : "";

const scriptSrc = isDev
  ? `'self' 'unsafe-inline' 'unsafe-eval'${chatwootScriptSrc}`
  : `'self' 'unsafe-inline'${chatwootScriptSrc}`; // TODO: nonces

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
  `style-src 'self' 'unsafe-inline'${chatwootScriptSrc}`,
  `img-src 'self' data: blob: ${osmTilesSrc} ${leafletAssetsSrc}${photosSrc}${chatwootOrigin ? ` ${chatwootOrigin}` : ""}`,
  "font-src 'self' data:",
  `connect-src 'self'${externalSrc} ${osmTilesSrc} ${nominatimSrc}${photosSrc}${chatwootOrigin ? ` wss://${new URL(chatwootOrigin).host}` : ""}${livekitWssOrigin ? ` ${livekitWssOrigin}` : ""}`,
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
  // Pin tracing root do tego workspace — bez tego Next.js wykrywa
  // wiele lockfiles w drzewie (panele/ + root) i emituje warning na
  // każdym restarcie dev servera.
  outputFileTracingRoot: __dirname,
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
    // OpenTelemetry + gRPC używają Node.js stream/fs/net/tls —
    // bundler Next.js nie obsługuje tych natywnych modułów.
    "@grpc/grpc-js",
    "@grpc/proto-loader",
    "@opentelemetry/sdk-node",
    "@opentelemetry/sdk-trace-node",
    "@opentelemetry/sdk-logs",
    "@opentelemetry/sdk-metrics",
    "@opentelemetry/exporter-trace-otlp-http",
    "@opentelemetry/exporter-logs-otlp-grpc",
    "@opentelemetry/exporter-trace-otlp-grpc",
    "@opentelemetry/exporter-metrics-otlp-grpc",
    "@opentelemetry/otlp-grpc-exporter-base",
    "@opentelemetry/otlp-exporter-base",
    "@opentelemetry/auto-instrumentations-node",
    "@opentelemetry/instrumentation",
    "@opentelemetry/instrumentation-http",
    "@opentelemetry/instrumentation-pg",
    "@opentelemetry/instrumentation-mysql2",
    "@opentelemetry/resources",
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
  webpack(config, { isServer }) {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@": path.resolve(__dirname),
    };
    // Node.js built-ins nie istnieją w bundle przeglądarki. Moduły
    // isomorficzne (np. lib/permissions/areas.ts) używają require("fs") tylko
    // jako last-resort fallback — webpack musi je zignorować po stronie klienta.
    if (!isServer) {
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        fs: false,
        path: false,
        crypto: false,
        stream: false,
        net: false,
        tls: false,
        os: false,
        child_process: false,
      };
    }
    // OpenTelemetry i gRPC używają Node.js built-ins (fs, stream, net, tls).
    // Webpack nie potrafi ich bundlować dla przeglądarki ani dla Edge runtime.
    // Instrumentation.ts jest server-only ale webpack i tak próbuje statycznie
    // rozwiązać import-tree. Dodajemy funkcję external która matchuje cały
    // namespace @opentelemetry/* i @grpc/* bez potrzeby listy każdego pakietu.
    if (isServer) {
      const prev = Array.isArray(config.externals)
        ? config.externals
        : config.externals
          ? [config.externals]
          : [];
      config.externals = [
        ...prev,
        ({ request }, callback) => {
          // Pakiety używające Node.js built-ins (stream, fs, net, tls, crypto)
          // które webpack nie potrafi zbundlować dla instrumentation runtime.
          // Node.js built-in modules — available at runtime, nie mogą być bundlowane
          const NODE_BUILTINS = [
            "crypto", "stream", "fs", "net", "tls", "path", "os", "http",
            "https", "zlib", "events", "util", "buffer", "querystring",
            "url", "dns", "child_process", "process", "assert",
            "string_decoder", "timers", "tty", "readline", "worker_threads",
            "perf_hooks", "v8", "vm", "module", "punycode",
          ];
          if (request && NODE_BUILTINS.includes(request)) {
            return callback(null, `commonjs ${request}`);
          }
          const NODE_NATIVE_PACKAGES = [
            "@opentelemetry/",
            "@grpc/",
            "nodemailer",
            "protobufjs",
            "yaml",
            "pg-native",
            "cpu-features",
            "ssh2",
            "pg",
            "pg-connection-string",
            "pg-pool",
          ];
          // Obsługa node: URI scheme (Node.js 14+) — webpack nie rozumie tego prefixu
          if (request?.startsWith("node:")) {
            return callback(null, `commonjs ${request.slice(5)}`);
          }
          if (
            request &&
            NODE_NATIVE_PACKAGES.some((p) =>
              p.endsWith("/") ? request.startsWith(p) : request === p
            )
          ) {
            return callback(null, `commonjs ${request}`);
          }
          callback();
        },
      ];
    }
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
      // Override CORP dla zdjęć serwisowych — ładowane z subdomen panelowych
      // (panelserwisanta/sprzedawcy/kierowcy.myperformance.pl). Auth przez
      // session cookie z Domain=.myperformance.pl. Zostaw same-origin dla
      // pozostałych endpointów żeby chronić przed XS-Leaks.
      {
        source: "/api/public/service-photos/:path*",
        headers: [
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        ],
      },
      {
        source: "/api/public/photos/:path*",
        headers: [
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
