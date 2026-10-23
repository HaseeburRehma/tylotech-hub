/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Only our own Supabase storage may be optimised through /_next/image —
  // a "**" wildcard would turn the image endpoint into an open proxy.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/**" }],
  },
  // @react-pdf/renderer ships its own bundled deps; keep it external on the server.
  experimental: {
    serverComponentsExternalPackages: ["@react-pdf/renderer"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Microphone for voice messages on our own pages only; camera/location off.
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=()" },
          // Keeps other sites' windows out of ours; OAuth uses full redirects, not popups.
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          // Baseline CSP: no plugins, no <base> hijack, forms only post back to us,
          // only we may frame the app. (A script-src policy needs per-request nonces
          // for Next's inline scripts — not enabled yet.)
          { key: "Content-Security-Policy", value: "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'" },
        ],
      },
      {
        // Static brand images in /public rarely change — let browsers and the CDN keep them.
        source: "/images/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
    ];
  },
};

export default nextConfig;
