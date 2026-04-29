import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  env: {
    NEXT_PUBLIC_IS_DEMO: process.env.NEXT_PUBLIC_IS_DEMO === "true" ? "true" : "",
    NEXT_PUBLIC_DEMO_TIMEOUT_MINUTES: process.env.NEXT_PUBLIC_DEMO_TIMEOUT_MINUTES || "120",
  },
};

export default nextConfig;




