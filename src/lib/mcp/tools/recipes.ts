import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { buildRecipeSnapshot } from "@/lib/cookbooks";
import { recipeMass } from "@/lib/massAdjust";
import { getRecipeDetail, listRecipes } from "@/lib/recipes";
import { INGREDIENT_UNITS } from "@/lib/validation";
import {
  addComment,
  applyMultiplierToRecipe,
  createRecipe,
  deleteRecipes,
  duplicateRecipe,
  updateRecipe,
} from "@/app/actions/recipes";
import { addSubRecipe, removeSubRecipe } from "@/app/actions/subRecipes";
import { DELETE, READ, WRITE, formData, id, idFromPath, js, parseArgs, runAction, text, type McpTool } from "./helpers";

const UNIT_HELP = "Unités : g, L, cc (cuillère à café), cs (cuillère à soupe), pièce, QS (quantité suffisante, sans quantité).";

const ingredientSchema = z.object({
  nom: z.string().trim().min(1).max(200),
  quantite: z.number().nonnegative().max(1_000_000).default(0),
  quantite_max: z.number().nonnegative().max(1_000_000).nullable().optional(),
  unite: z.enum(INGREDIENT_UNITS).default("g"),
});
type IngredientArg = z.infer<typeof ingredientSchema>;

const ingredientsJs = {
  type: "array",
  description: `Ingrédients dans l'ordre. ${UNIT_HELP}`,
  items: {
    type: "object",
    properties: {
      nom: js.str("Nom de l'ingrédient"),
      quantite: js.num("Quantité dans l'unité choisie"),
      quantite_max: js.num("Haut d'une fourchette (ex. 100 à 120 g), facultatif"),
      unite: js.enum(INGREDIENT_UNITS, "Unité (g par défaut)"),
    },
    required: ["nom"],
  },
};

/** Champs communs à la création et à la modification. */
const recipeFields = {
  nom: z.string().trim().min(1).max(200),
  ingredients: z.array(ingredientSchema).min(1).max(100),
  etapes: z.string().max(50_000).optional(),
  source: z.string().max(500).optional(),
  notes: z.string().max(5000).optional(),
  dossier_id: id.nullable().optional(),
  categorie_ids: z.array(id).max(50).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  favori: z.boolean().optional(),
  note: z.number().int().min(1).max(5).nullable().optional(),
};

const recipeFieldsJs = {
  nom: js.str("Nom de la recette"),
  ingredients: ingredientsJs,
  etapes: js.str("Étapes de préparation, en texte (une étape par ligne) ou en HTML simple (<p>, <ol><li>, <strong>…)"),
  source: js.str("Source (livre, site, chef…)"),
  notes: js.str("Notes et astuces"),
  dossier_id: js.int("Id du dossier (voir lister_dossiers_et_categories), null pour aucun"),
  categorie_ids: js.ints("Ids des catégories (remplace les catégories actuelles)"),
  tags: js.strs("Étiquettes libres (remplace les actuelles)"),
  favori: js.bool("Recette favorite"),
  note: js.int("Note de 1 à 5, null pour aucune"),
};

type RecipeValues = {
  nom: string;
  ingredients: IngredientArg[];
  etapes?: string;
  source?: string;
  notes?: string;
  dossier_id?: number | null;
  categorie_ids?: number[];
  tags?: string[];
  favori?: boolean;
  note?: number | null;
};

/** Construit le même formulaire que l'écran de saisie d'une recette. */
function recipeForm(v: RecipeValues): FormData {
  const fd = formData({
    name: v.nom,
    source: v.source ?? "",
    notesTips: v.notes ?? "",
    steps: v.etapes ?? "",
    favorite: v.favori ?? false,
    rating: v.note ?? undefined,
    tags: (v.tags ?? []).join(","),
    categoryIds: v.categorie_ids ?? [],
    folderId: v.dossier_id ?? undefined,
  });
  for (const ing of v.ingredients) {
    fd.append("ingredientName", ing.nom);
    fd.append("ingredientQty", String(ing.quantite));
    fd.append("ingredientUnit", ing.unite);
    fd.append("ingredientQtyMax", ing.quantite_max != null ? String(ing.quantite_max) : "");
  }
  return fd;
}

async function requireRecipe(recipeId: number) {
  const r = await getRecipeDetail(recipeId);
  if (!r) throw new Error(`recette ${recipeId} introuvable`);
  return r;
}

const qty = (v: unknown) => (v == null ? null : Number(v));

export const RECIPE_TOOLS: McpTool[] = [
  {
    name: "chercher_recettes",
    title: "Chercher des recettes",
    description:
      "Cherche des recettes par nom, dossier, catégorie, étiquette, ingrédient ou favoris. Renvoie id, nom, favori, note, masse totale (g), dossier et catégories. Sans filtre : toutes les recettes, les plus récemment modifiées d'abord.",
    inputSchema: {
      type: "object",
      properties: {
        recherche: js.str("Texte dans le nom (sans accents ni casse)"),
        dossier_id: { description: "Id du dossier, ou \"sans\" pour les recettes sans dossier", type: ["integer", "string"] },
        categorie_id: js.int("Id de catégorie"),
        tag: js.str("Étiquette exacte"),
        ingredient: js.str("Ne garder que les recettes contenant cet ingrédient (texte dans le nom)"),
        favoris: js.bool("Seulement les favoris"),
        limite: { type: "integer", minimum: 1, maximum: 1000, description: "Nombre maximum de résultats (100 par défaut)" },
      },
    },
    annotations: READ,
    run: async (args) => {
      const a = parseArgs(
        z.object({
          recherche: z.string().optional(),
          dossier_id: z.union([id, z.literal("sans")]).optional(),
          categorie_id: id.optional(),
          tag: z.string().optional(),
          ingredient: z.string().trim().min(1).optional(),
          favoris: z.boolean().optional(),
          limite: z.number().int().min(1).max(1000).default(100),
        }),
        args,
      );
      let list = await listRecipes({
        q: a.recherche,
        tag: a.tag,
        categoryId: a.categorie_id,
        favoritesOnly: a.favoris,
        folderId: a.dossier_id === "sans" ? "none" : a.dossier_id,
      });
      if (a.ingredient) {
        const rows = await prisma.ingredient.findMany({
          where: { name: { contains: a.ingredient, mode: "insensitive" } },
          select: { recipeId: true },
          distinct: ["recipeId"],
        });
        const keep = new Set(rows.map((r) => r.recipeId));
        list = list.filter((r) => keep.has(r.id));
      }
      const folders = new Map((await prisma.folder.findMany({ select: { id: true, name: true } })).map((f) => [f.id, f.name]));
      return text({
        total: list.length,
        recettes: list.slice(0, a.limite).map((r) => ({
          id: r.id,
          nom: r.name,
          favori: r.favorite,
          note: r.rating,
          masse_totale_g: Math.round(r.totalMassG),
          dossier: r.folderId ? folders.get(r.folderId) ?? null : null,
          categories: r.categories.map((c) => c.name),
          tags: r.tags,
          sous_recettes: r.subCount,
        })),
      });
    },
  },

  {
    name: "lire_recette",
    title: "Lire une recette",
    description:
      "Donne une recette complète : ingrédients, étapes, notes, source, dossier, catégories, étiquettes, sous-recettes (avec leurs quantités calculées), commentaires et recettes qui l'utilisent. Un multiplicateur facultatif recalcule les quantités sans rien enregistrer.",
    inputSchema: {
      type: "object",
      properties: { id: js.int("Id de la recette"), multiplicateur: js.num("Coefficient appliqué aux quantités (1 par défaut)") },
      required: ["id"],
    },
    annotations: READ,
    run: async (args) => {
      const a = parseArgs(z.object({ id, multiplicateur: z.number().positive().max(1000).default(1) }), args);
      const r = await requireRecipe(a.id);
      const snap = await buildRecipeSnapshot(a.id, a.multiplicateur);
      return text({
        id: r.id,
        nom: r.name,
        favori: r.favorite,
        note: r.rating,
        source: r.source,
        notes: r.notesTips,
        dossier: r.folder ? { id: r.folder.id, nom: r.folder.name } : null,
        categories: r.categories.map((c) => ({ id: c.category.id, nom: c.category.name })),
        tags: r.tags.map((t) => t.name),
        multiplicateur: a.multiplicateur,
        masse_totale_g: snap ? Math.round(snap.totalMassG) : null,
        ingredients: (snap?.ingredients ?? []).map((i, idx) => ({
          id: r.ingredients[idx]?.id,
          nom: i.name,
          quantite: i.quantityG,
          quantite_max: i.quantityGMax,
          unite: i.unit,
        })),
        etapes: r.stepsBlock?.content ?? null,
        sous_recettes: r.parentLinks.map((l, idx) => {
          const s = snap?.subRecipes[idx];
          return {
            lien_id: l.id,
            libelle: l.label,
            recette: { id: l.child.id, nom: l.child.name },
            mode: { coefficient: "coefficient", mass_target: "masse_cible", pivot_ingredient: "ingredient_pivot" }[l.calcMode],
            valeur: Number(l.calcValue),
            verrouillee: l.isLocked,
            masse_g: s ? Math.round(s.totalMassG) : null,
            ingredients: (s?.ingredients ?? []).map((i) => ({ nom: i.name, quantite: i.quantityG, unite: i.unit })),
          };
        }),
        utilisee_dans: r.childLinks.map((l) => ({ id: l.parent.id, nom: l.parent.name, libelle: l.label })),
        commentaires: r.comments.map((c) => ({ id: c.id, texte: c.content, date: c.createdAt.toISOString() })),
      });
    },
  },

  {
    name: "creer_recette",
    title: "Créer une recette",
    description: `Crée une nouvelle recette. Les nouveaux ingrédients sont ajoutés à la base automatiquement. ${UNIT_HELP}`,
    inputSchema: { type: "object", properties: recipeFieldsJs, required: ["nom", "ingredients"] },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(z.object(recipeFields), args);
      const { redirectTo } = await runAction(() => createRecipe(recipeForm(a)));
      return text({ creee: a.nom, id: idFromPath(redirectTo) });
    },
  },

  {
    name: "modifier_recette",
    title: "Modifier une recette",
    description: `Modifie une recette. Seuls les champs donnés changent ; « ingredients », « categorie_ids » et « tags » remplacent la liste entière (relire la recette avant). ${UNIT_HELP}`,
    inputSchema: { type: "object", properties: { id: js.int("Id de la recette"), ...recipeFieldsJs }, required: ["id"] },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(z.object({ id, ...recipeFields }).partial().required({ id: true }), args);
      const r = await requireRecipe(a.id);
      const current: RecipeValues = {
        nom: r.name,
        ingredients: r.ingredients.map((i) => ({
          nom: i.name ?? i.ingredientBase?.name ?? "—",
          quantite: Number(i.quantityG),
          quantite_max: qty(i.quantityGMax),
          unite: (INGREDIENT_UNITS as readonly string[]).includes(i.unit) ? (i.unit as IngredientArg["unite"]) : "g",
        })),
        etapes: r.stepsBlock?.content ?? "",
        source: r.source ?? "",
        notes: r.notesTips ?? "",
        dossier_id: r.folderId,
        categorie_ids: r.categories.map((c) => c.categoryId),
        tags: r.tags.map((t) => t.name),
        favori: r.favorite,
        note: r.rating,
      };
      const next: RecipeValues = { ...current };
      for (const [k, v] of Object.entries(a)) if (k !== "id" && v !== undefined) Object.assign(next, { [k]: v });
      await runAction(() => updateRecipe(a.id, recipeForm(next)));
      return text({ modifiee: next.nom, id: a.id, champs: Object.keys(a).filter((k) => k !== "id") });
    },
  },

  {
    name: "mettre_en_favori",
    title: "Mettre ou enlever des favoris",
    description: "Met une recette en favori ou l'enlève des favoris.",
    inputSchema: {
      type: "object",
      properties: { id: js.int("Id de la recette"), favori: js.bool("true = favori, false = plus favori") },
      required: ["id", "favori"],
    },
    annotations: { ...WRITE, idempotentHint: true },
    run: async (args) => {
      const a = parseArgs(z.object({ id, favori: z.boolean() }), args);
      const r = await prisma.recipe.update({ where: { id: a.id }, data: { favorite: a.favori }, select: { name: true } });
      revalidatePath("/");
      revalidatePath("/favorites");
      revalidatePath(`/recipes/${a.id}`);
      return text({ recette: r.name, favori: a.favori });
    },
  },

  {
    name: "dupliquer_recette",
    title: "Dupliquer une recette",
    description: "Crée une copie d'une recette (nom suivi de « (copie) »), avec ses ingrédients, étapes et sous-recettes.",
    inputSchema: { type: "object", properties: { id: js.int("Id de la recette à copier") }, required: ["id"] },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(z.object({ id }), args);
      const { redirectTo } = await runAction(() => duplicateRecipe(a.id));
      return text({ copie_id: idFromPath(redirectTo) });
    },
  },

  {
    name: "ajuster_quantites_recette",
    title: "Multiplier les quantités",
    description:
      "Change pour de bon les quantités d'une recette : par un multiplicateur (ex. 1.5) ou pour viser une masse totale en grammes. Les sous-recettes gardent leurs réglages. Pour un simple calcul sans enregistrer, utiliser lire_recette avec un multiplicateur.",
    inputSchema: {
      type: "object",
      properties: {
        id: js.int("Id de la recette"),
        multiplicateur: js.num("Coefficient (ex. 2 pour doubler)"),
        masse_cible_g: js.num("Ou masse totale visée, en grammes"),
      },
      required: ["id"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(
        z
          .object({ id, multiplicateur: z.number().positive().max(1000).optional(), masse_cible_g: z.number().positive().optional() })
          .refine((v) => v.multiplicateur || v.masse_cible_g, { message: "donne un multiplicateur ou une masse_cible_g" }),
        args,
      );
      const ings = await prisma.ingredient.findMany({ where: { recipeId: a.id }, select: { quantityG: true, quantityGMax: true, unit: true } });
      const before = recipeMass(ings).avg;
      let mult = a.multiplicateur ?? 1;
      if (a.masse_cible_g && !a.multiplicateur) {
        if (before <= 0) throw new Error("masse actuelle nulle : impossible de viser une masse");
        mult = a.masse_cible_g / before;
      }
      await runAction(() => applyMultiplierToRecipe(a.id, mult, a.masse_cible_g));
      const after = recipeMass(
        await prisma.ingredient.findMany({ where: { recipeId: a.id }, select: { quantityG: true, quantityGMax: true, unit: true } }),
      ).avg;
      return text({ id: a.id, masse_avant_g: Math.round(before), masse_apres_g: Math.round(after) });
    },
  },

  {
    name: "ajouter_sous_recette",
    title: "Ajouter une sous-recette",
    description:
      "Utilise une recette comme sous-recette d'une autre (ex. une crème dans une tarte). Modes : coefficient (valeur = multiplicateur), masse_cible (valeur = grammes voulus), ingredient_pivot (valeur = grammes voulus de l'ingrédient pivot ; son id est dans lire_recette de la sous-recette).",
    inputSchema: {
      type: "object",
      properties: {
        recette_id: js.int("Recette qui reçoit la sous-recette"),
        sous_recette_id: js.int("Recette utilisée comme sous-recette"),
        libelle: js.str("Libellé affiché (ex. « Crème pâtissière »)"),
        mode: js.enum(["coefficient", "masse_cible", "ingredient_pivot"], "Mode de calcul (coefficient par défaut)"),
        valeur: js.num("Valeur selon le mode (1 par défaut)"),
        ingredient_pivot_id: js.int("Pour le mode ingredient_pivot : id de l'ingrédient dans la sous-recette"),
      },
      required: ["recette_id", "sous_recette_id", "libelle"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(
        z.object({
          recette_id: id,
          sous_recette_id: id,
          libelle: z.string().trim().min(1).max(200),
          mode: z.enum(["coefficient", "masse_cible", "ingredient_pivot"]).default("coefficient"),
          valeur: z.number().positive().default(1),
          ingredient_pivot_id: id.optional(),
        }),
        args,
      );
      const calcMode = { coefficient: "coefficient", masse_cible: "mass_target", ingredient_pivot: "pivot_ingredient" }[a.mode];
      await runAction(() =>
        addSubRecipe(
          a.recette_id,
          formData({
            childId: a.sous_recette_id,
            label: a.libelle,
            calcMode,
            calcValue: a.valeur,
            pivotIngredientId: a.ingredient_pivot_id,
          }),
        ),
      );
      return text({ ajoutee: a.libelle, dans: a.recette_id });
    },
  },

  {
    name: "retirer_sous_recette",
    title: "Retirer une sous-recette",
    description: "Retire une sous-recette d'une recette (la recette utilisée, elle, n'est pas supprimée). lien_id vient de lire_recette.",
    inputSchema: {
      type: "object",
      properties: { recette_id: js.int("Recette parente"), lien_id: js.int("lien_id de la sous-recette") },
      required: ["recette_id", "lien_id"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(z.object({ recette_id: id, lien_id: id }), args);
      const link = await prisma.subRecipe.findFirst({ where: { id: a.lien_id, parentId: a.recette_id }, select: { label: true } });
      if (!link) throw new Error("sous-recette introuvable dans cette recette");
      await runAction(() => removeSubRecipe(a.lien_id, a.recette_id));
      return text({ retiree: link.label });
    },
  },

  {
    name: "ajouter_commentaire",
    title: "Ajouter un commentaire",
    description: "Ajoute un commentaire daté à une recette (essai, remarque…).",
    inputSchema: {
      type: "object",
      properties: { recette_id: js.int("Id de la recette"), texte: js.str("Commentaire") },
      required: ["recette_id", "texte"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(z.object({ recette_id: id, texte: z.string().trim().min(1).max(5000) }), args);
      await requireRecipe(a.recette_id);
      await runAction(() => addComment(a.recette_id, formData({ content: a.texte })));
      return text({ ajoute: true });
    },
  },

  {
    name: "supprimer_recette",
    title: "Supprimer une recette",
    description:
      "Supprime définitivement une recette. Refusé si elle sert de sous-recette ailleurs. Toujours demander confirmation à l'utilisateur avant.",
    inputSchema: { type: "object", properties: { id: js.int("Id de la recette") }, required: ["id"] },
    annotations: DELETE,
    run: async (args) => {
      const a = parseArgs(z.object({ id }), args);
      const r = await requireRecipe(a.id);
      if (r.childLinks.length) {
        throw new Error(`« ${r.name} » sert de sous-recette dans : ${r.childLinks.map((l) => l.parent.name).join(", ")}. Retire-la d'abord.`);
      }
      await runAction(() => deleteRecipes([a.id]));
      return text({ supprimee: r.name });
    },
  },
];
