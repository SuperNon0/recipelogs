import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCookbookDetail, listCookbooks } from "@/lib/cookbooks";
import {
  addChapter,
  addMultipleRecipesToCookbook,
  createCookbook,
  deleteCookbook,
  removeFromCookbook,
} from "@/app/actions/cookbooks";
import { DELETE, READ, WRITE, formData, id, idFromPath, ids, js, parseArgs, runAction, text, type McpTool } from "./helpers";

async function requireCookbook(cookbookId: number) {
  const c = await getCookbookDetail(cookbookId);
  if (!c) throw new Error(`cahier ${cookbookId} introuvable`);
  return c;
}

const cookbookIdJs = { cahier_id: js.int("Id du cahier") };

export const COOKBOOK_TOOLS: McpTool[] = [
  {
    name: "lister_cahiers",
    title: "Lister les cahiers",
    description: "Liste les cahiers (livres de recettes en PDF) : id, nom, format, nombre de recettes.",
    inputSchema: { type: "object", properties: {} },
    annotations: READ,
    run: async () => {
      const list = await listCookbooks();
      return text(
        list.map((c) => ({ id: c.id, nom: c.name, description: c.description, format: c.format, recettes: c._count.entries })),
      );
    },
  },

  {
    name: "voir_cahier",
    title: "Voir un cahier",
    description:
      "Donne le contenu d'un cahier dans l'ordre : chapitres et recettes (entree_id sert à retirer une recette). Mode « lie » = suit la recette, « fige » = copie figée à une date.",
    inputSchema: { type: "object", properties: cookbookIdJs, required: ["cahier_id"] },
    annotations: READ,
    run: async (args) => {
      const a = parseArgs(z.object({ cahier_id: id }), args);
      const c = await requireCookbook(a.cahier_id);
      const contenu = [
        ...c.chapters.map((ch) => ({ position: ch.position, type: "chapitre", id: ch.id, titre: ch.title, intro: ch.intro })),
        ...c.entries.map((e) => ({
          position: e.position,
          type: "recette",
          entree_id: e.id,
          recette: { id: e.recipe.id, nom: e.recipe.name },
          mode: e.linkMode === "snapshot" ? "fige" : "lie",
        })),
      ].sort((x, y) => x.position - y.position);
      return text({ id: c.id, nom: c.name, description: c.description, format: c.format, contenu });
    },
  },

  {
    name: "creer_cahier",
    title: "Créer un cahier",
    description: "Crée un cahier vide (livre de recettes en PDF).",
    inputSchema: {
      type: "object",
      properties: { nom: js.str("Nom"), description: js.str("Description (facultatif)"), format: js.enum(["A4", "A5"], "Format (A4 par défaut)") },
      required: ["nom"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(
        z.object({ nom: z.string().trim().min(1).max(200), description: z.string().max(2000).optional(), format: z.enum(["A4", "A5"]).default("A4") }),
        args,
      );
      const { redirectTo } = await runAction(() =>
        createCookbook(formData({ name: a.nom, description: a.description, format: a.format })),
      );
      return text({ cree: a.nom, id: idFromPath(redirectTo) });
    },
  },

  {
    name: "ajouter_recettes_cahier",
    title: "Ajouter des recettes à un cahier",
    description:
      "Ajoute des recettes à la fin d'un cahier (celles déjà présentes sont ignorées). Mode « lie » (par défaut) : le cahier suit les changements de la recette ; « fige » : copie figée aujourd'hui.",
    inputSchema: {
      type: "object",
      properties: { ...cookbookIdJs, recette_ids: js.ints("Ids des recettes"), mode: js.enum(["lie", "fige"], "lie par défaut") },
      required: ["cahier_id", "recette_ids"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(z.object({ cahier_id: id, recette_ids: ids, mode: z.enum(["lie", "fige"]).default("lie") }), args);
      const { result } = await runAction(() =>
        addMultipleRecipesToCookbook(a.cahier_id, a.recette_ids, a.mode === "fige" ? "snapshot" : "linked"),
      );
      return text({ ajoutees: result?.added ?? 0, deja_presentes: result?.skipped ?? 0 });
    },
  },

  {
    name: "ajouter_chapitre_cahier",
    title: "Ajouter un chapitre",
    description: "Ajoute un chapitre (titre et introduction facultative) à la fin d'un cahier.",
    inputSchema: {
      type: "object",
      properties: { ...cookbookIdJs, titre: js.str("Titre du chapitre"), intro: js.str("Texte d'introduction (facultatif)") },
      required: ["cahier_id", "titre"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(z.object({ cahier_id: id, titre: z.string().trim().min(1).max(200), intro: z.string().max(5000).optional() }), args);
      await requireCookbook(a.cahier_id);
      await runAction(() => addChapter(a.cahier_id, { title: a.titre, intro: a.intro }));
      return text({ ajoute: a.titre });
    },
  },

  {
    name: "retirer_recette_cahier",
    title: "Retirer une recette d'un cahier",
    description: "Retire une recette d'un cahier (la recette elle-même n'est pas supprimée). entree_id vient de voir_cahier.",
    inputSchema: { type: "object", properties: { ...cookbookIdJs, entree_id: js.int("entree_id de la recette dans le cahier") }, required: ["cahier_id", "entree_id"] },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(z.object({ cahier_id: id, entree_id: id }), args);
      const entry = await prisma.cookbookRecipe.findFirst({
        where: { id: a.entree_id, cookbookId: a.cahier_id },
        select: { recipe: { select: { name: true } } },
      });
      if (!entry) throw new Error("cette entrée n'est pas dans ce cahier");
      await runAction(() => removeFromCookbook(a.entree_id, a.cahier_id));
      return text({ retiree: entry.recipe.name });
    },
  },

  {
    name: "supprimer_cahier",
    title: "Supprimer un cahier",
    description: "Supprime un cahier (les recettes ne sont pas touchées).",
    inputSchema: { type: "object", properties: cookbookIdJs, required: ["cahier_id"] },
    annotations: DELETE,
    run: async (args) => {
      const a = parseArgs(z.object({ cahier_id: id }), args);
      const c = await requireCookbook(a.cahier_id);
      await runAction(() => deleteCookbook(a.cahier_id));
      return text({ supprime: c.name });
    },
  },
];
