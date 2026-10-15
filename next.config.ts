import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gera .next/standalone, usado pela imagem Docker (infra/Dockerfile).
  output: "standalone",
  poweredByHeader: false,
};

export default nextConfig;
