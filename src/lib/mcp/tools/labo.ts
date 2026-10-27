import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { loadRecipeTree } from "@/lib/recipes";
import { getVariantFamily } from "@/lib/variants";
import { compareRecipes, compareSteps } from "@/lib/compare";
import { buildProduction, type ProductionBlock } from "@/lib/production";
import { buildProductionSheet, listProductionItems, productionTarget } from "@/lib/productionData";
import { moldCoef, moldLabel, parseMold, type Mold } from "@/lib/mold";
import { searchByIngredient, searchInText } from "@/lib/fullSearch";
import { rescaleStepText } from "@/lib/stepQty";
import { htmlToPlainText } from "@/lib/stepsText";
import { createVariant, linkVariant, promoteVariant, setVariantNote, unlinkVariant } from "@/app/actions/variants";
import { addToProduction, clearProduction, removeProductionItem, setProductionAmount } from "@/app/actions/production";
import { DELETE, READ, WRITE, id, js, parseArgs, runAction, text, type McpTool } from "./helpers";

/**
 * Outils des nouveautés V2.5 : variantes (essais) et comparaison, fiche de
 * production, adaptation à un moule, recherche complète.
 */

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

const moldSchema = z.object({
  forme: z.enum(["cercle", "cadre", "carre"]),
  a: z.number().positive().max(1000),
  b: z.number().positive().max(1000).optional(),
  h: z.number().positive().max(1000).optional(),
});
const moldJs = (description: string) => ({
  type: "object",
  description,
  properties: {
    forme: js.enum(["cercle", "cadre", "carre"] as const, "Forme du moule"),
    a: js.num("Diamètre (cercle), côté (carré) ou longueur (cadre), en cm"),
    b: js.num("Largeur du cadre en cm"),
    h: js.num("Hauteur en cm, facultative"),
  },
  required: ["forme", "a"],
});
const toMold = (m: z.infer<typeof moldSchema>): Mold => ({ shape: m.forme, a: m.a, b: m.b ?? null, h: m.h ?? null });

/** Pesées d'un bloc de production (ou d'une recette mise à l'échelle) au format MCP. */
function blockOut(b: ProductionBlock, withSteps: boolean) {
  return {
    recette: { id: b.recipeId, nom: b.name },
    ...(b.isProduct ? { demande: b.target ?? null } : { pour: b.usedIn }),
    masse_g: Math.round(b.massG),
    coefficient: round(b.coef, 3),
    pesees: b.lines.map((l) =>
      l.kind === "title" ? { intertitre: l.name } : { nom: l.name, quantite: l.unit === "QS" ? "QS" : round(l.qty, 2), unite: l.unit },
    ),
    ...(withSteps && b.steps ? { etapes: rescaleStepText(htmlToPlainText(b.steps), b.coef).replace(/\{\s*([^}]*)\}/g, "$1") } : {}),
  };
}

async function requireTree(recipeId: number) {
  const t = await loadRecipeTree(recipeId);
  if (!t) throw new Error(`recette ${recipeId} introuvable`);
  return t;
}

export const LABO_TOOLS: McpTool[] = [
  // ── Variantes ──────────────────────────────────────────
  {
    name: "voir_variantes",
    title: "Voir les variantes d'une recette",
    description:
      "Liste la famille de variantes (essais) d'une recette : la version principale et ses essais, avec leur nom d'essai, leur masse et leur date de modification. Les variantes sont des recettes complètes, rangées sous la version principale (masquées de la liste des recettes).",
    inputSchema: { type: "object", properties: { recette_id: js.int("Id d'une recette de la famille (principale ou variante)") }, required: ["recette_id"] },
    annotations: READ,
    run: async (args) => {
      const a = parseArgs(z.object({ recette_id: id }), args);
      const f = await getVariantFamily(a.recette_id);
      if (!f) return text({ recette_id: a.recette_id, variantes: [], info: "Cette recette n'a pas de variante." });
      return text({
        version_principale_id: f.rootId,
        membres: f.members.map((m) => ({
          id: m.id,
          nom: m.name,
          essai: m.isRoot ? null : m.note,
          version_principale: m.isRoot,
          masse_g: Math.round(m.massG),
          modifiee_le: new Date(m.updatedAt).toISOString().slice(0, 10),
        })),
      });
    },
  },

  {
    name: "creer_variante",
    title: "Créer une variante",
    description:
      "Crée un essai d'une recette : copie complète (ingrédients, sous-recettes, étapes, réglages), reliée à la version principale. On modifie ensuite la copie avec modifier_recette sans toucher à l'original.",
    inputSchema: {
      type: "object",
      properties: { recette_id: js.int("Recette à copier"), nom_essai: js.str("Ce qui change dans l'essai (ex. « moins sucré », « chocolat 64 % »)") },
      required: ["recette_id"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(z.object({ recette_id: id, nom_essai: z.string().max(120).default("") }), args);
      const { result } = await runAction(() => createVariant(a.recette_id, a.nom_essai));
      return text({ variante_creee: result?.id ?? null, depuis: a.recette_id });
    },
  },

  {
    name: "relier_variante",
    title: "Relier une recette comme variante",
    description:
      "Range une recette existante (un essai fait avant, en recette séparée) comme variante d'une autre. Rien n'est copié ni supprimé.",
    inputSchema: {
      type: "object",
      properties: {
        recette_id: js.int("Recette de référence (sa version principale devient celle de la famille)"),
        variante_id: js.int("Recette à ranger comme variante"),
        nom_essai: js.str("Ce qui change dans cet essai"),
      },
      required: ["recette_id", "variante_id"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(z.object({ recette_id: id, variante_id: id, nom_essai: z.string().max(120).default("") }), args);
      await runAction(() => linkVariant(a.recette_id, a.variante_id, a.nom_essai));
      return text({ reliee: a.variante_id, a: a.recette_id });
    },
  },

  {
    name: "gerer_variante",
    title: "Renommer, promouvoir ou détacher une variante",
    description:
      "Actions sur une variante : renommer (change le nom de l'essai), principale (elle devient la version principale ; l'ancienne devient une variante « ancienne version »), detacher (elle redevient une recette indépendante, rien n'est supprimé).",
    inputSchema: {
      type: "object",
      properties: {
        variante_id: js.int("Id de la recette variante"),
        action: js.enum(["renommer", "principale", "detacher"] as const, "Action"),
        nom_essai: js.str("Nouveau nom de l'essai (pour renommer)"),
      },
      required: ["variante_id", "action"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(
        z.object({ variante_id: id, action: z.enum(["renommer", "principale", "detacher"]), nom_essai: z.string().max(120).default("") }),
        args,
      );
      if (a.action === "renommer") await runAction(() => setVariantNote(a.variante_id, a.nom_essai));
      else if (a.action === "principale") await runAction(() => promoteVariant(a.variante_id));
      else await runAction(() => unlinkVariant(a.variante_id));
      return text({ fait: a.action, variante_id: a.variante_id });
    },
  },

  {
    name: "comparer_recettes",
    title: "Comparer deux recettes",
    description:
      "Compare deux recettes (souvent deux variantes) ligne à ligne, à ×1 : grammes de chaque ingrédient et sous-recette dans A et dans B, écart en g et en %, ce qui est ajouté ou retiré, et les étapes qui changent.",
    inputSchema: {
      type: "object",
      properties: { recette_a: js.int("Recette A (souvent l'ancienne)"), recette_b: js.int("Recette B (souvent l'essai)") },
      required: ["recette_a", "recette_b"],
    },
    annotations: READ,
    run: async (args) => {
      const a = parseArgs(z.object({ recette_a: id, recette_b: id }), args);
      const [ta, tb] = await Promise.all([requireTree(a.recette_a), requireTree(a.recette_b)]);
      const cmp = compareRecipes(ta, tb);
      const steps = compareSteps(ta.steps, tb.steps);
      return text({
        a: { id: ta.id, nom: ta.name, masse_g: Math.round(cmp.totalA) },
        b: { id: tb.id, nom: tb.name, masse_g: Math.round(cmp.totalB) },
        lignes: cmp.rows.map((r) => ({
          nom: r.name,
          sous_recette: r.isSub || undefined,
          a_g: r.a == null ? null : round(r.a),
          b_g: r.b == null ? null : round(r.b),
          ...(r.a == null ? { etat: "ajouté" } : r.b == null ? { etat: "retiré" } : {}),
          ...(r.a != null && r.b != null && r.changed ? { etat: "modifié" } : {}),
          ...(r.a != null && r.b != null && Math.abs(r.b - r.a) > 0.001
            ? { ecart_g: round(r.b - r.a), ecart_pct: r.a > 0 ? round(((r.b - r.a) / r.a) * 100) : null }
            : {}),
          ...(r.noteA ? { a_note: r.noteA } : {}),
          ...(r.noteB ? { b_note: r.noteB } : {}),
        })),
        etapes_modifiees: {
          a: steps.a.filter((s) => s.changed).map((s) => s.text),
          b: steps.b.filter((s) => s.changed).map((s) => s.text),
        },
      });
    },
  },

  // ── Moule ──────────────────────────────────────────────
  {
    name: "adapter_au_moule",
    title: "Adapter une recette à un autre moule",
    description:
      "Calcule les quantités d'une recette pour un autre moule (ou plusieurs), sans rien enregistrer. Rapport des surfaces, ou des volumes si les deux hauteurs sont connues. Le moule d'origine est celui de la recette (lire_recette → moule) ou celui donné ici. Renvoie le coefficient et toutes les pesées, sous-recettes comprises.",
    inputSchema: {
      type: "object",
      properties: {
        recette_id: js.int("Id de la recette"),
        moule_cible: moldJs("Moule visé, en cm"),
        nombre: js.int("Nombre de moules visés (1 par défaut)"),
        moule_origine: moldJs("Moule d'origine si la recette n'en a pas d'enregistré"),
      },
      required: ["recette_id", "moule_cible"],
    },
    annotations: READ,
    run: async (args) => {
      const a = parseArgs(
        z.object({ recette_id: id, moule_cible: moldSchema, nombre: z.number().int().positive().max(1000).default(1), moule_origine: moldSchema.optional() }),
        args,
      );
      const r = await prisma.recipe.findUnique({ where: { id: a.recette_id }, select: { mold: true } });
      if (!r) throw new Error(`recette ${a.recette_id} introuvable`);
      const from = a.moule_origine ? toMold(a.moule_origine) : parseMold(r.mold);
      if (!from) throw new Error("La recette n'a pas de moule d'origine : donne moule_origine (ou enregistre-le avec modifier_recette).");
      const to = toMold(a.moule_cible);
      const coef = moldCoef(from, to, a.nombre);
      const tree = await requireTree(a.recette_id);
      const sheet = buildProduction([{ tree, coef }]);
      return text({
        de: moldLabel(from),
        vers: `${a.nombre > 1 ? `${a.nombre} × ` : ""}${moldLabel(to)}`,
        coefficient: round(coef, 3),
        calcul: from.h && to.h ? "volumes (hauteurs connues)" : "surfaces (même hauteur)",
        masse_totale_g: Math.round(sheet.massG),
        preparations: sheet.blocks.map((b) => blockOut(b, false)),
      });
    },
  },

  // ── Fiche de production ────────────────────────────────
  {
    name: "voir_fiche_production",
    title: "Voir la fiche de production",
    description:
      "Donne la fiche de production en cours : recettes demandées (ligne_id, quantité), puis toutes les pesées par préparation dans l'ordre de fabrication (sous-recettes d'abord, une sous-recette partagée n'a qu'un bloc) et le total à sortir par ingrédient. Le PDF se télécharge dans l'appli (page Production).",
    inputSchema: { type: "object", properties: { avec_etapes: js.bool("Ajouter les étapes de chaque préparation, quantités à l'échelle") } },
    annotations: READ,
    run: async (args) => {
      const a = parseArgs(z.object({ avec_etapes: z.boolean().default(false) }), args);
      const items = await listProductionItems();
      if (!items.length) return text({ recettes: [], info: "La fiche de production est vide." });
      const sheet = await buildProductionSheet(items.map((i) => ({ recipeId: i.recipeId, amount: i.amount, yieldCount: i.yieldCount })));
      return text({
        recettes: items.map((i) => ({
          ligne_id: i.id,
          recette: { id: i.recipeId, nom: i.name },
          quantite: i.amount,
          demande: productionTarget(i.amount, i.yieldCount, i.yieldLabel),
          en_pieces: !!i.yieldCount,
        })),
        masse_totale_g: Math.round(sheet.massG),
        preparations: sheet.blocks.map((b) => blockOut(b, a.avec_etapes)),
        total_a_sortir: sheet.totals.map((t) => ({ nom: t.name, quantite: t.qty == null ? "QS" : round(t.qty, 2), unite: t.unit })),
      });
    },
  },

  {
    name: "ajouter_a_production",
    title: "Ajouter une recette à la fiche de production",
    description:
      "Ajoute une recette à la fiche de production, ou change sa quantité si elle y est déjà. quantite = nombre de pièces si la recette a un rendement (ex. 60 éclairs), sinon un multiplicateur (ex. 2).",
    inputSchema: {
      type: "object",
      properties: { recette_id: js.int("Id de la recette"), quantite: js.num("Pièces voulues (si rendement) ou multiplicateur") },
      required: ["recette_id", "quantite"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(z.object({ recette_id: id, quantite: z.number().positive().max(100_000) }), args);
      await runAction(() => addToProduction(a.recette_id, a.quantite));
      return text({ ajoutee: a.recette_id, quantite: a.quantite });
    },
  },

  {
    name: "modifier_production",
    title: "Modifier ou vider la fiche de production",
    description:
      "Change la quantité d'une ligne (ligne_id + quantite), retire une ligne (ligne_id + retirer) ou vide toute la fiche (vider). Les recettes ne sont jamais touchées.",
    inputSchema: {
      type: "object",
      properties: {
        ligne_id: js.int("ligne_id donné par voir_fiche_production"),
        quantite: js.num("Nouvelle quantité"),
        retirer: js.bool("Retirer cette ligne"),
        vider: js.bool("Vider toute la fiche"),
      },
    },
    annotations: DELETE,
    run: async (args) => {
      const a = parseArgs(
        z.object({ ligne_id: id.optional(), quantite: z.number().positive().max(100_000).optional(), retirer: z.boolean().default(false), vider: z.boolean().default(false) }),
        args,
      );
      if (a.vider) {
        await runAction(() => clearProduction());
        return text({ fiche: "vidée" });
      }
      if (!a.ligne_id) throw new Error("ligne_id manquant (ou vider: true).");
      const ligne = a.ligne_id;
      if (a.retirer) {
        await runAction(() => removeProductionItem(ligne));
        return text({ retiree: ligne });
      }
      if (a.quantite == null) throw new Error("quantite manquante.");
      const q = a.quantite;
      await runAction(() => setProductionAmount(ligne, q));
      return text({ ligne_id: ligne, quantite: q });
    },
  },

  // ── Recherche complète ─────────────────────────────────
  {
    name: "recherche_complete",
    title: "Recherche complète (ingrédients et texte)",
    description:
      "Cherche comme la loupe de l'appli, sans accents ni majuscules : les recettes qui contiennent un ingrédient, sous-recettes comprises à tous les niveaux (« jaunes + crème » = toutes les recettes qui ont les deux), et les recettes dont les étapes, les notes ou les essais contiennent le texte (3 lettres minimum), avec un extrait.",
    inputSchema: { type: "object", properties: { texte: js.str("Ingrédient(s) séparés par +, ou texte à chercher") }, required: ["texte"] },
    annotations: READ,
    run: async (args) => {
      const a = parseArgs(z.object({ texte: z.string().trim().min(2).max(200) }), args);
      const [withIng, inText] = await Promise.all([searchByIngredient(a.texte), searchInText(a.texte)]);
      return text({
        avec_ingredient: withIng.map((r) => ({ id: r.id, nom: r.name, detail: r.detail })),
        dans_le_texte: inText.map((r) => ({ id: r.id, nom: r.name, ou: r.where, extrait: `${r.before}${r.match}${r.after}` })),
      });
    },
  },
];
