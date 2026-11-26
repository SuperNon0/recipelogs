import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentOrigin } from "@/lib/auth/service";
import { groupProducts, mergeProducts } from "@/lib/purchaseOrders";
import { doublonsProduits } from "@/lib/ia/rapprochement";
import { articleKey, articleOf } from "@/lib/suppliers";
import { offerKey, orderUnits, priceVerdict, qtyLabel } from "@/lib/supplierOrders";
import { createSupplierOrder, deleteSupplierOrder, listSupplierOrders, loadOrderCatalog, loadSupplierOrder } from "@/lib/supplierOrdersDb";
import { loadSoldProducts } from "@/lib/soldProducts";
import { DELETE, READ, WRITE, id, js, parseArgs, text, type McpTool } from "./helpers";

const round2 = (v: number) => Math.round(v * 100) / 100;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date au format AAAA-MM-JJ");

async function supplierId(ref: { fournisseur_id?: number; fournisseur?: string }) {
  if (ref.fournisseur_id) return ref.fournisseur_id;
  const s = ref.fournisseur
    ? await prisma.supplier.findFirst({ where: { name: { equals: ref.fournisseur.trim(), mode: "insensitive" } }, select: { id: true } })
    : null;
  if (!s) throw new Error(`fournisseur introuvable (${ref.fournisseur ?? "ni id ni nom"})`);
  return s.id;
}

const orderView = (o: NonNullable<Awaited<ReturnType<typeof loadSupplierOrder>>>) => ({
  commande_id: o.id,
  fournisseur: o.supplier,
  date: o.date,
  livraison: o.deliveryDate,
  signature: o.signature,
  remarque: o.note,
  lignes: o.lines.map((l) => ({
    quantite: qtyLabel(l.quantity, l.unit),
    produit: l.label,
    ...(l.reference ? { reference: l.reference } : {}),
    ...(l.productId == null ? { variante: "au choix du commercial" } : {}),
    ...(l.unitPrice != null ? { prix_estime_eur: round2(l.unitPrice * l.quantity) } : {}),
  })),
  total_estime_ht_eur: o.estimate,
  texte_pour_le_commercial: o.text,
  pdf: `${currentOrigin() ?? ""}/api/commandes/${o.id}/pdf`,
  page: `${currentOrigin() ?? ""}/fournisseurs/commandes/${o.id}`,
});

export const ORDER_TOOLS: McpTool[] = [
  {
    name: "passer_commande",
    title: "Passer une commande à un fournisseur",
    description:
      "Prépare et enregistre une commande chez un fournisseur (comme le bouton « Passer une commande ») : rend le texte à envoyer au commercial et l'adresse du PDF, gardés dans l'historique des commandes. " +
      "Chaque ligne : produit_id (voir voir_fournisseur), ou produit = nom exact, ou article = nom commun (« Croissant ») quand la variante est au choix du commercial ; quantite ; unite = le conditionnement du produit (carton, sac, kg…, voir voir_fournisseur → conditionnement), par défaut celui du produit. " +
      "Montre le texte à l'utilisateur avant de dire que c'est envoyé : RecipeLog n'envoie rien lui-même. " +
      "La réponse liste aussi moins_cher_ailleurs : les produits commandés qu'un autre fournisseur vend moins cher (même article, même unité de prix, dernier prix connu). Dis-le à l'utilisateur.",
    inputSchema: {
      type: "object",
      properties: {
        fournisseur_id: js.int("Id du fournisseur"),
        fournisseur: js.str("Ou son nom exact"),
        signature: js.str("Nom de l'entreprise qui signe (« Maison Chanka »). Absent : celle des réglages ; donné : devient celle des prochaines commandes"),
        livraison: js.str("Livraison souhaitée, AAAA-MM-JJ (facultatif)"),
        remarque: js.str("Ajoutée à la fin du message"),
        lignes: {
          type: "array",
          items: {
            type: "object",
            required: ["quantite"],
            properties: {
              produit_id: js.int("Id du produit"),
              produit: js.str("Ou nom exact du produit"),
              article: js.str("Ou nom commun, variante au choix du commercial"),
              quantite: js.num("Quantité"),
              unite: js.str("carton, sac, kg, pièce… (défaut : conditionnement du produit)"),
            },
          },
        },
      },
      required: ["lignes"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(
        z.object({
          fournisseur_id: id.optional(),
          fournisseur: z.string().trim().max(200).optional(),
          signature: z.string().trim().max(200).optional(),
          livraison: day.optional(),
          remarque: z.string().trim().max(2000).optional(),
          lignes: z
            .array(
              z.object({
                produit_id: id.optional(),
                produit: z.string().trim().max(300).optional(),
                article: z.string().trim().max(300).optional(),
                quantite: z.number().positive().max(100_000),
                unite: z.string().trim().max(40).optional(),
              }),
            )
            .min(1)
            .max(1000),
        }),
        args,
      );
      const sid = await supplierId(a);
      const products = await prisma.supplierProduct.findMany({
        where: { supplierId: sid },
        select: { id: true, name: true, article: true, packName: true, packSize: true, priceUnit: true },
      });
      const byId = new Map(products.map((p) => [p.id, p]));
      const byName = new Map(products.map((p) => [articleKey(p.name), p]));
      const articles = new Map(products.map((p) => [articleKey(articleOf(p)), articleOf(p)]));
      const lines = a.lignes.map((l) => {
        const p = (l.produit_id ? byId.get(l.produit_id) : undefined) ?? (l.produit ? byName.get(articleKey(l.produit)) : undefined);
        if (p) {
          const units = orderUnits({ name: p.name, packName: p.packName, packSize: p.packSize == null ? null : Number(p.packSize), priceUnit: p.priceUnit });
          return { productId: p.id, quantity: l.quantite, unit: l.unite || units[0] };
        }
        if (l.produit_id || (l.produit && !l.article)) throw new Error(`produit introuvable chez ce fournisseur : ${l.produit_id ?? l.produit}`);
        if (!l.article) throw new Error("chaque ligne a besoin de produit_id, produit ou article");
        return { productId: null, label: articles.get(articleKey(l.article)) ?? l.article, quantity: l.quantite, unit: l.unite || "colis" };
      });
      const { id: orderId } = await createSupplierOrder({ supplierId: sid, signature: a.signature, deliveryDate: a.livraison, note: a.remarque, lines });
      revalidatePath("/fournisseurs", "layout");
      // Le même article moins cher chez un autre fournisseur ?
      const catalog = await loadOrderCatalog(sid);
      const moinsCher: { produit: string; ici: string; ailleurs: string; fournisseur: string; economie: string }[] = [];
      for (const l of lines) {
        if (l.productId == null) continue;
        const p = catalog?.products.find((c) => c.id === l.productId);
        if (!p) continue;
        const v = priceVerdict(p.price, catalog!.offers[offerKey(p.article, p.priceUnit)]);
        if (v?.kind !== "cheaper") continue;
        moinsCher.push({
          produit: p.name,
          ici: `${p.price} €/${p.priceUnit}`,
          ailleurs: `${v.offer.price} €/${v.offer.unit} (${v.offer.productName}, prix du ${v.offer.date ?? "?"})`,
          fournisseur: v.offer.supplier,
          economie: `-${v.pct} %`,
        });
      }
      return text({ ...orderView((await loadSupplierOrder(orderId))!), moins_cher_ailleurs: moinsCher });
    },
  },
  {
    name: "lister_commandes",
    title: "Lister les commandes fournisseurs",
    description: "Commandes passées aux fournisseurs, de la plus récente à la plus ancienne (date, fournisseur, nombre de lignes, total estimé).",
    inputSchema: { type: "object", properties: { fournisseur_id: js.int("Seulement ce fournisseur"), nombre: js.int("Combien (50 par défaut)") } },
    annotations: READ,
    run: async (args) => {
      const a = parseArgs(z.object({ fournisseur_id: id.optional(), nombre: z.number().int().min(1).max(500).default(50) }), args);
      const list = await listSupplierOrders({ supplierId: a.fournisseur_id, take: a.nombre });
      return text({
        commandes: list.map((o) => ({ commande_id: o.id, date: o.date, fournisseur: o.supplier, livraison: o.deliveryDate, lignes: o.lines, total_estime_ht_eur: o.estimate })),
      });
    },
  },
  {
    name: "voir_commande",
    title: "Voir une commande fournisseur",
    description: "Une commande : lignes, quantités, texte pour le commercial et adresse du PDF.",
    inputSchema: { type: "object", properties: { commande_id: js.int("Id de la commande") }, required: ["commande_id"] },
    annotations: READ,
    run: async (args) => {
      const a = parseArgs(z.object({ commande_id: id }), args);
      const o = await loadSupplierOrder(a.commande_id);
      if (!o) throw new Error("commande introuvable");
      return text(orderView(o));
    },
  },
  {
    name: "supprimer_commande",
    title: "Supprimer une commande fournisseur",
    description: "Retire une commande de l'historique (les produits et les prix ne changent pas). Demande confirmation avant.",
    inputSchema: { type: "object", properties: { commande_id: js.int("Id de la commande") }, required: ["commande_id"] },
    annotations: DELETE,
    run: async (args) => {
      const a = parseArgs(z.object({ commande_id: id }), args);
      if (!(await deleteSupplierOrder(a.commande_id))) throw new Error("commande introuvable");
      revalidatePath("/fournisseurs", "layout");
      return text({ supprimee: a.commande_id });
    },
  },
  {
    name: "regrouper_produits",
    title: "Regrouper des produits en double",
    description:
      "Range plusieurs produits d'un fournisseur sous un même article (« Croissant » pour « Croissant pur beurre », « Croissant beurre », « Croissant margarine ») : une seule ligne dans la fiche, le tableau des prix et la page de commande, qui se déroule sur les variantes. Chaque produit garde son nom et ses prix. Ne regroupe que ce qui se remplace (pas des chocolats de % différents ni des farines de types différents). article vide = chacun reprend son propre nom.",
    inputSchema: {
      type: "object",
      properties: {
        fournisseur_id: js.int("Id du fournisseur"),
        produit_ids: { type: "array", items: { type: "integer" }, description: "Ids des produits à regrouper" },
        article: js.str("Nom commun (« Croissant »)"),
      },
      required: ["fournisseur_id", "produit_ids", "article"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(z.object({ fournisseur_id: id, produit_ids: z.array(id).min(1).max(2000), article: z.string().trim().max(200) }), args);
      const n = await groupProducts(a.fournisseur_id, a.produit_ids, a.article || null);
      revalidatePath("/", "layout");
      return text({ regroupes: n, article: a.article || null });
    },
  },
  {
    name: "fusionner_produits",
    title: "Fusionner des produits en double",
    description:
      "Un même produit enregistré deux fois chez un fournisseur (souvent « CREME LIQ.35%MG 1L » lu par l'IA à côté de « Crème liquide 35% MG 1 L ») devient un seul : les prix du doublon passent dans l'historique du produit gardé, à la date de leur facture ; commandes et ingrédients suivent. Sans garder_id : renvoie seulement les doublons proposés (rien n'est changé). Demande l'accord de Noë avant de fusionner. Pour des variantes (Fraise France / Espagne), utilise plutôt regrouper_produits.",
    inputSchema: {
      type: "object",
      properties: {
        fournisseur_id: js.int("Id du fournisseur"),
        garder_id: js.int("Id du produit à garder (facultatif : sans lui, liste les doublons proposés)"),
        doublon_ids: { type: "array", items: { type: "integer" }, description: "Ids des doublons à fusionner dans garder_id" },
      },
      required: ["fournisseur_id"],
    },
    annotations: DELETE,
    run: async (args) => {
      const a = parseArgs(
        z.object({ fournisseur_id: id, garder_id: id.optional(), doublon_ids: z.array(id).max(500).optional() }),
        args,
      );
      if (!a.garder_id) {
        const produits = await prisma.supplierProduct.findMany({
          where: { supplierId: a.fournisseur_id },
          select: { id: true, name: true, reference: true, priceUnit: true, _count: { select: { lines: true } } },
        });
        const groupes = doublonsProduits(produits.map((p) => ({ id: p.id, name: p.name, reference: p.reference, priceUnit: p.priceUnit, lignes: p._count.lines })));
        return text({
          doublons_proposes: groupes.map((g) => ({
            garder: { id: g.garder.id, nom: g.garder.name, prix: g.garder.lignes },
            doublons: g.doublons.map((d) => ({ id: d.id, nom: d.name, prix: d.lignes })),
          })),
        });
      }
      if (!a.doublon_ids?.length) throw new Error("donne doublon_ids");
      const r = await mergeProducts(a.fournisseur_id, a.garder_id, a.doublon_ids);
      revalidatePath("/", "layout");
      return text({ garde: r.name, fusionnes: r.merged, prix_repris: r.prices });
    },
  },
  {
    name: "produits_vendus",
    title: "Produits vendus et leur marge",
    description:
      "Les recettes cochées « Produit vendu » : coût de revient à l'unité (pièce avec un rendement, sinon recette entière), prix de vente, prix HT, marge en € et en %, coefficient, ingrédients sans prix. Aussi les recettes qui ont un prix de vente mais ne sont pas cochées. Pour cocher : modifier_recette avec produit_vendu=true.",
    inputSchema: { type: "object", properties: {} },
    annotations: READ,
    run: async () => {
      const { products, pricedNotSold } = await loadSoldProducts();
      return text({
        produits: products.map((p) => ({
          recette_id: p.id,
          nom: p.name,
          par: p.per,
          cout_eur: p.cost != null ? round2(p.cost) : null,
          prix_vente_eur: p.price,
          tva_pourcent: p.vat,
          prix_ht_eur: p.priceHT != null ? round2(p.priceHT) : null,
          marge_eur: p.margin != null ? round2(p.margin) : null,
          taux_marge_pourcent: p.rate != null ? Math.round(p.rate * 10) / 10 : null,
          coefficient: p.coef != null ? round2(p.coef) : null,
          ...(p.missing.length ? { ingredients_sans_prix: p.missing } : {}),
        })),
        avec_prix_mais_pas_coches: pricedNotSold,
      });
    },
  },
];
