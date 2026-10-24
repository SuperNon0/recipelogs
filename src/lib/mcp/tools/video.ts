import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { PLATFORM_FOLDER, extractUrl, readRecipeSource } from "@/lib/videoImport";
import type { McpTool, McpToolResult } from "../protocol";
import { READ, js, parseArgs } from "./helpers";

/** Étiquette posée sur les recettes importées, à relire avant de s'y fier. */
export const IMPORT_TAG = "à vérifier";

export const VIDEO_TOOLS: McpTool[] = [
  {
    name: "lire_video",
    title: "Lire une vidéo ou un lien de recette",
    description:
      "Lit un lien TikTok, Instagram, YouTube ou une page de recette et renvoie tout ce qu'il faut pour écrire la recette : " +
      "titre, auteur, description, sous-titres (ce qui est dit), et quelques images de la vidéo (texte affiché à l'écran). " +
      "Pour une page web : la recette structurée publiée par le site, ou le texte de la page. " +
      "Ensuite, crée la recette avec creer_recette : nom, ingrédients en grammes, étapes, source = le lien, " +
      `dossier = celui indiqué dans « dossier », étiquette « ${IMPORT_TAG} ». N'invente pas de quantité : ce qui manque va dans les notes. ` +
      "Peut prendre jusqu'à une minute (une vidéo trop longue à télécharger est abandonnée).",
    inputSchema: {
      type: "object",
      properties: {
        lien: js.str("Lien partagé (le texte de partage complet de TikTok marche aussi : le lien est retrouvé dedans)"),
        images: js.int("Nombre d'images à extraire de la vidéo, 0 à 12 (8 par défaut)"),
      },
      required: ["lien"],
    },
    annotations: READ,
    run: async (args) => {
      const a = parseArgs(z.object({ lien: z.string().trim().min(1).max(2000), images: z.number().int().min(0).max(12).default(8) }), args);
      const url = extractUrl(a.lien);
      if (!url) throw new Error("aucun lien http(s) trouvé dans le texte");
      const src = await readRecipeSource(url, a.images);

      const folderName = PLATFORM_FOLDER[src.plateforme];
      const folder = await prisma.folder.findFirst({ where: { name: { equals: folderName, mode: "insensitive" } } });
      const dossier = folder
        ? { id: folder.id, nom: folder.name }
        : { id: null, nom: folderName, a_creer: "ce dossier n'existe pas encore : crée-le avec enregistrer_dossier_ou_categorie" };

      const { images, ...rest } = src.type === "video" ? src : { ...src, images: [] };
      const result: McpToolResult = {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ...rest,
                images: images.map((i) => `image à ${i.secondes} s`),
                dossier,
                etiquette: IMPORT_TAG,
              },
              null,
              2,
            ),
          },
          ...images.map((i) => ({ type: "image" as const, data: i.data, mimeType: i.mimeType })),
        ],
      };
      return result;
    },
  },
];
