import { execSync } from "node:child_process";
import type { NextConfig } from "next";
import { parseGitLog } from "./src/lib/pr-log";

// Liste des PR fusionnées, lue dans git au moment du build et affichée dans
// Réglages → « Version et nouveautés ». Sans git (archive, Docker) : liste vide.
function mergedPrs(): string {
  try {
    const raw = execSync("git log --first-parent -200 --format=%cs%x1f%s%x1f%b%x1e", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.stringify(parseGitLog(raw));
  } catch {
    return "[]";
  }
}

const nextConfig: NextConfig = {
  // deploy.sh construit dans un dossier à part (NEXT_DIST_DIR=.next-build)
  // puis l'échange avec .next : un build raté ne casse plus le site en ligne.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  output: "standalone",
  env: {
    NEXT_PUBLIC_MERGED_PRS: mergedPrs(),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  images: {
    remotePatterns: [],
  },
  // On vérifie déjà types + lint avant chaque commit (pnpm typecheck / pnpm test).
  // On désactive ici pour que le build prod (LXC 2 Go) ne soit pas plombé par
  // ces étapes — il restait bloqué pendant ~10 min à « Linting and checking
  // validity of types ».
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Le moteur d'aperçu PDF (pdf.js) charge un « worker » publié par défaut en
  // .mjs. nginx ne connaît pas cette extension et l'envoie comme un fichier
  // binaire : le navigateur refuse alors de l'exécuter et l'aperçu échoue.
  // On le publie donc en .js, extension que tous les serveurs servent bien.
  webpack: (config) => {
    config.module.rules.push({
      test: /pdf\.worker\.min\.mjs$/,
      type: "asset/resource",
      generator: { filename: "static/media/[name].[hash].js" },
    });
    return config;
  },
};

export default nextConfig;
