import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @quillsql/node is CJS-only and breaks webpack ESM bundling.
  // Exclude it from the server bundle so Node.js requires it natively.
  serverExternalPackages: ["@quillsql/node"],
};

export default nextConfig;
