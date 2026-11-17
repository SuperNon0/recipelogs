/**
 * Lecture des factures et des mercuriales par IA (plateforme, lot 7) : ce que
 * l'IA doit rendre (schéma JSON), la consigne envoyée avec le fichier, et le
 * nettoyage de la réponse. Sans base de données : utilisable côté client et
 * testé dans tests/iaDocument.test.ts.
 */
import { PRICE_UNITS, type PriceUnit } from "@/lib/cost";
import { SUPPLIER_FAMILIES } from "@/lib/suppliers";

export type TypeLecture = "facture" | "mercuriale";

/** Une ligne lue, telle que la fenêtre de vérification l'affiche (tout est modifiable). */
export type LigneLue = {
  produit: string;
  reference: string | null;
  article: string | null;
  famille: string | null;
  quantite: number | null;
  contenance: number | null;
  unite: PriceUnit;
  prixUnitaire: number | null;
  prixColis: number | null;
  montant: number | null;
  /** Doute de l'IA sur cette ligne (prix illisible, conditionnement incertain…). */
  aVerifier: string | null;
};

export type DocumentLu = {
  fournisseur: string | null;
  date: string | null;
  numero: string | null;
  total: number | null;
  remarque: string | null;
  lignes: LigneLue[];
};

const nombreOuNull = { anyOf: [{ type: "number" }, { type: "null" }] };
const texteOuNull = { anyOf: [{ type: "string" }, { type: "null" }] };

/** Schéma demandé à l'IA (sortie structurée : tous les champs, pas d'autres). */
export const SCHEMA_DOCUMENT = {
  type: "object",
  properties: {
    fournisseur: { ...texteOuNull, description: "Nom du fournisseur (en-tête du document)" },
    date: { ...texteOuNull, description: "Date du document, AAAA-MM-JJ" },
    numero: { ...texteOuNull, description: "Numéro de facture ou de bon" },
    total_ht: { ...nombreOuNull, description: "Total HT en euros" },
    remarque: { ...texteOuNull, description: "Ce que l'utilisateur doit savoir (page illisible, pages manquantes…)" },
    lignes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          produit: { type: "string" },
          reference: texteOuNull,
          article: texteOuNull,
          famille: texteOuNull,
          quantite: nombreOuNull,
          contenance: nombreOuNull,
          unite_prix: { type: "string", enum: [...PRICE_UNITS] },
          prix_unitaire: nombreOuNull,
          prix_colis: nombreOuNull,
          montant_ligne: nombreOuNull,
          a_verifier: texteOuNull,
        },
        required: [
          "produit", "reference", "article", "famille", "quantite", "contenance",
          "unite_prix", "prix_unitaire", "prix_colis", "montant_ligne", "a_verifier",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["fournisseur", "date", "numero", "total_ht", "remarque", "lignes"],
  additionalProperties: false,
} as const;

/** Articles et familles déjà utilisés : l'IA les réutilise au lieu d'en inventer. */
export type ContexteLecture = { articles: string[]; fournisseur?: string | null };

export function consigne(type: TypeLecture, ctx: ContexteLecture): string {
  const articles = ctx.articles.slice(0, 400);
  return [
    type === "facture"
      ? "Ce fichier est une facture, un bon de livraison ou un bon de commande d'un fournisseur de pâtisserie. Recopie chaque ligne de produit acheté."
      : `Ce fichier est une mercuriale (liste de prix) ${ctx.fournisseur ? `du fournisseur « ${ctx.fournisseur} »` : "d'un fournisseur"}. Recopie chaque produit avec son prix. Il n'y a pas de quantité achetée : laisse quantite et montant_ligne à null.`,
    "Les prix sont en euros HORS TAXES. N'invente rien : un champ absent ou illisible vaut null, et explique le doute dans a_verifier.",
    "produit = la désignation exacte écrite (garde l'origine, la catégorie, le calibre). reference = le code article du fournisseur.",
    "Conditionnement : dès qu'un poids ou un volume est connu, préfère unite_prix kg ou L plutôt que pièce. Sac de 25 kg : unite_prix kg, contenance 25, prix_colis = prix du sac. Boîte de conserve « 5/1 4,2 kg PNE 2,4 kg » : unite_prix kg, contenance = poids net égoutté (PNE) s'il est écrit, sinon le poids net. Bouteille, bidon, brique (« 70 cl », « 10 L ») : unite_prix L. Carton « x 50 » vendu au colis : unite_prix pièce, contenance 50, prix_colis = prix du carton. Garde pièce pour ce qui se compte.",
    "prix_unitaire = prix HT par kg, L ou pièce s'il est écrit. Sinon donne prix_colis (prix d'un colis) avec sa contenance, ou montant_ligne avec quantite (nombre de colis). Ne fais pas de calcul hasardeux : recopie ce qui est écrit.",
    "Ignore les lignes qui ne sont pas des produits : frais de port, consigne, remise globale, sous-totaux, TVA (mentionne-les dans remarque s'ils comptent).",
    "article = nom commun court qui regroupe les variantes d'un même produit pour comparer les fournisseurs : sans origine, calibre ni catégorie (« Fraise », « Citron vert »), mais en gardant ce qui change la recette (« Chocolat noir 64 % », « Crème 35 % », « Farine T45 »).",
    articles.length
      ? `Articles déjà utilisés chez ce client (réutilise exactement le même texte quand c'est le même produit) : ${articles.join(" ; ")}.`
      : "",
    `famille parmi : ${SUPPLIER_FAMILIES.join(", ")}, ou Autres.`,
    "date au format AAAA-MM-JJ. Les nombres avec un point décimal (12.5, pas « 12,50 € »).",
  ]
    .filter(Boolean)
    .join("\n");
}

// ─────────────────────────────────────────────
// Nettoyage de la réponse de l'IA
// ─────────────────────────────────────────────

// Même limite que la lecture des tableurs (mercurialeFichier.ts) : ce que l'écran montre est
// ce qui est enregistré, rien n'est coupé en silence.
export const MAX_LIGNES = 3000;

function texte(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim().slice(0, max);
  return t || null;
}

/**
 * Nombre lu tel quel ou depuis un texte « 12,50 € », « 12,50 €/kg », « 12,50 € HT ».
 * Positif, sauf `negatif` (quantité, montant et total d'un avoir).
 */
export function nombre(v: unknown, negatif = false): number | null {
  let n: number;
  if (typeof v === "number") n = v;
  else if (typeof v === "string") {
    let t = v.replace(/[\s\u00a0\u202f]/g, "").replace(/(€|eur(os?)?)?(\/?(kg|l|litre|pi[eè]ce|pce|u|unit[ée]))?(h\.?t\.?)?$/i, "").replace(/€/g, "");
    // « 1.234,50 » ou « 12,5 » : virgule décimale à la française. « 1,234.50 » : à l'anglaise.
    t = /,\d{1,4}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
    if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
    n = Number(t);
  } else return null;
  if (!Number.isFinite(n) || (n < 0 && !negatif) || Math.abs(n) > 10_000_000) return null;
  return Math.round(n * 10000) / 10000;
}

function unite(v: unknown): PriceUnit {
  if (typeof v !== "string") return "kg";
  const t = v.trim().toLowerCase();
  if (t === "l" || t === "litre" || t === "litres") return "L";
  if (t.startsWith("pi") || t === "u" || t === "unité" || t === "unite") return "pièce";
  return "kg";
}

function jour(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const an = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${an}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

/** Transforme la réponse brute de l'IA en document propre (jamais d'erreur : au pire, vide). */
export function nettoyerDocument(brut: unknown): DocumentLu {
  const o = (brut && typeof brut === "object" ? brut : {}) as Record<string, unknown>;
  const lignes = (Array.isArray(o.lignes) ? o.lignes : [])
    .slice(0, MAX_LIGNES)
    .map((x) => {
      const l = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      return {
        produit: texte(l.produit) ?? "",
        reference: texte(l.reference, 100),
        article: texte(l.article),
        famille: texte(l.famille, 100),
        quantite: nombre(l.quantite, true),
        contenance: nombre(l.contenance),
        unite: unite(l.unite_prix),
        prixUnitaire: nombre(l.prix_unitaire),
        prixColis: nombre(l.prix_colis),
        montant: nombre(l.montant_ligne, true),
        aVerifier: texte(l.a_verifier, 300),
      } satisfies LigneLue;
    })
    .filter((l) => l.produit);
  return {
    fournisseur: texte(o.fournisseur),
    date: jour(o.date),
    numero: texte(o.numero, 100),
    total: nombre(o.total_ht, true),
    remarque: texte(o.remarque, 1000),
    lignes,
  };
}

/** Lit le JSON rendu par l'IA, même entouré de texte ou de ```json. */
export function lireJson(t: string): unknown {
  const s = t.trim();
  try {
    return JSON.parse(s);
  } catch {
    const debut = s.indexOf("{");
    const fin = s.lastIndexOf("}");
    if (debut >= 0 && fin > debut) {
      try {
        return JSON.parse(s.slice(debut, fin + 1));
      } catch {
        /* plus bas */
      }
    }
  }
  throw new Error("réponse illisible");
}

/** Prix ramené à l'unité (même calcul que l'enregistrement), pour l'aperçu. */
export function prixALUnite(l: Pick<LigneLue, "prixUnitaire" | "prixColis" | "contenance" | "quantite" | "montant">): number | null {
  const ok = (v: number | null): v is number => v != null && v > 0;
  if (ok(l.prixUnitaire)) return l.prixUnitaire;
  const c = ok(l.contenance) ? l.contenance : 1;
  if (ok(l.prixColis)) return Math.round((l.prixColis / c) * 10000) / 10000;
  // Avoir : montant et quantité négatifs tous les deux, le prix reste positif.
  if (l.montant != null && l.quantite != null && l.montant * l.quantite > 0) return Math.round((l.montant / (l.quantite * c)) * 10000) / 10000;
  return null;
}

/** Montant d'une ligne de facture (écrit ou recalculé), pour comparer au total. */
export function montantLigne(l: LigneLue): number | null {
  if (l.montant != null) return l.montant;
  if (l.quantite == null) return null;
  const colis = l.prixColis ?? (l.prixUnitaire != null ? l.prixUnitaire * (l.contenance ?? 1) : null);
  return colis == null ? null : Math.round(colis * l.quantite * 100) / 100;
}
