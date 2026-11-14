# ============================================================
# Image Docker de RecipeLog : une instance (un client) de la plateforme.
#
# Construite et publiée par .github/workflows/docker-image.yml :
#   ghcr.io/supernon0/recipelog:beta    (branche main)
#   ghcr.io/supernon0/recipelog:stable  (branche stable)
#
# Au démarrage, le conteneur applique les migrations de la base
# (prisma migrate deploy), puis lance le site sur le port 3000.
# Variables : DATABASE_URL (obligatoire), et les mêmes réglages que le .env
# d'une installation LXC (RECIPELOG_ADMIN_EMAILS, RECIPELOG_DEMO…).
# Les fichiers envoyés (photos, factures) vont dans /data/uploads : un volume.
# ============================================================

ARG NODE_IMAGE=node:22-bookworm-slim
ARG PRISMA_VERSION=6.19.3

# ---------------------------------------------------------------- build
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    PUPPETEER_SKIP_DOWNLOAD=true
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm exec prisma generate && pnpm build \
  && cp -r .next/static .next/standalone/.next/static \
  && cp -r public .next/standalone/public

# ---------------------------------------------------------------- image finale
FROM ${NODE_IMAGE}
ARG PRISMA_VERSION
WORKDIR /app
# Chromium : PDF. ffmpeg + yt-dlp : import des vidéos TikTok / Instagram.
RUN apt-get update -qq \
  && apt-get install -y -qq --no-install-recommends \
       openssl ca-certificates curl tini chromium ffmpeg fonts-dejavu-core fonts-liberation \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL -o /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
  && chmod 755 /usr/local/bin/yt-dlp \
  && npm install -g --no-fund --no-audit prisma@${PRISMA_VERSION} \
  && npm cache clean --force \
  && mkdir -p /data/uploads && chown -R node:node /data

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    UPLOAD_DIR=/data/uploads \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    YT_DLP_BIN=/usr/local/bin/yt-dlp \
    FFMPEG_BIN=/usr/bin/ffmpeg

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --chown=node:node deploy/docker/start.sh /usr/local/bin/recipelog-start

USER node
VOLUME ["/data/uploads"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["recipelog-start"]
