// TS: `import type` traz só o tipo `NextConfig`; some no JavaScript gerado.
import type { NextConfig } from "next";

// TS: `: NextConfig` anota a variável com o tipo do Next. O editor avisa se uma chave não existir ou tiver valor errado.
const nextConfig: NextConfig = {
  // Gera .next/standalone, usado pela imagem Docker (infra/Dockerfile).
  output: "standalone",
  poweredByHeader: false,
};

export default nextConfig;
