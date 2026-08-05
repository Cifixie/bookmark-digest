import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phase-0: no special config yet. Revisit when @json-render/next
  // needs build-time integration (e.g. transpilePackages for workspace deps).
  transpilePackages: [
    "@bookmark-digest/schemas",
    "@bookmark-digest/catalog",
    "@bookmark-digest/shared",
  ],
};

export default nextConfig;
