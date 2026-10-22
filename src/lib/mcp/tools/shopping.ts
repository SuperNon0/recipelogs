import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getShoppingListDetail, listShoppingLists } from "@/lib/shopping";
import {
  addManualItem,
  addRecipeToList,
  createShoppingList,
  deleteShoppingList,
  removeChecked,
  removeRecipeFromList,
  uncheckAll,
} from "@/app/actions/shopping";
import { DELETE, READ, WRITE, formData, id, idFromPath, ids, js, parseArgs, runAction, text, type McpTool } from "./helpers";

async function requireList(listId: number) {
  const list = await getShoppingListDetail(listId);
  if (!list) throw new Error(`liste de courses ${listId} introuvable`);
  return list;
}

const listIdJs = { liste_id: js.int("Id de la liste de courses") };

export const SHOPPING_TOOLS: McpTool[] = [
  {
    name: "lister_listes_courses",
    title: "Lister les listes de courses",
    description: "Liste les listes de courses (id, nom, nombre d'articles, recettes incluses).",
    inputSchema: { type: "object", properties: {} },
    annotations: READ,
    run: async () => {
      const lists = await listShoppingLists();
      return text(
        lists.map((l) => ({
          id: l.id,
          nom: l.name,
          articles: l._count.items,
          recettes: l.recipes.map((r) => ({ id: r.recipe.id, nom: r.recipe.name, coefficient: Number(r.coefficient) })),
        })),
      );
    },
  },

  {
    name: "voir_liste_courses",
    title: "Voir une liste de courses",
    description:
      "Donne le contenu d'une liste : articles (quantités cumulées des recettes, articles ajoutés à la main, cochés ou non) et recettes incluses.",
    inputSchema: { type: "object", properties: listIdJs, required: ["liste_id"] },
    annotations: READ,
    run: async (args) => {
      const a = parseArgs(z.object({ liste_id: id }), args);
      const l = await requireList(a.liste_id);
      return text({
        id: l.id,
        nom: l.name,
        recettes: l.recipes.map((r) => ({ id: r.recipe.id, nom: r.recipe.name, coefficient: Number(r.coefficient) })),
        articles: l.items.map((i) => ({
          id: i.id,
          nom: i.name,
          quantite: i.quantityG == null ? null : Number(i.quantityG),
          unite: i.unit,
          coche: i.checked,
          ajoute_a_la_main: i.recipeId === null,
        })),
      });
    },
  },

  {
    name: "creer_liste_courses",
    title: "Créer une liste de courses",
    description: "Crée une liste de courses vide.",
    inputSchema: { type: "object", properties: { nom: js.str("Nom de la liste") }, required: ["nom"] },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(z.object({ nom: z.string().trim().min(1).max(200) }), args);
      const { redirectTo } = await runAction(() => createShoppingList(formData({ name: a.nom })));
      return text({ creee: a.nom, id: idFromPath(redirectTo) });
    },
  },

  {
    name: "ajouter_recette_a_liste",
    title: "Ajouter une recette à une liste",
    description:
      "Ajoute les ingrédients d'une recette (sous-recettes comprises) à une liste de courses, avec un coefficient (ex. 2 pour doubler). Si la recette y est déjà, son coefficient est remplacé.",
    inputSchema: {
      type: "object",
      properties: { ...listIdJs, recette_id: js.int("Id de la recette"), coefficient: js.num("Coefficient (1 par défaut)") },
      required: ["liste_id", "recette_id"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(z.object({ liste_id: id, recette_id: id, coefficient: z.number().positive().max(1000).default(1) }), args);
      await requireList(a.liste_id);
      await runAction(() => addRecipeToList(a.liste_id, a.recette_id, a.coefficient));
      return text({ ajoutee: a.recette_id, liste_id: a.liste_id, coefficient: a.coefficient });
    },
  },

  {
    name: "retirer_recette_de_liste",
    title: "Retirer une recette d'une liste",
    description: "Retire une recette d'une liste de courses (ses ingrédients sont recalculés).",
    inputSchema: { type: "object", properties: { ...listIdJs, recette_id: js.int("Id de la recette") }, required: ["liste_id", "recette_id"] },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(z.object({ liste_id: id, recette_id: id }), args);
      await runAction(() => removeRecipeFromList(a.liste_id, a.recette_id));
      return text({ retiree: a.recette_id });
    },
  },

  {
    name: "ajouter_article_liste",
    title: "Ajouter un article à la main",
    description: "Ajoute un article libre à une liste de courses (ex. « Papier cuisson »), avec une quantité en grammes facultative.",
    inputSchema: {
      type: "object",
      properties: { ...listIdJs, nom: js.str("Article"), quantite_g: js.num("Quantité en grammes (facultatif)") },
      required: ["liste_id", "nom"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(
        z.object({ liste_id: id, nom: z.string().trim().min(1).max(200), quantite_g: z.number().positive().optional() }),
        args,
      );
      await requireList(a.liste_id);
      await runAction(() => addManualItem(a.liste_id, a.nom, a.quantite_g ?? null));
      return text({ ajoute: a.nom });
    },
  },

  {
    name: "cocher_articles",
    title: "Cocher ou décocher des articles",
    description: "Coche ou décoche des articles d'une liste (ids dans voir_liste_courses).",
    inputSchema: {
      type: "object",
      properties: { ...listIdJs, article_ids: js.ints("Ids des articles"), coche: js.bool("true = coché, false = décoché") },
      required: ["liste_id", "article_ids", "coche"],
    },
    annotations: { ...WRITE, idempotentHint: true },
    run: async (args) => {
      const a = parseArgs(z.object({ liste_id: id, article_ids: ids, coche: z.boolean() }), args);
      const { count } = await prisma.shoppingListItem.updateMany({
        where: { shoppingListId: a.liste_id, id: { in: a.article_ids } },
        data: { checked: a.coche },
      });
      revalidatePath(`/shopping/${a.liste_id}`);
      return text({ modifies: count, coche: a.coche });
    },
  },

  {
    name: "ranger_liste_courses",
    title: "Tout décocher ou retirer les cochés",
    description: "Sur une liste de courses : tout décocher, ou retirer les articles cochés.",
    inputSchema: {
      type: "object",
      properties: { ...listIdJs, action: js.enum(["tout_decocher", "retirer_coches"], "Action") },
      required: ["liste_id", "action"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(z.object({ liste_id: id, action: z.enum(["tout_decocher", "retirer_coches"]) }), args);
      await requireList(a.liste_id);
      await runAction(() => (a.action === "tout_decocher" ? uncheckAll(a.liste_id) : removeChecked(a.liste_id)));
      return text({ fait: a.action });
    },
  },

  {
    name: "supprimer_liste_courses",
    title: "Supprimer une liste de courses",
    description: "Supprime une liste de courses (les recettes ne sont pas touchées).",
    inputSchema: { type: "object", properties: listIdJs, required: ["liste_id"] },
    annotations: DELETE,
    run: async (args) => {
      const a = parseArgs(z.object({ liste_id: id }), args);
      const l = await requireList(a.liste_id);
      await runAction(() => deleteShoppingList(a.liste_id));
      return text({ supprimee: l.name });
    },
  },
];
