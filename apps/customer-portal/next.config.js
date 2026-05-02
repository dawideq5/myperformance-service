/** @type {import("next").NextConfig} */
const isDev = process.env.NODE_ENV === "development";

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

const dashboardOrigin =
  originOf(process.env.DASHBOARD_URL) || "https://myperformance.pl";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    value: [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
    ].join(", "),
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Dashboard BFF dla OTP + services API.
      `connect-src 'self' ${dashboardOrigin}`,
      `script-src 'self' ${isDev ? "'unsafe-inline' 'unsafe-eval'" : "'unsafe-inline'"}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: ${dashboardOrigin}`,
      "font-src 'self' data:",
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
