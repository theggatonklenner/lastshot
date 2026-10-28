import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  // Browsers only ever use HTTPS for this site (no subdomains, so other services aren't affected).
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  // Camera is only ever requested by this origin, after a tap.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Every page here is per-user and per-request, so the classic dynamic model
  // is simpler than Cache Components.
  cacheComponents: false,
  partialPrefetching: false,
  serverExternalPackages: ["sharp"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
