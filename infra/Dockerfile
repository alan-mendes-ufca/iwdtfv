# Build: docker build -f infra/Dockerfile -t iwdtfv .
# Uso:   docker compose -f infra/compose.yaml up -d --build

ARG NODE_VERSION=24

# 1. Dependências (inclui devDependencies, necessárias para o build)
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# 2. Build do Next em modo standalone
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 3. Imagem final: Node + ffmpeg + yt-dlp (binário oficial, versão e checksum fixos)
FROM node:${NODE_VERSION}-bookworm-slim AS runner
ARG TARGETARCH
ARG YTDLP_VERSION=2026.08.19
ARG YTDLP_SHA256_AMD64=58162f9bfdc27458ea47bfcb311cf47028f17d8154a8bf7d689861d46399230a
ARG YTDLP_SHA256_ARM64=b16e4dab368a816cd05d477d698a605a6ae87ccee1c8ffd38fa21d7254141fcc

RUN set -eux; \
  apt-get update; \
  apt-get install -y --no-install-recommends ffmpeg ca-certificates curl; \
  case "${TARGETARCH:-amd64}" in \
    amd64) asset=yt-dlp_linux; sum="${YTDLP_SHA256_AMD64}" ;; \
    arm64) asset=yt-dlp_linux_aarch64; sum="${YTDLP_SHA256_ARM64}" ;; \
    *) echo "Arquitetura não suportada: ${TARGETARCH}"; exit 1 ;; \
  esac; \
  curl -fsSL -o /usr/local/bin/yt-dlp \
    "https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/${asset}"; \
  echo "${sum}  /usr/local/bin/yt-dlp" | sha256sum -c -; \
  chmod 0755 /usr/local/bin/yt-dlp; \
  apt-get purge -y curl; \
  apt-get autoremove -y; \
  rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TEMP_DIR=/tmp/iwdtfv \
    YTDLP_JS_RUNTIMES=node

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/v1/status').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "server.js"]
