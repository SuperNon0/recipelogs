import type { MetadataRoute } from "next";

/** Manifeste PWA : permet d'installer RecipeLog comme une application. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RecipeLog",
    short_name: "RecipeLog",
    description: "Gestion de recettes de pâtisserie",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0b0f17",
    theme_color: "#0b0f17",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
