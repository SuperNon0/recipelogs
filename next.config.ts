import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
};

export default nextConfig;
