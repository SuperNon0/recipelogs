import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { BOOT_TIME } from "@/lib/bootTime";
import { CHANGELOG } from "@/lib/changelog";
import { getMergedPrs } from "@/lib/pr-log";
import { htmlToPlainText } from "@/lib/stepsText";
import { fullVersion } from "@/lib/version";
import { importRecipesFromJson } from "@/app/actions/import";
import { READ, WRITE, id, js, parseArgs, runAction, text, type McpTool } from "./helpers";

const jsonIngredient = z.object({ name: z.string().trim().min(1), quantity: z.number().nonnegative().default(0), quantity_max: z.number().nonnegative().nullable().optional(), unit: z.string().default("g") });
const jsonRecipe = z.object({
  name: z.string().trim().min(1).max(200),
  yield: z.string().optional(),
  ingredients: z.array(jsonIngredient).default([]),
  steps: z.string().optional(),
  notes: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  // Champs de l'export RecipeLog : ré-importés tels quels.
  yield_count: z.number().nullable().optional(),
  yield_label: z.string().nullable().optional(),
  sale_coef: z.number().nullable().optional(),
  sale_price: z.number().nullable().optional(),
  sale_vat: z.number().nullable().optional(),
  mold: z.unknown().optional(),
  folder: z.string().nullable().optional(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  favorite: z.boolean().optional(),
  rating: z.number().nullable().optional(),
});

export const SITE_TOOLS: McpTool[] = [
  {
    name: "infos_recipelog",
    title: "Infos RecipeLog",
    description:
      "Donne un aperçu de RecipeLog : nombre de recettes, d'ingrédients, de dossiers, de catégories, de cahiers et de listes de courses.",
    inputSchema: { type: "object", properties: {} },
    annotations: READ,
    run: async () => {
      const [recettes, ingredients, dossiers, categories, cahiers, listes] = await Promise.all([
        prisma.recipe.count(),
        prisma.ingredientBase.count(),
        prisma.folder.count(),
        prisma.category.count(),
        prisma.cookbook.count(),
        prisma.shoppingList.count(),
      ]);
      return text({ recettes, ingredients, dossiers, categories, cahiers, listes_de_courses: listes });
    },
  },

  {
    name: "importer_recettes_json",
    title: "Importer des recettes",
    description:
      "Ajoute des recettes en lot, comme Réglages → Import JSON. Une recette dont le nom existe déjà est ignorée. Unités acceptées : g, kg, ml, cl, dl, l, cc, cs, pièce, qs (converties automatiquement). Accepte tel quel le JSON de exporter_recettes_json (rendement, moule, dossier et catégories existants, étiquettes, favori, note).",
    inputSchema: {
      type: "object",
      properties: {
        recettes: {
          type: "array",
          description: "Recettes à importer",
          items: {
            type: "object",
            properties: {
              name: js.str("Nom"),
              ingredients: {
                type: "array",
                items: {
                  type: "object",
                  properties: { name: js.str("Ingrédient"), quantity: js.num("Quantité"), unit: js.str("Unité") },
                  required: ["name"],
                },
              },
              steps: js.str("Étapes en texte simple, une par ligne, sans numéro"),
              notes: js.str("Notes"),
              source: js.str("Source"),
              yield: js.str("Rendement (ex. « 8 parts »), ajouté aux notes"),
            },
            required: ["name"],
          },
        },
      },
      required: ["recettes"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(z.object({ recettes: z.array(jsonRecipe).min(1).max(200) }), args);
      const fd = new FormData();
      const recettes = a.recettes.map((r) => ({ ...r, steps: r.steps ? htmlToPlainText(r.steps) : r.steps }));
      fd.append("file", new File([JSON.stringify(recettes)], "mcp.json", { type: "application/json" }));
      const { result } = await runAction(() => importRecipesFromJson(fd));
      return text({ importees: result?.imported ?? 0, ignorees_deja_presentes: result?.skipped ?? 0, erreurs: result?.errors ?? [] });
    },
  },

  {
    name: "exporter_recettes_json",
    title: "Exporter des recettes",
    description:
      "Renvoie des recettes en JSON (même format que l'import : ingrédients, étapes, rendement, moule, dossier, catégories, étiquettes, favori, note) : pour une sauvegarde, une copie ou une conversion. Sans ids : toutes les recettes.",
    inputSchema: { type: "object", properties: { ids: js.ints("Ids des recettes (toutes si absent)") } },
    annotations: READ,
    run: async (args) => {
      const a = parseArgs(z.object({ ids: z.array(id).max(2000).optional() }), args);
      const recipes = await prisma.recipe.findMany({
        where: a.ids ? { id: { in: a.ids } } : {},
        orderBy: { name: "asc" },
        include: {
          ingredients: { orderBy: { position: "asc" } },
          stepsBlock: true,
          tags: true,
          folder: { select: { name: true } },
          categories: { include: { category: { select: { name: true } } } },
        },
      });
      return text(
        recipes.map((r) => ({
          id: r.id,
          name: r.name,
          ingredients: r.ingredients.map((i) => ({
            name: i.name,
            quantity: Number(i.quantityG),
            ...(i.quantityGMax != null ? { quantity_max: Number(i.quantityGMax) } : {}),
            unit: i.unit,
          })),
          steps: r.stepsBlock?.content ?? "",
          notes: r.notesTips,
          source: r.source,
          folder: r.folder?.name ?? null,
          categories: r.categories.map((c) => c.category.name),
          tags: r.tags.map((t) => t.name),
          favorite: r.favorite,
          rating: r.rating,
          yield_count: r.yieldCount,
          yield_label: r.yieldLabel,
          sale_coef: r.saleCoef != null ? Number(r.saleCoef) : null,
          sale_price: r.salePrice != null ? Number(r.salePrice) : null,
          sale_vat: r.saleVat != null ? Number(r.saleVat) : null,
          mold: r.mold ?? null,
        })),
      );
    },
  },

  {
    name: "etat_du_site",
    title: "État du site",
    description:
      "Donne la version de RecipeLog, l'heure de démarrage du serveur et les dernières mises à jour installées. Les mises à jour du site se font uniquement depuis le panel d'administration de la plateforme.",
    inputSchema: { type: "object", properties: {} },
    annotations: READ,
    run: async () => {
      const current = CHANGELOG[0];
      return text({
        version: current ? { numero: fullVersion(current.version), date: current.date, titre: current.title } : null,
        demarre_le: new Date(BOOT_TIME).toISOString(),
        dernieres_mises_a_jour: getMergedPrs().slice(0, 10).map((p) => ({ pr: p.number, date: p.date, titre: p.title })),
      });
    },
  },
];
