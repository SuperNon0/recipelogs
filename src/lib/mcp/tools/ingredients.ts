import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getIngredientBaseDetail, listAllIngredientBases } from "@/lib/recipes";
import { INGREDIENT_UNITS } from "@/lib/validation";
import { mergeIngredientBasesBulk, renameIngredientBase } from "@/app/actions/settings";
import { duplicateKey } from "../duplicates";
import { ALLERGENS, cleanAllergens } from "@/lib/allergens";
import { PRICE_UNITS } from "@/lib/cost";
import { DELETE, READ, WRITE, formData, id, ids, js, parseArgs, runAction, text, type McpTool } from "./helpers";

/** Catégories d'ingrédients telles qu'affichées (« fruit » s'affiche « Arôme »). */
const CATEGORY_TO_DB = { base: "base", arome: "fruit", preparation: "preparation", a_classer: null } as const;
type CategoryLabel = keyof typeof CATEGORY_TO_DB;
const CATEGORY_LABELS = Object.keys(CATEGORY_TO_DB) as [CategoryLabel, ...CategoryLabel[]];

function categoryLabel(dbValue: string | null): CategoryLabel {
  const found = CATEGORY_LABELS.find((k) => CATEGORY_TO_DB[k] === dbValue && k !== "a_classer");
  return found ?? "a_classer";
}

const CATEGORY_HELP =
  "Catégories : base = ingrédients de fond (farine, sucre, beurre, œufs…) ; arome = ce qui donne le goût (fruits, épices, chocolat, vanille…) ; preparation = préparation déjà faite utilisée comme ingrédient (crème pâtissière, pâte sucrée…) ; a_classer = pas encore rangé.";

async function ingredientRows() {
  const bases = await listAllIngredientBases();
  return bases.map((b) => ({
    id: b.id,
    nom: b.name,
    categorie: categoryLabel(b.category),
    recettes: b._count.usages,
  }));
}

/** Retrouve un ingrédient par id ou par nom exact (sans casse). */
async function findIngredient(args: { id?: number; nom?: string }) {
  const found = args.id
    ? await prisma.ingredientBase.findUnique({ where: { id: args.id }, select: { id: true, name: true } })
    : args.nom
      ? await prisma.ingredientBase.findFirst({
          where: { name: { equals: args.nom, mode: "insensitive" } },
          select: { id: true, name: true },
        })
      : null;
  if (!found) throw new Error(`ingrédient introuvable (${args.id ?? args.nom ?? "ni id ni nom"})`);
  return found;
}

const idOrName = z.object({ id: id.optional(), nom: z.string().trim().min(1).optional() });
const idOrNameJs = { id: js.int("Id de l'ingrédient"), nom: js.str("Ou nom exact, sans tenir compte de la casse") };

export const INGREDIENT_TOOLS: McpTool[] = [
  {
    name: "lister_ingredients",
    title: "Lister les ingrédients",
    description: `Liste les ingrédients de la base (id, nom, catégorie, nombre de recettes qui l'utilisent), triés par nom. Filtre possible par texte et par catégorie. ${CATEGORY_HELP}`,
    inputSchema: {
      type: "object",
      properties: {
        recherche: js.str("Texte contenu dans le nom (sans casse)"),
        categorie: js.enum(CATEGORY_LABELS, "Ne garder qu'une catégorie"),
        limite: { type: "integer", minimum: 1, maximum: 1000, description: "Nombre maximum de résultats (200 par défaut)" },
      },
    },
    annotations: READ,
    run: async (args) => {
      const { recherche, categorie, limite } = parseArgs(
        z.object({
          recherche: z.string().trim().optional(),
          categorie: z.enum(CATEGORY_LABELS).optional(),
          limite: z.number().int().min(1).max(1000).default(200),
        }),
        args,
      );
      const needle = recherche?.toLowerCase();
      const rows = (await ingredientRows()).filter(
        (r) => (!needle || r.nom.toLowerCase().includes(needle)) && (!categorie || r.categorie === categorie),
      );
      return text({ total: rows.length, affiches: Math.min(rows.length, limite), ingredients: rows.slice(0, limite) });
    },
  },

  {
    name: "recettes_d_un_ingredient",
    title: "Recettes qui utilisent un ingrédient",
    description: "Liste les recettes qui utilisent un ingrédient (par id ou par nom).",
    inputSchema: { type: "object", properties: idOrNameJs },
    annotations: READ,
    run: async (args) => {
      const ing = await findIngredient(parseArgs(idOrName, args));
      const detail = await getIngredientBaseDetail(ing.id);
      return text({
        ingredient: ing.name,
        recettes: (detail?.recipes ?? []).map((r) => ({ id: r.id, nom: r.name })),
      });
    },
  },

  {
    name: "ingredients_a_ranger",
    title: "Ingrédients à classer et doublons",
    description:
      "Liste les ingrédients pas encore classés (catégorie « à classer ») et les groupes de doublons probables (même nom à la casse, aux accents ou au pluriel près).",
    inputSchema: { type: "object", properties: {} },
    annotations: READ,
    run: async () => {
      const rows = await ingredientRows();
      const groups = new Map<string, typeof rows>();
      for (const r of rows) {
        const k = duplicateKey(r.nom);
        groups.set(k, [...(groups.get(k) ?? []), r]);
      }
      const doublons = [...groups.values()].filter((g) => g.length > 1);
      const aClasser = rows.filter((r) => r.categorie === "a_classer");
      return text({
        a_classer: { total: aClasser.length, ingredients: aClasser },
        doublons_probables: { total: doublons.length, groupes: doublons },
      });
    },
  },

  {
    name: "ajouter_ingredients",
    title: "Ajouter des ingrédients",
    description: `Ajoute un ou plusieurs ingrédients à la base (ceux qui existent déjà, sans tenir compte de la casse, sont ignorés). ${CATEGORY_HELP}`,
    inputSchema: {
      type: "object",
      properties: {
        noms: js.strs("Noms des ingrédients à ajouter"),
        categorie: js.enum(CATEGORY_LABELS, "Catégorie donnée aux nouveaux ingrédients"),
        unite_par_defaut: js.enum(INGREDIENT_UNITS, "Unité proposée à la saisie (g par défaut)"),
      },
      required: ["noms"],
    },
    annotations: WRITE,
    run: async (args) => {
      const { noms, categorie, unite_par_defaut } = parseArgs(
        z.object({
          noms: z.array(z.string().trim().min(1).max(200)).min(1).max(500),
          categorie: z.enum(CATEGORY_LABELS).optional(),
          unite_par_defaut: z.enum(INGREDIENT_UNITS).optional(),
        }),
        args,
      );
      const unique = [...new Map(noms.map((n) => [n.toLowerCase(), n])).values()];
      const existing = await prisma.ingredientBase.findMany({
        where: { name: { in: unique, mode: "insensitive" } },
        select: { name: true },
      });
      const taken = new Set(existing.map((e) => e.name.toLowerCase()));
      const toCreate = unique.filter((n) => !taken.has(n.toLowerCase()));
      await prisma.ingredientBase.createMany({
        data: toCreate.map((name) => ({
          name,
          category: categorie ? CATEGORY_TO_DB[categorie] : null,
          ...(unite_par_defaut ? { defaultUnit: unite_par_defaut } : {}),
        })),
        skipDuplicates: true,
      });
      revalidatePath("/settings/ingredients");
      return text({ ajoutes: toCreate, deja_presents: existing.map((e) => e.name) });
    },
  },

  {
    name: "renommer_ingredient",
    title: "Renommer un ingrédient",
    description: "Renomme un ingrédient de la base ; les recettes qui l'utilisent prennent le nouveau nom.",
    inputSchema: {
      type: "object",
      properties: { ...idOrNameJs, nouveau_nom: js.str("Nouveau nom") },
      required: ["nouveau_nom"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(idOrName.extend({ nouveau_nom: z.string().trim().min(1).max(200) }), args);
      const ing = await findIngredient(a);
      await runAction(() => renameIngredientBase(ing.id, formData({ name: a.nouveau_nom })));
      return text({ renomme: ing.name, en: a.nouveau_nom });
    },
  },

  {
    name: "classer_ingredients",
    title: "Classer des ingrédients",
    description: `Change la catégorie et/ou l'unité par défaut d'un ou plusieurs ingrédients, désignés par id ou par nom exact (sans casse). Ne change rien aux recettes ni aux quantités. ${CATEGORY_HELP}`,
    inputSchema: {
      type: "object",
      properties: {
        ids: js.ints("Ids des ingrédients (voir lister_ingredients)"),
        noms: js.strs("Noms exacts des ingrédients, sans tenir compte de la casse"),
        categorie: js.enum(CATEGORY_LABELS, "Nouvelle catégorie"),
        unite_par_defaut: js.enum(INGREDIENT_UNITS, "Unité proposée à la saisie"),
      },
    },
    annotations: { ...WRITE, idempotentHint: true },
    run: async (args) => {
      const { ids: wantedIds = [], noms = [], categorie, unite_par_defaut } = parseArgs(
        z
          .object({
            ids: z.array(id).max(500).optional(),
            noms: z.array(z.string().trim().min(1)).max(500).optional(),
            categorie: z.enum(CATEGORY_LABELS).optional(),
            unite_par_defaut: z.enum(INGREDIENT_UNITS).optional(),
          })
          .refine((a) => a.ids?.length || a.noms?.length, { message: "donne au moins un id ou un nom" })
          .refine((a) => a.categorie !== undefined || a.unite_par_defaut !== undefined, {
            message: "donne une categorie ou une unite_par_defaut",
          }),
        args,
      );
      const found = await prisma.ingredientBase.findMany({
        where: {
          OR: [
            ...(wantedIds.length ? [{ id: { in: wantedIds } }] : []),
            ...noms.map((n) => ({ name: { equals: n, mode: "insensitive" as const } })),
          ],
        },
        select: { id: true, name: true },
      });
      const foundIds = new Set(found.map((f) => f.id));
      const foundNames = new Set(found.map((f) => f.name.toLowerCase()));
      const introuvables = [
        ...wantedIds.filter((i) => !foundIds.has(i)).map(String),
        ...noms.filter((n) => !foundNames.has(n.toLowerCase())),
      ];
      if (found.length === 0) throw new Error(`aucun ingrédient trouvé (${introuvables.join(", ")})`);

      await prisma.ingredientBase.updateMany({
        where: { id: { in: [...foundIds] } },
        data: {
          ...(categorie !== undefined ? { category: CATEGORY_TO_DB[categorie] } : {}),
          ...(unite_par_defaut ? { defaultUnit: unite_par_defaut } : {}),
        },
      });
      revalidatePath("/settings/ingredients");
      return text({
        modifies: found.map((f) => f.name),
        ...(categorie !== undefined ? { categorie } : {}),
        ...(unite_par_defaut ? { unite_par_defaut } : {}),
        ...(introuvables.length ? { introuvables } : {}),
      });
    },
  },

  {
    name: "regler_fiches_ingredients",
    title: "Régler les fiches d'ingrédients",
    description:
      "Règle, pour un ou plusieurs ingrédients (par id ou nom exact sans casse), ce que leur fiche apporte aux calculs : les allergènes INCO (la liste donnée REMPLACE celle de l'ingrédient ; [] pour tout décocher), le poids d'une pièce en grammes (null pour l'effacer) et le prix d'achat en € par kg, L ou pièce (null pour l'effacer ; l'ancien prix reste dans l'historique). Les recettes en tiennent compte toutes seules (allergènes cumulés, pièces comptées dans la masse, coût de revient). " +
      `Clés d'allergènes : ${ALLERGENS.map((a) => `${a.key} (${a.label})`).join(", ")}.`,
    inputSchema: {
      type: "object",
      properties: {
        fiches: {
          type: "array",
          description: "Une entrée par ingrédient",
          items: {
            type: "object",
            properties: {
              ...idOrNameJs,
              allergenes: { type: "array", items: { type: "string", enum: ALLERGENS.map((a) => a.key) }, description: "Allergènes contenus (remplace la liste)" },
              poids_piece_g: { type: ["number", "null"], description: "Poids d'une pièce en g (œuf ≈ 50), null pour effacer" },
              prix: { type: ["number", "null"], description: "Prix d'achat en € (par unite_prix), null pour effacer" },
              unite_prix: js.enum(PRICE_UNITS, "Unité du prix : kg (défaut), L ou pièce"),
            },
          },
        },
      },
      required: ["fiches"],
    },
    annotations: { ...WRITE, idempotentHint: true },
    run: async (args) => {
      const { fiches } = parseArgs(
        z.object({
          fiches: z
            .array(
              idOrName.extend({
                allergenes: z.array(z.string()).optional(),
                poids_piece_g: z.number().positive().max(100_000).nullable().optional(),
                prix: z.number().min(0).max(1_000_000).nullable().optional(),
                unite_prix: z.enum(PRICE_UNITS).default("kg"),
              }),
            )
            .min(1)
            .max(500),
        }),
        args,
      );
      const modifies: { nom: string; allergenes?: string[]; poids_piece_g?: number | null; prix?: string | null }[] = [];
      const introuvables: string[] = [];
      for (const f of fiches) {
        let found;
        try {
          found = await findIngredient(f);
        } catch {
          introuvables.push(String(f.id ?? f.nom));
          continue;
        }
        const allergens = f.allergenes !== undefined ? cleanAllergens(f.allergenes) : undefined;
        await prisma.ingredientBase.update({
          where: { id: found.id },
          data: {
            ...(allergens !== undefined ? { allergens } : {}),
            ...(f.poids_piece_g !== undefined ? { pieceG: f.poids_piece_g } : {}),
            ...(f.prix !== undefined ? { price: f.prix, priceUnit: f.prix != null ? f.unite_prix : null } : {}),
          },
        });
        if (f.prix != null) {
          await prisma.ingredientPrice.create({ data: { baseId: found.id, price: f.prix, priceUnit: f.unite_prix } });
        }
        modifies.push({
          nom: found.name,
          ...(allergens !== undefined ? { allergenes: allergens } : {}),
          ...(f.poids_piece_g !== undefined ? { poids_piece_g: f.poids_piece_g } : {}),
          ...(f.prix !== undefined ? { prix: f.prix != null ? `${f.prix} €/${f.unite_prix}` : null } : {}),
        });
      }
      revalidatePath("/settings/ingredients");
      revalidatePath("/");
      return text({ modifies, ...(introuvables.length ? { introuvables } : {}) });
    },
  },

  {
    name: "fusionner_ingredients",
    title: "Fusionner des doublons",
    description:
      "Fusionne un ou plusieurs ingrédients dans un ingrédient cible : les recettes passent sur la cible, puis les doublons sont retirés de la base.",
    inputSchema: {
      type: "object",
      properties: {
        ids_doublons: js.ints("Ids des ingrédients à fondre dans la cible"),
        id_cible: js.int("Id de l'ingrédient à garder"),
      },
      required: ["ids_doublons", "id_cible"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(z.object({ ids_doublons: ids, id_cible: id }), args);
      const { result } = await runAction(() => mergeIngredientBasesBulk(a.ids_doublons, a.id_cible));
      return text({ fusionnes: result?.count ?? 0, dans: a.id_cible });
    },
  },

  {
    name: "supprimer_ingredient_inutilise",
    title: "Supprimer un ingrédient inutilisé",
    description:
      "Supprime un ingrédient de la base, seulement s'il n'est utilisé dans aucune recette (sinon refuse et liste les recettes).",
    inputSchema: { type: "object", properties: idOrNameJs },
    annotations: DELETE,
    run: async (args) => {
      const ing = await findIngredient(parseArgs(idOrName, args));
      const detail = await getIngredientBaseDetail(ing.id);
      const used = detail?.recipes ?? [];
      if (used.length > 0) {
        throw new Error(
          `« ${ing.name} » est utilisé dans ${used.length} recette(s) : ${used.map((r) => r.name).join(", ")}. Suppression refusée.`,
        );
      }
      await prisma.ingredientBase.delete({ where: { id: ing.id } });
      revalidatePath("/settings/ingredients");
      return text({ supprime: ing.name });
    },
  },
];
