import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // .pmtiles archives are served from /public with range requests; no special
  // handling needed, but keep large-page data limits sane for component lists.
  experimental: {},
};

export default nextConfig;
