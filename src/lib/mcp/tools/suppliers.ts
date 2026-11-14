import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { PRICE_UNITS } from "@/lib/cost";
import { SUPPLIER_FAMILIES, groupByArticle } from "@/lib/suppliers";
import {
  addManualPrice,
  chooseProductForIngredient,
  createProduct,
  createSupplier,
  deletePriceLine,
  deleteProduct,
  deleteSupplier,
  supplierDeletionInfo,
  updatePriceLine,
  updateProduct,
  updatePurchaseOrder,
  updateSupplier,
  deletePurchaseOrder,
  linkProductToIngredient,
  listPurchaseOrders,
  loadAllProducts,
  loadPurchaseOrder,
  loadSupplier,
  recordPurchaseOrder,
} from "@/lib/purchaseOrders";
import { attachInvoiceFile, createUploadLink, removeInvoiceFile } from "@/lib/invoiceFiles";
import { currentOrigin } from "@/lib/auth/service";
import { DELETE, READ, WRITE, id, js, parseArgs, text, type McpTool } from "./helpers";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date au format AAAA-MM-JJ");
const money = z.number().min(0).max(10_000_000);

function refresh() {
  revalidatePath("/", "layout");
}

const FAMILIES_HELP = `Familles conseillées (pour ranger le tableau comparatif) : ${SUPPLIER_FAMILIES.join(", ")}.`;

async function findBase(ref: { id?: number; nom?: string }) {
  const base = ref.id
    ? await prisma.ingredientBase.findUnique({ where: { id: ref.id }, select: { id: true, name: true } })
    : ref.nom
      ? await prisma.ingredientBase.findFirst({
          where: { name: { equals: ref.nom.trim(), mode: "insensitive" } },
          select: { id: true, name: true },
        })
      : null;
  if (!base) throw new Error(`ingrédient introuvable (${ref.id ?? ref.nom ?? "ni id ni nom"})`);
  return base;
}

const lineSchema = z.object({
  produit: z.string().trim().min(1).max(300),
  reference: z.string().trim().max(100).optional(),
  article: z.string().trim().max(200).optional(),
  famille: z.string().trim().max(80).optional(),
  quantite: z.number().positive().max(1_000_000).optional(),
  contenance: z.number().positive().max(1_000_000).optional(),
  unite_prix: z.enum(PRICE_UNITS).default("kg"),
  prix_unitaire: money.optional(),
  prix_colis: money.optional(),
  montant_ligne: money.optional(),
  ingredient: z.union([z.number().int().positive(), z.string().trim().min(1).max(200)]).optional(),
});

export const SUPPLIER_TOOLS: McpTool[] = [
  {
    name: "enregistrer_facture",
    title: "Enregistrer une facture ou un bon de commande",
    description:
      "Enregistre une facture (ou un bon de commande / bon de livraison) d'un fournisseur en une fois : le fournisseur est créé s'il n'existe pas, chaque ligne devient un produit de ce fournisseur (même ceux qui ne servent pas en recette : emballages, boissons, matériel…) et son prix est gardé dans l'historique à la DATE DE LA FACTURE. Rien n'est jamais écrasé. " +
      "LIS BIEN LE CONDITIONNEMENT de chaque ligne : dès qu'un poids ou un volume est connu, préfère un prix au kg ou au L (comparable entre fournisseurs) plutôt qu'à la pièce. Boîte de conserve (« 5/1 4,2 kg PNE 2,4 kg ») : unite_prix kg, contenance = poids net égoutté (PNE) s'il est écrit, sinon le poids net, et prix_colis = prix de la boîte. Bouteille, bidon, brique (« 700 ml », « 10 L ») : unite_prix L. Carton « x 50 », « x 250 » vendu au colis : unite_prix pièce, contenance = 50 ou 250, prix_colis = prix du carton. Garde « pièce » pour ce qui se compte (fougasse, canette, matériel). Si la réponse contient a_verifier, relis ces lignes et corrige avec remplacer=true. " +
      "Pour chaque ligne, donne le prix ramené à l'unité de prix (prix_unitaire, en € HT par kg, L ou pièce) OU le prix d'un colis (prix_colis) avec sa contenance (contenance = 25 pour un sac de 25 kg, 50 pour un carton de 50 pièces) OU le montant de la ligne avec la quantité : le serveur calcule le prix au kg / L / pièce. " +
      "produit = la désignation exacte écrite sur la facture (garde l'origine : « Fraise Espagne cat I »). article = nom commun court qui REGROUPE les variantes d'un même produit et sert à comparer entre fournisseurs : sans origine, calibre, catégorie ni taille de barquette (« Fraise », « Tomate », « Citron vert »), mais en gardant ce qui change la recette (« Chocolat noir 64 % », « Crème 35 % », « Farine T45 », « Boîte pâtissière 20 × 8 »). Réutilise TOUJOURS l'article existant, même orthographe (voir voir_fournisseur et comparer_prix_fournisseurs) : les variantes d'un article ont un seul historique de prix, et l'ingrédient des recettes relié suit le dernier prix payé pour l'article. En cas de doute entre deux articles, demande à l'utilisateur avant d'enregistrer. " +
      `${FAMILIES_HELP} ` +
      "ingredient = nom exact (ou id) d'un ingrédient des recettes auquel ce produit correspond (voir lister_ingredients) : il prend alors ce prix s'il n'avait pas encore de produit choisi. Ne crée JAMAIS d'ingrédient pour un produit qui ne sert pas en recette, et ne mets jamais les prix avec regler_fiches_ingredients. " +
      "Réponse : nouveaux produits, prix qui ont changé (avant → après), variantes_regroupees (nouvelle variante d'un article déjà acheté, avec l'évolution), ingrédients mis à jour, lignes à vérifier. À montrer à l'utilisateur. Ensuite, joins le PDF ou la photo de la facture avec joindre_fichier_facture.",
    inputSchema: {
      type: "object",
      properties: {
        fournisseur: js.str("Nom du fournisseur (Metro, Promocash, Choframa…)"),
        date: js.str("Date de la facture, AAAA-MM-JJ"),
        numero: js.str("Numéro de la facture ou du bon (évite les doublons)"),
        total: js.num("Total HT de la facture en €, s'il est écrit"),
        note: js.str("Remarque libre"),
        remplacer: js.bool("true pour remplacer une facture déjà enregistrée avec le même numéro"),
        lignes: {
          type: "array",
          description: "Une entrée par ligne de la facture",
          items: {
            type: "object",
            required: ["produit"],
            properties: {
              produit: js.str("Désignation du produit telle qu'écrite (« Guanaja 70 % fèves 3 kg »)"),
              reference: js.str("Référence / code article du fournisseur"),
              article: js.str("Nom commun pour comparer entre fournisseurs"),
              famille: js.str("Famille (Chocolat, Crèmerie et œufs, Emballages…)"),
              quantite: js.num("Nombre de colis ou d'unités achetés"),
              contenance: js.num("Contenance d'un colis dans l'unité de prix (25 pour 25 kg)"),
              unite_prix: js.enum(PRICE_UNITS, "Unité du prix : kg (défaut), L ou pièce"),
              prix_unitaire: js.num("Prix en € HT par unité de prix (par kg, L ou pièce)"),
              prix_colis: js.num("Ou prix d'un colis en € HT"),
              montant_ligne: js.num("Montant HT de la ligne en €"),
              ingredient: { type: ["string", "integer"], description: "Ingrédient des recettes correspondant (nom exact ou id), facultatif" },
            },
          },
        },
      },
      required: ["fournisseur", "date", "lignes"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(
        z.object({
          fournisseur: z.string().trim().min(1).max(200),
          date: day,
          numero: z.string().trim().max(100).optional(),
          total: money.optional(),
          note: z.string().trim().max(2000).optional(),
          remplacer: z.boolean().default(false),
          lignes: z.array(lineSchema).min(1).max(500),
        }),
        args,
      );
      const summary = await recordPurchaseOrder({
        supplier: a.fournisseur,
        date: a.date,
        number: a.numero,
        total: a.total,
        note: a.note,
        replace: a.remplacer,
        lines: a.lignes.map((l) => ({
          product: l.produit,
          reference: l.reference,
          article: l.article,
          family: l.famille,
          quantity: l.quantite,
          packSize: l.contenance,
          unit: l.unite_prix,
          unitPrice: l.prix_unitaire,
          packPrice: l.prix_colis,
          lineTotal: l.montant_ligne,
          ingredient: l.ingredient,
        })),
      });
      refresh();
      return text({ ...summary, voir: `/factures/${summary.facture_id}` });
    },
  },

  {
    name: "joindre_fichier_facture",
    title: "Joindre le PDF ou la photo d'une facture",
    description:
      "Joint le PDF (ou la photo) d'une facture enregistrée, pour le voir sur sa page (remplace l'ancien fichier). " +
      "Si tu as le contenu du fichier, passe-le en base64 dans fichier_base64. Sinon, l'outil renvoie un lien d'envoi à usage unique (30 min) : " +
      "envoie le fichier dessus (curl -T facture.pdf <lien>) si tu peux lancer des commandes, ou donne à l'utilisateur le lien de la page de la facture pour qu'il touche « Joindre un PDF ».",
    inputSchema: {
      type: "object",
      properties: {
        facture_id: js.int("Id de la facture"),
        fichier_base64: js.str("Contenu du PDF ou de la photo en base64 (facultatif)"),
      },
      required: ["facture_id"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(z.object({ facture_id: id, fichier_base64: z.string().trim().min(1).optional() }), args);
      const order = await prisma.purchaseOrder.findUnique({ where: { id: a.facture_id }, select: { id: true } });
      if (!order) throw new Error("facture introuvable");
      const origin = currentOrigin() ?? "";
      const page = `${origin}/factures/${order.id}`;
      if (a.fichier_base64) {
        const b64 = a.fichier_base64.replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
        const { type } = await attachInvoiceFile(order.id, Buffer.from(b64, "base64"));
        refresh();
        return text({ ok: true, facture_id: order.id, fichier: type, voir: page });
      }
      const { token, expires } = createUploadLink(order.id);
      return text({
        facture_id: order.id,
        lien_envoi: `${origin}/api/mcp/fichier/${token}`,
        exemple: `curl -sS -T facture.pdf ${origin}/api/mcp/fichier/${token}`,
        expire_a: expires.toISOString(),
        page_facture: page,
        a_dire_a_l_utilisateur: `Pour joindre le fichier toi-même : ouvre ${page} puis « Joindre un PDF ».`,
      });
    },
  },

  {
    name: "comparer_prix_fournisseurs",
    title: "Comparer les prix des fournisseurs",
    description:
      "Tous les produits achetés, regroupés par article et par famille, avec pour chaque fournisseur le dernier prix payé (€ par kg, L ou pièce), sa date, l'évolution depuis la facture précédente et le prix moyen. Sert aussi à connaître les articles et familles déjà utilisés avant enregistrer_facture.",
    inputSchema: {
      type: "object",
      properties: { recherche: js.str("Texte contenu dans l'article ou le produit (sans casse)") },
    },
    annotations: READ,
    run: async (args) => {
      const { recherche } = parseArgs(z.object({ recherche: z.string().trim().optional() }), args);
      const { suppliers, products } = await loadAllProducts();
      const needle = recherche?.toLowerCase();
      const names = new Map(suppliers.map((s) => [s.id, s.name]));
      const rows = products
        .filter((p) => !needle || p.name.toLowerCase().includes(needle) || (p.article ?? "").toLowerCase().includes(needle))
        .map((p) => ({
          produit_id: p.id,
          fournisseur: names.get(p.supplierId),
          produit: p.name,
          article: p.article,
          famille: p.family,
          colis: p.packLabel,
          prix: p.stats ? `${p.stats.current} €/${p.stats.unit}` : null,
          date: p.stats?.date ?? null,
          evolution: p.stats?.changePct != null ? `${p.stats.changePct > 0 ? "+" : ""}${p.stats.changePct} %` : null,
          moyenne: p.stats ? `${p.stats.average} €/${p.stats.unit}` : null,
          factures: p.stats?.count ?? 0,
          ingredient: p.base ? { id: p.base.id, nom: p.base.name, prix_utilise: p.base.chosen } : null,
        }));
      return text({ fournisseurs: suppliers, produits: rows });
    },
  },

  {
    name: "voir_fournisseur",
    title: "Voir un fournisseur",
    description: "Produits d'un fournisseur (dernier prix, évolution, moyenne, ingrédient relié) et ses factures.",
    inputSchema: {
      type: "object",
      properties: { id: js.int("Id du fournisseur"), nom: js.str("Ou son nom") },
    },
    annotations: READ,
    run: async (args) => {
      const a = parseArgs(z.object({ id: id.optional(), nom: z.string().trim().optional() }), args);
      const sid =
        a.id ??
        (a.nom
          ? (await prisma.supplier.findFirst({ where: { name: { equals: a.nom, mode: "insensitive" } }, select: { id: true } }))?.id
          : undefined);
      const s = sid ? await loadSupplier(sid) : null;
      if (!s) throw new Error("fournisseur introuvable");
      return text({
        id: s.id,
        nom: s.name,
        produits: s.products.map((p) => ({
          produit_id: p.id,
          produit: p.name,
          article: p.article,
          famille: p.family,
          prix: p.stats ? `${p.stats.current} €/${p.stats.unit}` : null,
          date: p.stats?.date,
          evolution: p.stats?.changePct,
          moyenne: p.stats?.average,
          ingredient: p.base?.name ?? null,
        })),
        articles_regroupes: groupByArticle(s.products)
          .filter((g) => g.products.length > 1)
          .map((g) => ({
            article: g.article,
            variantes: g.products.map((x) => x.name),
            dernier_prix: g.stats ? `${g.stats.current} €/${g.stats.unit}` : null,
            evolution: g.stats?.changePct,
            moyenne: g.stats?.average,
          })),
        factures: s.orders,
      });
    },
  },

  {
    name: "lister_factures",
    title: "Lister les factures",
    description: "Factures enregistrées, de la plus récente à la plus ancienne, avec filtre de période (du… au…) et de fournisseur.",
    inputSchema: {
      type: "object",
      properties: {
        du: js.str("Depuis cette date, AAAA-MM-JJ"),
        au: js.str("Jusqu'à cette date, AAAA-MM-JJ"),
        fournisseur_id: js.int("Seulement ce fournisseur"),
      },
    },
    annotations: READ,
    run: async (args) => {
      const a = parseArgs(z.object({ du: day.optional(), au: day.optional(), fournisseur_id: id.optional() }), args);
      const orders = await listPurchaseOrders({ from: a.du, to: a.au, supplierId: a.fournisseur_id });
      const total = orders.reduce((s, o) => s + (o.total ?? 0), 0);
      return text({ nombre: orders.length, total: Math.round(total * 100) / 100, factures: orders });
    },
  },

  {
    name: "voir_facture",
    title: "Voir une facture",
    description: "Le détail d'une facture : fournisseur, date, numéro, total et toutes ses lignes.",
    inputSchema: { type: "object", properties: { id: js.int("Id de la facture") }, required: ["id"] },
    annotations: READ,
    run: async (args) => {
      const a = parseArgs(z.object({ id }), args);
      const o = await loadPurchaseOrder(a.id);
      if (!o) throw new Error("facture introuvable");
      return text(o);
    },
  },

  {
    name: "historique_prix",
    title: "Historique des prix d'un article",
    description:
      "Tous les prix payés pour un produit ET les autres variantes du même article chez ce fournisseur (« Fraise France », « Fraise Espagne » rangées sous « Fraise »), du plus récent au plus ancien, avec la désignation et la facture de chacun. Filtre de période possible. seul_produit=true pour ne voir que ce produit.",
    inputSchema: {
      type: "object",
      properties: {
        produit_id: js.int("Id du produit (voir comparer_prix_fournisseurs)"),
        du: js.str("Depuis, AAAA-MM-JJ"),
        au: js.str("Jusqu'à, AAAA-MM-JJ"),
        seul_produit: js.bool("true = sans les autres variantes de l'article"),
      },
      required: ["produit_id"],
    },
    annotations: READ,
    run: async (args) => {
      const a = parseArgs(
        z.object({ produit_id: id, du: day.optional(), au: day.optional(), seul_produit: z.boolean().optional() }),
        args,
      );
      const { products, suppliers } = await loadAllProducts();
      const p = products.find((x) => x.id === a.produit_id);
      if (!p) throw new Error("produit introuvable");
      const groups = groupByArticle(products.filter((x) => x.supplierId === p.supplierId));
      const group = a.seul_produit ? groupByArticle([p])[0] : groups.find((g) => g.products.some((x) => x.id === p.id))!;
      const history = group.history.filter((h) => (!a.du || h.date >= a.du) && (!a.au || h.date <= a.au));
      return text({
        article: group.article,
        variantes: group.products.map((x) => ({ produit_id: x.id, produit: x.name })),
        fournisseur: suppliers.find((s) => s.id === p.supplierId)?.name,
        dernier_prix: group.stats ? `${group.stats.current} €/${group.stats.unit}` : null,
        evolution: group.stats?.changePct != null ? `${group.stats.changePct > 0 ? "+" : ""}${group.stats.changePct} %` : null,
        moyenne: group.stats?.average,
        prix: history.map((h) => ({
          date: h.date,
          produit: h.productName,
          prix: `${h.price} €/${h.unit}`,
          ligne_id: h.lineId,
          ...(h.manual ? { saisi_a_la_main: true } : { facture_id: h.orderId, numero: h.number }),
        })),
      });
    },
  },

  {
    name: "ranger_produits",
    title: "Ranger les produits des fournisseurs",
    description: `Change, pour un ou plusieurs produits, l'article (nom commun pour comparer entre fournisseurs) et la famille du tableau comparatif. ${FAMILIES_HELP}`,
    inputSchema: {
      type: "object",
      properties: {
        produits: {
          type: "array",
          items: {
            type: "object",
            required: ["produit_id"],
            properties: {
              produit_id: js.int("Id du produit"),
              article: js.str("Nom commun (vide pour reprendre le nom du produit)"),
              famille: js.str("Famille"),
            },
          },
        },
      },
      required: ["produits"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(
        z.object({
          produits: z
            .array(z.object({ produit_id: id, article: z.string().trim().max(200).optional(), famille: z.string().trim().max(80).optional() }))
            .min(1)
            .max(500),
        }),
        args,
      );
      let n = 0;
      for (const p of a.produits) {
        const r = await prisma.supplierProduct.updateMany({
          where: { id: p.produit_id },
          data: {
            ...(p.article !== undefined ? { article: p.article || null } : {}),
            ...(p.famille !== undefined ? { family: p.famille || null } : {}),
          },
        });
        n += r.count;
      }
      refresh();
      return text({ modifies: n });
    },
  },

  {
    name: "relier_produit_ingredient",
    title: "Relier un produit à un ingrédient",
    description:
      "Relie un produit acheté à un ingrédient des recettes (ou le détache avec ingredient_id = null et sans nom). utiliser_ce_prix = true : l'ingrédient prend le prix de ce produit dans le coût de toutes les recettes (et le suit aux prochaines factures). Un ingrédient peut avoir plusieurs produits reliés (plusieurs chocolats, plusieurs fournisseurs), un seul est utilisé.",
    inputSchema: {
      type: "object",
      properties: {
        produit_id: js.int("Id du produit"),
        ingredient_id: { type: ["integer", "null"], description: "Id de l'ingrédient (null pour détacher)" },
        ingredient_nom: js.str("Ou nom exact de l'ingrédient"),
        utiliser_ce_prix: js.bool("true pour que l'ingrédient utilise ce prix"),
      },
      required: ["produit_id"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(
        z.object({
          produit_id: id,
          ingredient_id: id.nullable().optional(),
          ingredient_nom: z.string().trim().min(1).optional(),
          utiliser_ce_prix: z.boolean().default(false),
        }),
        args,
      );
      if (a.ingredient_id === null || (a.ingredient_id === undefined && !a.ingredient_nom)) {
        await linkProductToIngredient(a.produit_id, null);
        refresh();
        return text({ detache: true });
      }
      const base = await findBase({ id: a.ingredient_id ?? undefined, nom: a.ingredient_nom });
      if (a.utiliser_ce_prix) await chooseProductForIngredient(base.id, a.produit_id);
      else await linkProductToIngredient(a.produit_id, base.id);
      const after = await prisma.ingredientBase.findUnique({
        where: { id: base.id },
        select: { price: true, priceUnit: true, chosenProductId: true },
      });
      refresh();
      return text({
        ingredient: base.name,
        produit_id: a.produit_id,
        prix_utilise: after?.chosenProductId === a.produit_id,
        prix_ingredient: after?.price != null ? `${Number(after.price)} €/${after.priceUnit}` : null,
      });
    },
  },

  {
    name: "supprimer_facture",
    title: "Supprimer une facture",
    description:
      "Supprime une facture et ses lignes. Les produits qui ne sont sur aucune autre facture sont retirés, les autres reprennent le prix de leur facture la plus récente. Demande confirmation avant.",
    inputSchema: { type: "object", properties: { id: js.int("Id de la facture") }, required: ["id"] },
    annotations: DELETE,
    run: async (args) => {
      const a = parseArgs(z.object({ id }), args);
      const { filePath } = await deletePurchaseOrder(a.id);
      await removeInvoiceFile(filePath);
      refresh();
      return text({ supprimee: a.id });
    },
  },

  // ── Gérer à la main : fournisseurs, produits, prix, factures ──

  {
    name: "creer_fournisseur",
    title: "Créer un fournisseur",
    description:
      "Crée un fournisseur vide (sans facture). Inutile avant enregistrer_facture, qui crée le fournisseur tout seul. Ensuite : ajouter_produit_fournisseur pour lui ajouter des produits et leurs prix.",
    inputSchema: {
      type: "object",
      properties: { nom: js.str("Nom du fournisseur"), note: js.str("Remarque libre (jour de livraison, contact…)") },
      required: ["nom"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(z.object({ nom: z.string().trim().min(1).max(120), note: z.string().max(2000).optional() }), args);
      const s = await createSupplier({ name: a.nom, note: a.note });
      refresh();
      return text({ fournisseur_id: s.id, nom: s.name });
    },
  },

  {
    name: "modifier_fournisseur",
    title: "Renommer ou modifier un fournisseur",
    description:
      "Renomme un fournisseur et / ou change sa remarque. Ses produits, ses prix et ses factures restent. Refusé si un autre fournisseur porte déjà ce nom (pour réunir deux fournisseurs, demande à l'utilisateur).",
    inputSchema: {
      type: "object",
      properties: {
        id: js.int("Id du fournisseur (voir comparer_prix_fournisseurs)"),
        nom: js.str("Nouveau nom"),
        note: js.str("Nouvelle remarque (texte vide pour l'effacer)"),
      },
      required: ["id"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(
        z.object({ id, nom: z.string().trim().min(1).max(120).optional(), note: z.string().max(2000).optional() }),
        args,
      );
      if (a.nom === undefined && a.note === undefined) throw new Error("rien à changer : donne nom ou note");
      const s = await updateSupplier(a.id, { name: a.nom, note: a.note });
      refresh();
      return text({ fournisseur_id: s.id, nom: s.name, note: s.note });
    },
  },

  {
    name: "supprimer_fournisseur",
    title: "Supprimer un fournisseur",
    description:
      "Supprime un fournisseur avec TOUS ses produits, ses prix et ses factures (et leurs fichiers joints). Les ingrédients des recettes qui prenaient leur prix chez lui gardent leur dernier prix. Irréversible : appelle d'abord sans confirmer=true pour voir ce qui part, montre-le à l'utilisateur et demande-lui confirmation, puis rappelle avec confirmer=true.",
    inputSchema: {
      type: "object",
      properties: {
        id: js.int("Id du fournisseur"),
        confirmer: js.bool("true pour supprimer vraiment (après l'accord de l'utilisateur)"),
      },
      required: ["id"],
    },
    annotations: DELETE,
    run: async (args) => {
      const a = parseArgs(z.object({ id, confirmer: z.boolean().optional() }), args);
      const info = await supplierDeletionInfo(a.id);
      if (!info) throw new Error("fournisseur introuvable");
      const resume = {
        fournisseur: info.name,
        produits: info.products,
        factures: info.invoices,
        fichiers_joints: info.files,
        prix_tapes_a_la_main: info.manualPrices,
        ingredients_qui_gardent_leur_dernier_prix: info.ingredients,
      };
      if (!a.confirmer) return text({ a_confirmer: true, ...resume, message: "Rien n'est supprimé. Demande confirmation, puis rappelle avec confirmer=true." });
      const { filePaths } = await deleteSupplier(a.id);
      for (const f of filePaths) await removeInvoiceFile(f);
      refresh();
      return text({ supprime: true, ...resume });
    },
  },

  {
    name: "ajouter_produit_fournisseur",
    title: "Ajouter un produit à un fournisseur",
    description:
      "Ajoute à la main un produit chez un fournisseur (sans facture), avec son premier prix si on le connaît. Pour une facture, utilise plutôt enregistrer_facture. Réutilise l'article existant (même orthographe) pour regrouper les variantes. " +
      FAMILIES_HELP,
    inputSchema: {
      type: "object",
      properties: {
        fournisseur_id: js.int("Id du fournisseur"),
        produit: js.str("Nom du produit (désignation exacte)"),
        article: js.str("Nom commun pour comparer et regrouper les variantes"),
        famille: js.str("Famille du tableau comparatif"),
        unite_prix: js.enum(PRICE_UNITS, "Unité du prix : kg, L ou pièce (défaut kg)"),
        contenance: js.num("Contenance d'un colis dans l'unité (25 pour un sac de 25 kg)"),
        reference: js.str("Code article du fournisseur"),
        prix: js.num("Premier prix, en € HT par unité de prix"),
        date: js.str("Date de ce prix, AAAA-MM-JJ (défaut : aujourd'hui)"),
      },
      required: ["fournisseur_id", "produit"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(
        z.object({
          fournisseur_id: id,
          produit: z.string().trim().min(1).max(300),
          article: z.string().trim().max(200).optional(),
          famille: z.string().trim().max(80).optional(),
          unite_prix: z.enum(PRICE_UNITS).default("kg"),
          contenance: z.number().positive().max(1_000_000).optional(),
          reference: z.string().trim().max(100).optional(),
          prix: money.optional(),
          date: day.optional(),
        }),
        args,
      );
      const p = await createProduct(a.fournisseur_id, {
        name: a.produit,
        article: a.article,
        family: a.famille,
        unit: a.unite_prix,
        packSize: a.contenance,
        reference: a.reference,
        price: a.prix,
        date: a.date,
      });
      refresh();
      return text({ produit_id: p.id, produit: p.name });
    },
  },

  {
    name: "modifier_produit_fournisseur",
    title: "Modifier un produit d'un fournisseur",
    description:
      "Corrige un produit : nom, référence, article (nom pour comparer), famille, contenance d'un colis, et unité de prix tant qu'il n'a aucun prix. Ses prix restent. Pour un prix faux, utilise corriger_prix.",
    inputSchema: {
      type: "object",
      properties: {
        produit_id: js.int("Id du produit"),
        produit: js.str("Nouveau nom"),
        article: js.str("Nom pour comparer (texte vide = le nom du produit)"),
        famille: js.str("Famille"),
        unite_prix: js.enum(PRICE_UNITS, "kg, L ou pièce (seulement si le produit n'a pas encore de prix)"),
        contenance: js.num("Contenance d'un colis (0 pour l'effacer)"),
        reference: js.str("Référence (texte vide pour l'effacer)"),
      },
      required: ["produit_id"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(
        z.object({
          produit_id: id,
          produit: z.string().trim().min(1).max(300).optional(),
          article: z.string().max(200).optional(),
          famille: z.string().max(80).optional(),
          unite_prix: z.enum(PRICE_UNITS).optional(),
          contenance: z.number().min(0).max(1_000_000).optional(),
          reference: z.string().max(100).optional(),
        }),
        args,
      );
      await updateProduct(a.produit_id, {
        name: a.produit,
        article: a.article,
        family: a.famille,
        unit: a.unite_prix,
        packSize: a.contenance === undefined ? undefined : a.contenance || null,
        reference: a.reference,
      });
      refresh();
      return text({ modifie: a.produit_id });
    },
  },

  {
    name: "supprimer_produit_fournisseur",
    title: "Supprimer un produit d'un fournisseur",
    description:
      "Supprime un produit et tous ses prix ; il est aussi retiré des factures où il apparaît (leur total écrit ne change pas). L'ingrédient qui suivait ce prix garde son dernier prix. Demande confirmation avant.",
    inputSchema: { type: "object", properties: { produit_id: js.int("Id du produit") }, required: ["produit_id"] },
    annotations: DELETE,
    run: async (args) => {
      const a = parseArgs(z.object({ produit_id: id }), args);
      const r = await deleteProduct(a.produit_id);
      refresh();
      return text({ supprime: r.name, retire_de_factures: r.invoices });
    },
  },

  {
    name: "ajouter_prix",
    title: "Ajouter un prix à la main",
    description:
      "Ajoute un prix à un produit à une date, sans facture (tarif annoncé, prix au téléphone…). Il entre dans l'historique et devient le prix actuel s'il est le plus récent. Pour une vraie facture, utilise enregistrer_facture.",
    inputSchema: {
      type: "object",
      properties: {
        produit_id: js.int("Id du produit"),
        prix: js.num("Prix en € HT par unité de prix du produit (kg, L ou pièce)"),
        date: js.str("Date du prix, AAAA-MM-JJ (défaut : aujourd'hui)"),
        quantite: js.num("Nombre de colis achetés (facultatif)"),
      },
      required: ["produit_id", "prix"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(
        z.object({ produit_id: id, prix: money, date: day.optional(), quantite: z.number().positive().max(1_000_000).optional() }),
        args,
      );
      const o = await addManualPrice(a.produit_id, {
        price: a.prix,
        date: a.date ?? new Date().toISOString().slice(0, 10),
        quantity: a.quantite,
      });
      refresh();
      return text({ ajoute: true, produit_id: a.produit_id, saisie_id: o.id });
    },
  },

  {
    name: "corriger_prix",
    title: "Corriger un prix de l'historique",
    description:
      "Corrige un prix (une ligne de facture ou un prix tapé à la main) : prix par unité, quantité, et date si c'est un prix tapé à la main (la date d'une facture se change avec modifier_facture). ligne_id vient de historique_prix ou de voir_facture (lignes[].id). Le prix actuel du produit et des ingrédients qui le suivent est recalculé.",
    inputSchema: {
      type: "object",
      properties: {
        ligne_id: js.int("Id de la ligne (historique_prix → ligne_id, voir_facture → lignes[].id)"),
        prix: js.num("Bon prix en € HT par unité de prix"),
        quantite: js.num("Nombre de colis achetés"),
        date: js.str("Nouvelle date, AAAA-MM-JJ (prix tapé à la main seulement)"),
      },
      required: ["ligne_id"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(
        z.object({ ligne_id: id, prix: money.optional(), quantite: z.number().positive().max(1_000_000).optional(), date: day.optional() }),
        args,
      );
      await updatePriceLine(a.ligne_id, { price: a.prix, quantity: a.quantite, date: a.date });
      refresh();
      return text({ corrige: a.ligne_id });
    },
  },

  {
    name: "supprimer_prix",
    title: "Supprimer un prix de l'historique",
    description:
      "Retire un prix de l'historique (ligne de facture ou prix tapé à la main). Le produit reste avec ses autres prix. Demande confirmation avant.",
    inputSchema: { type: "object", properties: { ligne_id: js.int("Id de la ligne") }, required: ["ligne_id"] },
    annotations: DELETE,
    run: async (args) => {
      const a = parseArgs(z.object({ ligne_id: id }), args);
      await deletePriceLine(a.ligne_id);
      refresh();
      return text({ supprime: a.ligne_id });
    },
  },

  {
    name: "modifier_facture",
    title: "Modifier une facture",
    description:
      "Corrige la date, le numéro, le total HT ou la remarque d'une facture enregistrée. Changer la date déplace tous ses prix dans l'historique. Pour une ligne, utilise corriger_prix ou supprimer_prix.",
    inputSchema: {
      type: "object",
      properties: {
        id: js.int("Id de la facture"),
        date: js.str("AAAA-MM-JJ"),
        numero: js.str("Numéro (texte vide pour l'effacer)"),
        total: js.num("Total HT en €"),
        note: js.str("Remarque (texte vide pour l'effacer)"),
      },
      required: ["id"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(
        z.object({ id, date: day.optional(), numero: z.string().max(100).optional(), total: money.optional(), note: z.string().max(2000).optional() }),
        args,
      );
      await updatePurchaseOrder(a.id, { date: a.date, number: a.numero, total: a.total, note: a.note });
      refresh();
      return text({ modifiee: a.id });
    },
  },
];
