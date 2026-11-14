#!/bin/sh
# Démarrage d'une instance RecipeLog dans Docker (voir Dockerfile).
set -eu
: "${DATABASE_URL:?DATABASE_URL manquante}"
echo "RecipeLog : application des migrations de la base…"
prisma migrate deploy --schema /app/prisma/schema.prisma
echo "RecipeLog : démarrage du site sur le port ${PORT:-3000}."
exec node /app/server.js
