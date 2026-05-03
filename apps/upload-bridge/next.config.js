/** @type {import("next").NextConfig} */
const isDev = process.env.NODE_ENV === "development";

const dashboardOrigin = (() => {
  const url = process.env.DASHBOARD_URL?.trim() || "https://myperformance.pl";
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
})();
const dash = dashboardOrigin ? ` ${dashboardOrigin}` : "";

/**
 * LiveKit signaling endpoint (wss://). Klient WebRTC publishera (F16c)
 * łączy się przez WebSocket — `connect-src` musi zawierać ten origin,
 * inaczej `room.connect()` zostanie zablokowany przez CSP w prod.
 * Mirroruje wzorzec `DASHBOARD_URL` powyżej. `NEXT_PUBLIC_LIVEKIT_URL`
 * jest też czytany przez kod kliencki — przy buildzie inlinowany.
 */
const livekitOrigin = (() => {
  const url = process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim();
  if (!url) return null;
  try {
    // wss://livekit.myperformance.pl → https://livekit.myperformance.pl
    // CSP nie zna `wss:` jako oddzielnego scheme tu — `https` origin pokrywa
    // wss na tym samym hoście (https-mode origin matching).
    const u = new URL(url);
    const httpProto = u.protocol === "wss:" ? "https:" : u.protocol === "ws:" ? "http:" : u.protocol;
    return `${httpProto}//${u.host}`;
  } catch {
    return null;
  }
})();
const lk = livekitOrigin ? ` ${livekitOrigin}` : "";

const scriptSrc = isDev
  ? "'self' 'unsafe-inline' 'unsafe-eval'"
  : "'self' 'unsafe-inline'";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    // Mikrofon dopuszczony dla `self` (live device view, F16c). Bez tego
    // `getUserMedia({audio: true})` failuje nawet po zgodzie usera.
    value: ["camera=(self)", "microphone=(self)", "geolocation=()", "payment=()", "usb=()"].join(", "),
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `connect-src 'self'${dash}${lk}`,
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob:${dash}`,
      "font-src 'self' data:",
      "media-src 'self' blob:",
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
  reactStrictMode: false,
  poweredByHeader: false,
  outputFileTracingRoot: __dirname,
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
module.exports = nextConfig;
