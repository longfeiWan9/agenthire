import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

/**
 * D5.6 offline marketplace UI.
 * Local data only — no remote image/font optimization hosts.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: projectRoot,
  images: {
    unoptimized: true,
    remotePatterns: [],
  },
  // Domain modules use NodeNext `.ts` import extensions.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".ts": [".ts", ".tsx", ".js"],
      ".tsx": [".tsx", ".ts", ".js"],
      ".js": [".js", ".ts", ".tsx"],
    };
    return config;
  },
};

export default nextConfig;
