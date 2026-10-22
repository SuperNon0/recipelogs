import { prisma } from "@/lib/prisma";
import type { McpTool } from "./protocol";

/**
 * Outils proposés à Claude. Pour l'instant un seul, en lecture seule, qui
 * sert à vérifier que l'accès marche ; les autres seront ajoutés au choix.
 */
export const MCP_TOOLS: McpTool[] = [
  {
    name: "infos_recipelog",
    title: "Infos RecipeLog",
    description:
      "Donne un aperçu de RecipeLog : nombre de recettes, d'ingrédients, de dossiers, de catégories, de cahiers et de listes de courses.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    run: async () => {
      const [recettes, ingredients, dossiers, categories, cahiers, listes] = await Promise.all([
        prisma.recipe.count(),
        prisma.ingredientBase.count(),
        prisma.folder.count(),
        prisma.category.count(),
        prisma.cookbook.count(),
        prisma.shoppingList.count(),
      ]);
      const stats = { recettes, ingredients, dossiers, categories, cahiers, listes_de_courses: listes };
      return { content: [{ type: "text", text: JSON.stringify(stats, null, 2) }] };
    },
  },
];
