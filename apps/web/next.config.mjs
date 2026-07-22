import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";

for (const candidate of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")]) {
  if (existsSync(candidate)) {
    loadDotenv({ path: candidate, override: false });
    break;
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@alphasignal/shared"],
  webpack(config, { dev }) {
    if (dev) {
      config.resolve.extensionAlias = {
        ...config.resolve.extensionAlias,
        ".js": [".ts", ".tsx", ".js"],
      };
    }

    return config;
  },
};

export default nextConfig;
