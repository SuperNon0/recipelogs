import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  assignRecipesToFolder,
  createCategory,
  createFolder,
  deleteCategory,
  deleteFolder,
  updateCategory,
  updateFolder,
} from "@/app/actions/settings";
import { DELETE, READ, WRITE, color, formData, id, ids, js, parseArgs, runAction, text, type McpTool } from "./helpers";

const KIND = z.enum(["dossier", "categorie"]);
const KIND_HELP =
  "Un dossier range une recette (une recette est dans un dossier au plus) ; une catégorie est une étiquette libre (une recette peut en avoir plusieurs).";

export const ORGANISATION_TOOLS: McpTool[] = [
  {
    name: "lister_dossiers_et_categories",
    title: "Lister les dossiers et catégories",
    description: `Liste les dossiers et les catégories de recettes, avec leur id, leur couleur et leur nombre de recettes. ${KIND_HELP}`,
    inputSchema: { type: "object", properties: {} },
    annotations: READ,
    run: async () => {
      const [folders, categories, sansDossier] = await Promise.all([
        prisma.folder.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { recipes: true } } } }),
        prisma.category.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { recipes: true } } } }),
        prisma.recipe.count({ where: { folderId: null } }),
      ]);
      return text({
        dossiers: folders.map((f) => ({ id: f.id, nom: f.name, couleur: f.color, recettes: f._count.recipes })),
        recettes_sans_dossier: sansDossier,
        categories: categories.map((c) => ({ id: c.id, nom: c.name, couleur: c.color, recettes: c._count.recipes })),
      });
    },
  },

  {
    name: "enregistrer_dossier_ou_categorie",
    title: "Créer ou modifier un dossier ou une catégorie",
    description: `Crée un dossier ou une catégorie (sans id), ou le renomme / change sa couleur (avec id). ${KIND_HELP}`,
    inputSchema: {
      type: "object",
      properties: {
        type: js.enum(KIND.options, "dossier ou categorie"),
        id: js.int("Id à modifier ; absent = création"),
        nom: js.str("Nom"),
        couleur: js.str("Couleur #rrggbb (facultatif)"),
      },
      required: ["type", "nom"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(z.object({ type: KIND, id: id.optional(), nom: z.string().trim().min(1).max(100), couleur: color }), args);
      let couleur = a.couleur;
      if (a.id && !couleur) {
        const cur =
          a.type === "dossier"
            ? await prisma.folder.findUnique({ where: { id: a.id }, select: { color: true } })
            : await prisma.category.findUnique({ where: { id: a.id }, select: { color: true } });
        if (!cur) throw new Error(`${a.type} ${a.id} introuvable`);
        couleur = cur.color;
      }
      const fd = formData({ name: a.nom, color: couleur ?? (a.type === "dossier" ? "#888888" : "#e8c547") });
      if (a.type === "dossier") await runAction(() => (a.id ? updateFolder(a.id, fd) : createFolder(fd)));
      else await runAction(() => (a.id ? updateCategory(a.id, fd) : createCategory(fd)));
      const saved =
        a.type === "dossier"
          ? await prisma.folder.findFirst({ where: { name: { equals: a.nom, mode: "insensitive" } }, select: { id: true } })
          : await prisma.category.findFirst({ where: { name: { equals: a.nom, mode: "insensitive" } }, select: { id: true } });
      return text({ [a.type]: a.nom, id: saved?.id, action: a.id ? "modifie" : "cree" });
    },
  },

  {
    name: "ranger_recettes_dans_dossier",
    title: "Ranger des recettes dans un dossier",
    description: "Met une ou plusieurs recettes dans un dossier (dossier_id null = sans dossier).",
    inputSchema: {
      type: "object",
      properties: { recette_ids: js.ints("Ids des recettes"), dossier_id: js.int("Id du dossier, ou null pour « sans dossier »") },
      required: ["recette_ids", "dossier_id"],
    },
    annotations: { ...WRITE, idempotentHint: true },
    run: async (args) => {
      const a = parseArgs(z.object({ recette_ids: ids, dossier_id: id.nullable() }), args);
      const { result } = await runAction(() => assignRecipesToFolder(a.dossier_id, a.recette_ids));
      return text({ rangees: result?.count ?? 0, dossier_id: a.dossier_id });
    },
  },

  {
    name: "categoriser_recettes",
    title: "Ajouter ou retirer des catégories",
    description: "Ajoute et/ou retire des catégories sur une ou plusieurs recettes, sans toucher aux autres catégories.",
    inputSchema: {
      type: "object",
      properties: {
        recette_ids: js.ints("Ids des recettes"),
        ajouter: js.ints("Ids des catégories à ajouter"),
        retirer: js.ints("Ids des catégories à retirer"),
      },
      required: ["recette_ids"],
    },
    annotations: { ...WRITE, idempotentHint: true },
    run: async (args) => {
      const a = parseArgs(
        z
          .object({ recette_ids: ids, ajouter: z.array(id).default([]), retirer: z.array(id).default([]) })
          .refine((v) => v.ajouter.length || v.retirer.length, { message: "donne des catégories à ajouter ou à retirer" }),
        args,
      );
      const recipes = await prisma.recipe.findMany({ where: { id: { in: a.recette_ids } }, select: { id: true } });
      const recipeIds = recipes.map((r) => r.id);
      await prisma.$transaction([
        prisma.recipeCategory.createMany({
          data: recipeIds.flatMap((recipeId) => a.ajouter.map((categoryId) => ({ recipeId, categoryId }))),
          skipDuplicates: true,
        }),
        prisma.recipeCategory.deleteMany({ where: { recipeId: { in: recipeIds }, categoryId: { in: a.retirer } } }),
      ]);
      revalidatePath("/");
      for (const r of recipeIds) revalidatePath(`/recipes/${r}`);
      return text({ recettes: recipeIds.length, ajoutees: a.ajouter, retirees: a.retirer });
    },
  },

  {
    name: "supprimer_dossier_ou_categorie",
    title: "Supprimer un dossier ou une catégorie",
    description: `Supprime un dossier ou une catégorie. Les recettes ne sont jamais supprimées : elles passent « sans dossier » ou perdent juste cette catégorie. ${KIND_HELP}`,
    inputSchema: {
      type: "object",
      properties: { type: js.enum(KIND.options, "dossier ou categorie"), id: js.int("Id") },
      required: ["type", "id"],
    },
    annotations: DELETE,
    run: async (args) => {
      const a = parseArgs(z.object({ type: KIND, id }), args);
      const cur =
        a.type === "dossier"
          ? await prisma.folder.findUnique({ where: { id: a.id }, select: { name: true } })
          : await prisma.category.findUnique({ where: { id: a.id }, select: { name: true } });
      if (!cur) throw new Error(`${a.type} ${a.id} introuvable`);
      await runAction(() => (a.type === "dossier" ? deleteFolder(a.id) : deleteCategory(a.id)));
      return text({ supprime: cur.name, type: a.type });
    },
  },
];
