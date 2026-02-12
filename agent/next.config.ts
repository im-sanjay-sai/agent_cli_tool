import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @quillsql/node is CJS-only — transpile it so Next.js server bundling works
  transpilePackages: ["@quillsql/node"],
};

export default nextConfig;
