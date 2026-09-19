import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // 转换 contracts 包，避免在运行时出错
  transpilePackages: ["@agent-study/contracts"],
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  env: {
    NEXT_PUBLIC_API_BASE_URL:
      process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4001",
  },
};

export default nextConfig;
