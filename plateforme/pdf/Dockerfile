# Service PDF partagé de la plateforme (voir serveur.mjs).
FROM node:22-bookworm-slim
# Chromium de Debian et les polices de secours (les polices des PDF sont intégrées par l'appli).
RUN apt-get update -qq \
  && apt-get install -y -qq --no-install-recommends chromium fonts-dejavu-core fonts-liberation tini \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY serveur.mjs ./
ENV NODE_ENV=production CHROMIUM=/usr/bin/chromium HOME=/tmp
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/sante').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "serveur.mjs"]
