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
    value: ["camera=(self)", "microphone=()", "geolocation=()", "payment=()", "usb=()"].join(", "),
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `connect-src 'self'${dash}`,
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob:${dash}`,
      "font-src 'self' data:",
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
