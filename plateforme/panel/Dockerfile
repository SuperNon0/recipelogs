# Image du panel admin ET de son moteur (même image, deux conteneurs) :
# - panel  : node panel.mjs  (sur le web, sans accès à Docker) ;
# - moteur : node moteur.mjs (réseau Docker seulement, avec le socket Docker).
# Construite depuis la racine du dépôt (pour les polices de l'appli) :
# docker-compose.yml → build: { context: .., dockerfile: plateforme/panel/Dockerfile }
FROM node:22-alpine
# Pour le moteur : recipelog-instance est un script bash qui utilise docker,
# tar, find et la commande date de GNU ; tzdata pour l'heure de Paris.
RUN apk add --no-cache bash docker-cli coreutils findutils tar sed grep tzdata
WORKDIR /app
COPY plateforme/panel/*.mjs plateforme/panel/*.html plateforme/panel/*.css plateforme/panel/*.js ./
COPY public/polices/*.woff2 ./polices/
ENV NODE_ENV=production
CMD ["node", "panel.mjs"]
