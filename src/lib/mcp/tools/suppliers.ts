import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { PRICE_UNITS } from "@/lib/cost";
import { SUPPLIER_FAMILIES, articleKey, groupByArticle } from "@/lib/suppliers";
import { packNameOf } from "@/lib/supplierOrders";
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
import { deletePendingInvoice, finishPendingInvoice, getPendingInvoice, listPendingInvoices, readPendingPage } from "@/lib/pendingInvoices";
import { DELETE, READ, WRITE, id, js, parseArgs, text, type McpTool } from "./helpers";
import { JOURS, jourDepuisTexte } from "@/lib/orderDays";
import type { McpToolResult } from "../protocol";
import { texteDuPdf } from "@/lib/pdfTexte";

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
  conditionnement: z.string().trim().max(40).optional(),
});


const toLine = (l: z.infer<typeof lineSchema>) => ({
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
  packName: l.conditionnement,
});

// Jours de commande / de livraison et numéros à appeler (creer_fournisseur, modifier_fournisseur).
const JOURS_JS = (description: string) => ({ type: "array", items: { type: "string" }, description });
const CONTACTS_JS = {
  type: "array",
  description: "Numéros à appeler (remplacent tous les anciens ; liste vide pour les effacer)",
  items: { type: "object", properties: { nom: js.str("Qui répond (Commercial, Standard…)"), tel: js.str("Numéro de téléphone") }, required: ["tel"] },
};
const joursZ = z
  .array(z.union([z.string(), z.number()]))
  .max(7)
  .transform((l, ctx) => {
    const out: number[] = [];
    for (const j of l) {
      const n = typeof j === "number" ? j : jourDepuisTexte(j);
      if (!n || n < 1 || n > 7) {
        ctx.addIssue({ code: "custom", message: `jour inconnu : ${j} (lundi … dimanche)` });
        return z.NEVER;
      }
      out.push(n);
    }
    return out;
  });
const contactsZ = z.array(z.object({ nom: z.string().max(80).optional(), tel: z.string().max(40) })).max(10);
const joursSortie = (s: { orderDays: number[]; deliveryDays: number[]; contacts: { nom: string; tel: string }[] }) => ({
  ...(s.orderDays.length ? { jours_commande: s.orderDays.map((n) => JOURS[n - 1].nom) } : {}),
  ...(s.deliveryDays.length ? { jours_livraison: s.deliveryDays.map((n) => JOURS[n - 1].nom) } : {}),
  ...(s.contacts.length ? { contacts: s.contacts } : {}),
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
      "Réponse : nouveaux produits, prix qui ont changé (avant → après), variantes_regroupees (nouvelle variante d'un article déjà acheté, avec l'évolution), ingrédients mis à jour, lignes à vérifier. À montrer à l'utilisateur. Ensuite, joins le PDF ou la photo de la facture avec joindre_fichier_facture. " +
      "Facture prise en photo sur le site (voir lister_factures_a_traiter) : passe son id dans facture_a_traiter_id, ses photos sont alors jointes toutes seules et elle quitte la liste « À traiter ».",
    inputSchema: {
      type: "object",
      properties: {
        fournisseur: js.str("Nom du fournisseur (Metro, Promocash, Choframa…)"),
        date: js.str("Date de la facture, AAAA-MM-JJ"),
        numero: js.str("Numéro de la facture ou du bon (évite les doublons)"),
        total: js.num("Total HT de la facture en €, s'il est écrit"),
        note: js.str("Remarque libre"),
        remplacer: js.bool("true pour remplacer une facture déjà enregistrée avec le même numéro"),
        facture_a_traiter_id: js.int("Id d'une facture « à traiter » (lister_factures_a_traiter) : ses photos sont jointes et elle sort de la liste"),
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
              conditionnement: js.str("Ce qu'on commande : carton, sac, seau, kg… (facultatif)"),
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
          facture_a_traiter_id: id.optional(),
          lignes: z.array(lineSchema).min(1).max(500),
        }),
        args,
      );
      if (a.facture_a_traiter_id) {
        const att = await getPendingInvoice(a.facture_a_traiter_id);
        if (!att) throw new Error(`facture à traiter ${a.facture_a_traiter_id} introuvable (déjà enregistrée ou supprimée ? voir lister_factures_a_traiter)`);
        if (att.kind === "mercuriale") {
          throw new Error(`le document à traiter ${att.id} est une mercuriale${att.supplierName ? ` de ${att.supplierName}` : ""} : enregistre-la avec enregistrer_mercuriale`);
        }
      }
      const summary = await recordPurchaseOrder({
        supplier: a.fournisseur,
        date: a.date,
        number: a.numero,
        total: a.total,
        note: a.note,
        replace: a.remplacer,
        lines: a.lignes.map(toLine),
      });
      const photosJointes = a.facture_a_traiter_id ? await finishPendingInvoice(a.facture_a_traiter_id, summary.facture_id) : undefined;
      refresh();
      return text({
        ...summary,
        voir: `/factures/${summary.facture_id}`,
        ...(photosJointes === undefined
          ? {}
          : { photos_jointes: photosJointes, ...(photosJointes ? {} : { a_faire: "les photos n'ont pas pu être jointes : la facture reste dans « À traiter », supprime-la une fois vérifiée" }) }),
      });
    },
  },

  {
    name: "enregistrer_mercuriale",
    title: "Enregistrer une mercuriale (liste de prix)",
    description:
      "Enregistre une mercuriale (liste de prix, offre de prix, tarif d'un fournisseur) : chaque produit est créé ou retrouvé chez ce fournisseur et son prix entre dans l'historique à la DATE indiquée, sans compter comme une facture (pas de quantité, pas de total). " +
      "Mêmes règles que enregistrer_facture pour chaque ligne : produit = désignation exacte, article = nom commun qui REGROUPE les variantes (réutilise TOUJOURS l'article existant, voir comparer_prix_fournisseurs), unite_prix, contenance et prix_colis bien lus (un sac de 25 kg à 23 € : contenance 25, prix_colis 23). " +
      "Pour les variantes d'un même produit (« Croissant pur beurre », « Croissant beurre », « Croissant margarine ») : un produit par ligne, avec le même article (« Croissant ») s'ils s'utilisent de la même façon. " +
      "Longue mercuriale (plusieurs pages, des centaines de produits) : envoie-la en plusieurs appels, par exemple une ou deux pages à la fois, avec le même nom et partie = 1, 2, 3… Renvoyer une partie déjà envoyée la remplace (pas de doublon). " +
      "N'oublie AUCUN produit : à la fin, compare le nombre de produits enregistrés au nombre de lignes du document et dis-le à l'utilisateur. " +
      "Réponse : nombre de lignes, nouveaux produits, prix qui ont changé (avant → après), lignes à vérifier ou ignorées. Si elle vient de « À traiter » (facture_a_traiter_id), le fichier est joint et elle quitte la liste avec la dernière partie (derniere_partie=true).",
    inputSchema: {
      type: "object",
      properties: {
        fournisseur: js.str("Nom du fournisseur (créé s'il n'existe pas)"),
        date: js.str("Date à partir de laquelle ces prix valent, AAAA-MM-JJ"),
        nom: js.str("Nom de la mercuriale, le même pour toutes les parties (« Mercuriale novembre 2026 »)"),
        partie: js.int("Numéro de la partie (1, 2, 3…) pour une longue mercuriale envoyée en plusieurs fois"),
        derniere_partie: js.bool("true pour la dernière partie (ou l'unique) : le fichier « à traiter » est alors joint et sort de la liste"),
        facture_a_traiter_id: js.int("Id du document « à traiter » d'où vient la mercuriale (lister_factures_a_traiter)"),
        lignes: {
          type: "array",
          description: "Un produit par entrée (400 au plus par appel)",
          items: {
            type: "object",
            required: ["produit"],
            properties: {
              produit: js.str("Désignation telle qu'écrite (« Croissant pur beurre 60 g x 70 »)"),
              reference: js.str("Code article du fournisseur"),
              article: js.str("Nom commun qui regroupe les variantes (« Croissant »)"),
              famille: js.str("Famille (Viennoiserie, Chocolat, Crèmerie et œufs…)"),
              contenance: js.num("Contenance d'un colis dans l'unité de prix (70 pour un carton de 70 pièces, 25 pour 25 kg)"),
              unite_prix: js.enum(PRICE_UNITS, "Unité du prix : kg (défaut), L ou pièce"),
              prix_unitaire: js.num("Prix en € HT par kg, L ou pièce"),
              prix_colis: js.num("Ou prix d'un colis (carton, sac, bidon) en € HT"),
              conditionnement: js.str("Ce qu'on commande : carton, sac, seau, kg… (bouton de « Passer une commande », facultatif)"),
              ingredient: { type: ["string", "integer"], description: "Ingrédient des recettes correspondant (nom exact ou id), facultatif" },
            },
          },
        },
      },
      required: ["fournisseur", "date", "nom", "lignes"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(
        z.object({
          fournisseur: z.string().trim().min(1).max(200),
          date: day,
          nom: z.string().trim().min(1).max(120),
          partie: z.number().int().min(1).max(100).optional(),
          derniere_partie: z.boolean().default(true),
          facture_a_traiter_id: id.optional(),
          lignes: z.array(lineSchema.omit({ quantite: true, montant_ligne: true })).min(1).max(400),
        }),
        args,
      );
      if (a.facture_a_traiter_id && !(await getPendingInvoice(a.facture_a_traiter_id))) {
        throw new Error(`document à traiter ${a.facture_a_traiter_id} introuvable (déjà enregistré ou supprimé ? voir lister_factures_a_traiter)`);
      }
      const nom = a.nom.replace(/^mercuriale\s+/i, "");
      const summary = await recordPurchaseOrder({
        supplier: a.fournisseur,
        date: a.date,
        manual: true,
        keepFamily: true,
        // La note distingue chaque partie : renvoyer une partie la remplace, sans toucher aux autres.
        note: `Mercuriale importée (${nom}${a.partie ? `, partie ${a.partie}` : ""})`,
        lines: a.lignes.map((l) => ({
          product: l.produit,
          reference: l.reference,
          article: l.article,
          family: l.famille,
          packSize: l.contenance,
          unit: l.unite_prix,
          unitPrice: l.prix_unitaire,
          packPrice: l.prix_colis,
          ingredient: l.ingredient,
          packName: l.conditionnement,
        })),
      });
      const joint = a.facture_a_traiter_id && a.derniere_partie ? await finishPendingInvoice(a.facture_a_traiter_id, summary.facture_id) : undefined;
      refresh();
      const { facture_id, total: _total, ...reste } = summary;
      return text({
        mercuriale_id: facture_id,
        partie: a.partie ?? 1,
        lignes_envoyees: a.lignes.length,
        ...reste,
        voir: `/fournisseurs/${(await prisma.supplier.findFirst({ where: { name: { equals: summary.fournisseur, mode: "insensitive" } }, select: { id: true } }))?.id ?? ""}`,
        ...(joint === undefined ? {} : { fichier_joint: joint }),
      });
    },
  },

  {
    name: "lister_factures_a_traiter",
    title: "Lister les factures et mercuriales à traiter",
    description:
      "Documents déposés sur le site et pas encore enregistrés : factures (bouton « Nouvelle facture ») et mercuriales (fiche d'un fournisseur → « Importer une mercuriale » → « Enregistrer pour Claude »). " +
      "Pour chacun : id, type (facture ou mercuriale), fournisseur (mercuriale), date d'ajout, nombre de pages, remarque, qui l'a ajouté, erreur de la dernière lecture par IA. " +
      "Quand l'utilisateur dit « analyse ma mercuriale », c'est ici qu'elle se trouve (type=mercuriale). " +
      "Pour en remplir un : voir_facture_a_traiter (pour le lire), puis enregistrer_facture (facture) ou enregistrer_mercuriale (mercuriale, avec son fournisseur) avec facture_a_traiter_id.",
    inputSchema: {
      type: "object",
      properties: { type: js.enum(["facture", "mercuriale"], "Ne lister que les factures, ou que les mercuriales (facultatif)") },
    },
    annotations: READ,
    run: async (args) => {
      const a = parseArgs(z.object({ type: z.enum(["facture", "mercuriale"]).optional() }), args ?? {});
      const liste = await listPendingInvoices(a.type ? { kind: a.type } : {});
      return text({
        nombre: liste.length,
        factures: liste.map((f) => ({
          id: f.id,
          type: f.kind,
          ...(f.kind === "mercuriale" ? { fournisseur: f.supplierName, fournisseur_id: f.supplierId } : {}),
          ajoutee_le: f.createdAt,
          pages: f.pages,
          pdf: f.pdf,
          remarque: f.note,
          ajoutee_par: f.addedBy,
          derniere_erreur_ia: f.lastError,
        })),
        page: `${currentOrigin() ?? ""}/factures`,
      });
    },
  },

  {
    name: "voir_facture_a_traiter",
    title: "Voir une facture ou une mercuriale à traiter",
    description:
      "Renvoie les photos (ou le PDF) d'une facture ou d'une mercuriale à traiter pour que tu la lises. Mercuriale (type=mercuriale) : enregistre ses prix avec enregistrer_mercuriale (fournisseur indiqué, facture_a_traiter_id = cet id, derniere_partie=true au dernier envoi). Facture : Recopie ensuite CHAQUE ligne avec enregistrer_facture (facture_a_traiter_id = cet id), en suivant ses règles : " +
      "avant d'enregistrer, regarde les articles déjà utilisés (comparer_prix_fournisseurs, voir_fournisseur) et REGROUPE les produits proches sous l'article existant, même orthographe (« Fraise Espagne » et « Fraise France » → article « Fraise » ; tomates, citrons verts… idem), " +
      "sauf ce qui change la recette, comme le chocolat qui se distingue par son % (« Chocolat noir 64 % »). En cas de doute entre deux articles, demande à l'utilisateur. Si une page est illisible, dis-le plutôt que de deviner. " +
      "PDF numérique (mercuriale, facture reçue par e-mail) : son texte est rendu page par page (texte_pdf), exact au centime, et le fichier n'est pas renvoyé (fichier=true pour l'avoir quand même) ; un PDF scanné n'a pas de texte, le fichier est alors renvoyé. " +
      "Une mercuriale (liste de prix, pas une facture) s'enregistre avec enregistrer_mercuriale, pas avec enregistrer_facture.",
    inputSchema: {
      type: "object",
      properties: {
        id: js.int("Id de la facture à traiter (lister_factures_a_traiter)"),
        fichier: js.bool("true pour recevoir aussi le PDF même quand son texte est lisible"),
      },
      required: ["id"],
    },
    annotations: READ,
    run: async (args) => {
      const a = parseArgs(z.object({ id, fichier: z.boolean().default(false) }), args);
      const f = await getPendingInvoice(a.id);
      if (!f) throw new Error("facture à traiter introuvable (déjà enregistrée ou supprimée ?)");
      const pages: McpToolResult["content"] = [];
      const textes: { page: number; texte: string }[] = [];
      let pagesPdf = 0;
      for (let i = 1; i <= f.pages; i++) {
        const p = await readPendingPage(f.id, i);
        if (!p) continue;
        if (p.type !== "application/pdf") {
          pages.push({ type: "image", data: p.bytes.toString("base64"), mimeType: p.type });
          continue;
        }
        // PDF numérique : on lit son texte (prix exacts, léger à envoyer) ; un scan n'en a pas.
        const lu = await texteDuPdf(p.bytes).catch(() => null);
        pagesPdf = lu?.pages ?? 0;
        const avecTexte = lu?.lues.filter((x) => x.texte.trim().length > 20) ?? [];
        textes.push(...avecTexte);
        if (a.fichier || !lu || avecTexte.length < lu.lues.length) {
          pages.push({ type: "resource", resource: { uri: `recipelog://factures-a-traiter/${f.id}.pdf`, mimeType: p.type, blob: p.bytes.toString("base64") } });
        }
      }
      const texteVide = pagesPdf > 0 && textes.length === 0;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                id: f.id,
                type: f.kind,
                ...(f.kind === "mercuriale" ? { fournisseur: f.supplierName } : {}),
                pages: pagesPdf || f.pages,
                pages_lisibles: pages.length + (textes.length ? 1 : 0),
                remarque: f.note,
                ajoutee_le: f.createdAt,
                ensuite:
                  f.kind === "mercuriale"
                    ? `enregistrer_mercuriale avec fournisseur: "${f.supplierName ?? "?"}", facture_a_traiter_id: ${f.id}, en plusieurs parties si elle est longue (derniere_partie=true au dernier envoi)`
                    : `enregistrer_facture (ou enregistrer_mercuriale pour une liste de prix) avec facture_a_traiter_id: ${f.id}`,
                ...(textes.length
                  ? {
                      texte_pdf: textes,
                      lecture:
                        "Texte du PDF page par page, les colonnes séparées par « | ». Recopie CHAQUE produit et son prix, page après page, sans en sauter : compte les produits de chaque page et vérifie le total à la fin.",
                    }
                  : {}),
                ...(texteVide ? { lecture: "PDF scanné (sans texte) : lis le fichier joint." } : {}),
              },
              null,
              2,
            ),
          },
          ...pages,
        ],
      };
    },
  },

  {
    name: "supprimer_facture_a_traiter",
    title: "Supprimer une facture ou mercuriale à traiter",
    description: "Supprime une facture ou une mercuriale à traiter et ses photos (doublon, photo ratée…). Demande d'abord à l'utilisateur. Ne touche à aucune facture enregistrée.",
    inputSchema: {
      type: "object",
      properties: { id: js.int("Id de la facture à traiter") },
      required: ["id"],
    },
    annotations: DELETE,
    run: async (args) => {
      const a = parseArgs(z.object({ id }), args);
      if (!(await deletePendingInvoice(a.id))) throw new Error("facture à traiter introuvable");
      refresh();
      return text({ ok: true, supprimee: a.id });
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
    description:
      "Produits d'un fournisseur (dernier prix, évolution, moyenne, ingrédient relié, conditionnement commandé) et ses factures. Gros catalogue (mercuriale) : filtre avec chercher, ou lis par pages (page, 300 produits par page).",
    inputSchema: {
      type: "object",
      properties: {
        id: js.int("Id du fournisseur"),
        nom: js.str("Ou son nom"),
        chercher: js.str("Mots à trouver dans le produit, l'article ou la référence (facultatif)"),
        page: js.int("Page de 300 produits (1 par défaut)"),
      },
    },
    annotations: READ,
    run: async (args) => {
      const a = parseArgs(
        z.object({ id: id.optional(), nom: z.string().trim().optional(), chercher: z.string().trim().max(100).optional(), page: z.number().int().min(1).max(100).default(1) }),
        args,
      );
      const sid =
        a.id ??
        (a.nom
          ? (await prisma.supplier.findFirst({ where: { name: { equals: a.nom, mode: "insensitive" } }, select: { id: true } }))?.id
          : undefined);
      const s = sid ? await loadSupplier(sid) : null;
      if (!s) throw new Error("fournisseur introuvable");
      const words = a.chercher ? articleKey(a.chercher).split(" ").filter(Boolean) : [];
      const matching = s.products.filter((p) => words.every((w) => articleKey(`${p.name} ${p.article ?? ""} ${p.reference ?? ""}`).includes(w)));
      const PER = 300;
      const pageItems = matching.slice((a.page - 1) * PER, a.page * PER);
      return text({
        id: s.id,
        nom: s.name,
        ...(s.note ? { note: s.note } : {}),
        ...joursSortie(s),
        produits_trouves: matching.length,
        ...(matching.length > PER ? { page: a.page, pages: Math.ceil(matching.length / PER) } : {}),
        produits: pageItems.map((p) => ({
          produit_id: p.id,
          produit: p.name,
          article: p.article,
          famille: p.family,
          prix: p.stats ? `${p.stats.current} €/${p.stats.unit}` : null,
          date: p.stats?.date,
          evolution: p.stats?.changePct,
          moyenne: p.stats?.average,
          ingredient: p.base?.name ?? null,
          ...(p.reference ? { reference: p.reference } : {}),
          ...(p.packSize ? { contenance: p.packSize } : {}),
          conditionnement: packNameOf({ name: p.name, packName: p.packName, packSize: p.packSize, priceUnit: p.unit }),
        })),
        articles_regroupes: groupByArticle(pageItems)
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
      "Relie un produit acheté à un ingrédient des recettes (ou le détache avec ingredient_id = null et sans nom). utiliser_ce_prix = true : l'ingrédient prend le prix de ce produit dans le coût de toutes les recettes (et le suit aux prochaines factures). Un ingrédient peut avoir plusieurs produits reliés (plusieurs chocolats, plusieurs fournisseurs), un seul est utilisé. Et un même produit peut donner son prix à PLUSIEURS ingrédients (« Crème 35 % à froid » et « Crème 35 % à chaud » sur « Crème 35 % brique 1 L ») : appelle l'outil avec utiliser_ce_prix = true pour chacun, aucun ne perd le prix des autres.",
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
      properties: {
        nom: js.str("Nom du fournisseur"),
        note: js.str("Remarque libre (minimum de commande, heure limite…)"),
        jours_commande: JOURS_JS("Jours où l'on commande (« lundi », « mercredi »…) : rappel « À commander aujourd'hui » dans l'appli"),
        jours_livraison: JOURS_JS("Jours où il livre (« mardi », « jeudi »…)"),
        contacts: CONTACTS_JS,
      },
      required: ["nom"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(
        z.object({
          nom: z.string().trim().min(1).max(120),
          note: z.string().max(2000).optional(),
          jours_commande: joursZ.optional(),
          jours_livraison: joursZ.optional(),
          contacts: contactsZ.optional(),
        }),
        args,
      );
      const s = await createSupplier({ name: a.nom, note: a.note, orderDays: a.jours_commande, deliveryDays: a.jours_livraison, contacts: a.contacts });
      refresh();
      return text({ fournisseur_id: s.id, nom: s.name });
    },
  },

  {
    name: "modifier_fournisseur",
    title: "Renommer ou modifier un fournisseur",
    description:
      "Renomme un fournisseur, change sa remarque, ses jours de commande et de livraison (rappel « À commander aujourd'hui » dans l'appli) ou ses numéros à appeler. Seuls les champs donnés changent. Ses produits, ses prix et ses factures restent. Refusé si un autre fournisseur porte déjà ce nom (pour réunir deux fournisseurs, demande à l'utilisateur).",
    inputSchema: {
      type: "object",
      properties: {
        id: js.int("Id du fournisseur (voir comparer_prix_fournisseurs)"),
        nom: js.str("Nouveau nom"),
        note: js.str("Nouvelle remarque (texte vide pour l'effacer)"),
        jours_commande: JOURS_JS("Jours où l'on commande, ex. [\"lundi\", \"mercredi\", \"vendredi\"] (liste vide = aucun rappel)"),
        jours_livraison: JOURS_JS("Jours où il livre, ex. [\"mardi\", \"jeudi\", \"samedi\"] (liste vide pour les effacer)"),
        contacts: CONTACTS_JS,
      },
      required: ["id"],
    },
    annotations: WRITE,
    run: async (args) => {
      const a = parseArgs(
        z.object({
          id,
          nom: z.string().trim().min(1).max(120).optional(),
          note: z.string().max(2000).optional(),
          jours_commande: joursZ.optional(),
          jours_livraison: joursZ.optional(),
          contacts: contactsZ.optional(),
        }),
        args,
      );
      if ([a.nom, a.note, a.jours_commande, a.jours_livraison, a.contacts].every((v) => v === undefined)) {
        throw new Error("rien à changer : donne nom, note, jours_commande, jours_livraison ou contacts");
      }
      const s = await updateSupplier(a.id, {
        name: a.nom,
        note: a.note,
        orderDays: a.jours_commande,
        deliveryDays: a.jours_livraison,
        contacts: a.contacts,
      });
      refresh();
      return text({ fournisseur_id: s.id, nom: s.name, note: s.note, ...joursSortie(s) });
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
        conditionnement: js.str("Ce qu'on commande : carton, sac, seau, kg… (facultatif, sinon deviné)"),
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
          conditionnement: z.string().trim().max(40).optional(),
          prix: money.optional(),
          date: day.optional(),
        }),
        args,
      );
      const p = await createProduct(a.fournisseur_id, {
        packName: a.conditionnement,
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
        conditionnement: js.str("Ce qu'on commande : carton, sac, seau, kg… (texte vide = deviné d'après le nom)"),
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
          conditionnement: z.string().max(40).optional(),
        }),
        args,
      );
      await updateProduct(a.produit_id, {
        packName: a.conditionnement,
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
