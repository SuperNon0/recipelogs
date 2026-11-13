/**
 * Données d'exemple de la démo publique (RECIPELOG_DEMO=1).
 *
 * Une pâtisserie inventée, « l'Atelier démo », avec ses bases, ses produits
 * vendus en boutique (prix de vente et marge), quatre fournisseurs fictifs et
 * trois mois de factures où les prix bougent (beurre en hausse, fraises de
 * France puis d'Espagne…). Rien ne vient des vraies recettes de Noë.
 *
 * Chargées par ./index.ts : tout seul au démarrage d'une démo vide, ou à la
 * main avec scripts/demo-exemples.ts.
 */
import type { PriceUnit } from "../cost";

// ─────────────────────────────────────────────
// Dossiers et catégories
// ─────────────────────────────────────────────

export const DEMO_FOLDERS = [
  { name: "Pâtes de base", color: "#6b6f7a" },
  { name: "Crèmes & garnitures", color: "#4fc3a1" },
  { name: "Tartes", color: "#e87c47" },
  { name: "Petits gâteaux", color: "#e85c8c" },
  { name: "Entremets", color: "#a78bfa" },
  { name: "Viennoiserie", color: "#e6c83a" },
  { name: "Biscuits & goûters", color: "#bf8a4f" },
] as const;

export const DEMO_CATEGORIES = [
  { name: "Vitrine boutique", color: "#e8c547" },
  { name: "Bases atelier", color: "#6b6f7a" },
  { name: "Chocolat", color: "#a0522d" },
  { name: "Fruits", color: "#e85c8c" },
  { name: "Goûter", color: "#4fc3a1" },
] as const;

type FolderName = (typeof DEMO_FOLDERS)[number]["name"];
type CategoryName = (typeof DEMO_CATEGORIES)[number]["name"];

// ─────────────────────────────────────────────
// Ingrédients (fiches : rangement, allergènes, poids d'une pièce)
// ─────────────────────────────────────────────

export type DemoIngredient = {
  name: string;
  category: "base" | "fruit" | "preparation";
  allergens?: string[];
  /** Poids d'une pièce en g (les recettes peuvent alors compter en pièces). */
  pieceG?: number;
  /** Prix saisi à la main, pour un ingrédient qu'on n'achète pas sur facture. */
  price?: { price: number; unit: PriceUnit };
};

export const DEMO_INGREDIENTS: DemoIngredient[] = [
  { name: "Farine T55", category: "base", allergens: ["gluten"] },
  { name: "Farine T45", category: "base", allergens: ["gluten"] },
  { name: "Sucre semoule", category: "base" },
  { name: "Sucre glace", category: "base" },
  { name: "Cassonade", category: "base" },
  { name: "Miel d'acacia", category: "base" },
  { name: "Glucose", category: "base" },
  { name: "Beurre doux", category: "base", allergens: ["lait"] },
  { name: "Beurre de tourage", category: "base", allergens: ["lait"] },
  { name: "Lait entier", category: "base", allergens: ["lait"] },
  { name: "Crème 35 %", category: "base", allergens: ["lait"] },
  { name: "Oeufs", category: "base", allergens: ["oeufs"], pieceG: 50 },
  { name: "Jaunes d'oeufs", category: "base", allergens: ["oeufs"] },
  { name: "Blancs d'oeufs", category: "base", allergens: ["oeufs"] },
  { name: "Chocolat noir 64 %", category: "base", allergens: ["lait", "soja"] },
  { name: "Chocolat au lait 40 %", category: "base", allergens: ["lait", "soja"] },
  { name: "Cacao en poudre", category: "base" },
  { name: "Bâtons chocolat", category: "base", allergens: ["lait", "soja"], pieceG: 5 },
  { name: "Poudre d'amandes", category: "base", allergens: ["fruits_a_coque"] },
  { name: "Noisettes torréfiées", category: "base", allergens: ["fruits_a_coque"] },
  { name: "Praliné noisette 50 %", category: "base", allergens: ["fruits_a_coque"] },
  { name: "Pâte de pistache", category: "base", allergens: ["fruits_a_coque"] },
  { name: "Feuilletine", category: "base", allergens: ["gluten", "lait"] },
  { name: "Gélatine 200 bloom", category: "base" },
  { name: "Pectine NH", category: "base" },
  { name: "Fécule de maïs", category: "base" },
  { name: "Levure chimique", category: "base" },
  { name: "Levure boulangère", category: "base", allergens: ["gluten"] },
  { name: "Sel fin", category: "base" },
  { name: "Fleur de sel", category: "base" },
  { name: "Gousse de vanille", category: "base", pieceG: 4 },
  { name: "Eau", category: "base", price: { price: 0.004, unit: "L" } },
  { name: "Fraises", category: "fruit" },
  { name: "Framboises", category: "fruit" },
  { name: "Citrons jaunes", category: "fruit", pieceG: 110 },
  { name: "Purée de framboise", category: "fruit" },
  { name: "Purée de passion", category: "fruit" },
];

// ─────────────────────────────────────────────
// Fournisseurs (inventés) et factures
// ─────────────────────────────────────────────

export const DEMO_SUPPLIERS = [
  { name: "Comptoir des Pâtissiers", note: "Fournisseur fictif de la démo : épicerie fine, chocolat, crèmerie. Livraison mardi et vendredi." },
  { name: "Cash Delmas", note: "Fournisseur fictif de la démo : grossiste généraliste, souvent moins cher sur la crèmerie et les œufs." },
  { name: "Primeurs Saint-Roch", note: "Fournisseur fictif de la démo : fruits frais. Les prix suivent la saison et l'origine." },
  { name: "Emballages Duval", note: "Fournisseur fictif de la démo : boîtes, caissettes et sacs (produits qui ne vont pas dans les recettes)." },
] as const;

/**
 * Ligne de facture : produit tel qu'écrit sur la facture, nombre de colis,
 * contenance d'un colis (dans l'unité de prix) et prix du colis.
 */
export type DemoLine = {
  product: string;
  ref?: string;
  article?: string;
  family: string;
  qty: number;
  pack: number;
  packPrice: number;
  unit: PriceUnit;
  ingredient?: string;
};

export type DemoInvoice = {
  supplier: (typeof DEMO_SUPPLIERS)[number]["name"];
  /** Date de la facture, en jours avant le chargement (l'historique reste récent). */
  daysAgo: number;
  number: string;
  note?: string;
  lines: DemoLine[];
};

// Produits récurrents, pour ne pas répéter leur description à chaque facture.
const C = {
  farine55: { product: "Farine de blé T55 - sac 25 kg", ref: "CP-1055", article: "Farine T55", family: "Épicerie", pack: 25, unit: "kg", ingredient: "Farine T55" },
  farine45: { product: "Farine de gruau T45 - sac 25 kg", ref: "CP-1045", article: "Farine T45", family: "Épicerie", pack: 25, unit: "kg", ingredient: "Farine T45" },
  sucre: { product: "Sucre semoule - sac 25 kg", ref: "CP-2001", article: "Sucre semoule", family: "Épicerie", pack: 25, unit: "kg", ingredient: "Sucre semoule" },
  sucreGlace: { product: "Sucre glace amidon - 10 kg", ref: "CP-2010", article: "Sucre glace", family: "Épicerie", pack: 10, unit: "kg", ingredient: "Sucre glace" },
  beurre: { product: "Beurre doux 82 % MG plaque 2 kg (x5)", ref: "CP-3082", article: "Beurre doux 82 %", family: "Crèmerie et œufs", pack: 10, unit: "kg", ingredient: "Beurre doux" },
  tourage: { product: "Beurre de tourage 84 % plaque 1 kg (x10)", ref: "CP-3084", article: "Beurre de tourage 84 %", family: "Crèmerie et œufs", pack: 10, unit: "kg", ingredient: "Beurre de tourage" },
  creme: { product: "Crème UHT 35 % MG brique 1 L (x6)", ref: "CP-3135", article: "Crème 35 %", family: "Crèmerie et œufs", pack: 6, unit: "L", ingredient: "Crème 35 %" },
  lait: { product: "Lait entier UHT 1 L (x6)", ref: "CP-3001", article: "Lait entier", family: "Crèmerie et œufs", pack: 6, unit: "L", ingredient: "Lait entier" },
  noir: { product: "Chocolat noir 64 % pistoles 5 kg", ref: "CP-4064", article: "Chocolat noir 64 %", family: "Chocolat", pack: 5, unit: "kg", ingredient: "Chocolat noir 64 %" },
  lait40: { product: "Chocolat au lait 40 % pistoles 5 kg", ref: "CP-4040", article: "Chocolat au lait 40 %", family: "Chocolat", pack: 5, unit: "kg", ingredient: "Chocolat au lait 40 %" },
  amandes: { product: "Poudre d'amandes blanchies 5 kg", ref: "CP-5010", article: "Poudre d'amandes", family: "Fruits secs", pack: 5, unit: "kg", ingredient: "Poudre d'amandes" },
  oeufsCP: { product: "Oeufs plein air calibre M (x180)", ref: "CP-3200", article: "Oeufs plein air M", family: "Crèmerie et œufs", pack: 180, unit: "pièce", ingredient: "Oeufs" },
} satisfies Record<string, Omit<DemoLine, "qty" | "packPrice">>;

const D = {
  farine55: { product: "FARINE T55 BOULANGERE 25KG", ref: "DL-88412", article: "Farine T55", family: "Épicerie", pack: 25, unit: "kg", ingredient: "Farine T55" },
  sucre: { product: "SUCRE SEMOULE CRISTAL 25KG", ref: "DL-10223", article: "Sucre semoule", family: "Épicerie", pack: 25, unit: "kg", ingredient: "Sucre semoule" },
  beurre: { product: "BEURRE DOUX 82% 10KG CARTON", ref: "DL-30410", article: "Beurre doux 82 %", family: "Crèmerie et œufs", pack: 10, unit: "kg", ingredient: "Beurre doux" },
  creme: { product: "CREME LIQUIDE 35% UHT 6X1L", ref: "DL-30655", article: "Crème 35 %", family: "Crèmerie et œufs", pack: 6, unit: "L", ingredient: "Crème 35 %" },
  oeufs: { product: "OEUFS PLEIN AIR M PLATEAU X180", ref: "DL-31002", article: "Oeufs plein air M", family: "Crèmerie et œufs", pack: 180, unit: "pièce", ingredient: "Oeufs" },
  jaunes: { product: "JAUNES D'OEUFS LIQUIDES PASTEURISES 1KG", ref: "DL-31020", article: "Jaunes d'oeufs liquides", family: "Crèmerie et œufs", pack: 1, unit: "kg", ingredient: "Jaunes d'oeufs" },
  blancs: { product: "BLANCS D'OEUFS LIQUIDES PASTEURISES 1KG", ref: "DL-31021", article: "Blancs d'oeufs liquides", family: "Crèmerie et œufs", pack: 1, unit: "kg", ingredient: "Blancs d'oeufs" },
  noir: { product: "CHOCOLAT NOIR 64% PALETS 5KG", ref: "DL-40164", article: "Chocolat noir 64 %", family: "Chocolat", pack: 5, unit: "kg", ingredient: "Chocolat noir 64 %" },
  amandes: { product: "AMANDE POUDRE BLANCHIE 5KG", ref: "DL-50120", article: "Poudre d'amandes", family: "Fruits secs", pack: 5, unit: "kg", ingredient: "Poudre d'amandes" },
} satisfies Record<string, Omit<DemoLine, "qty" | "packPrice">>;

const P = {
  fraiseFr: { product: "Fraise Gariguette France cat. 1", article: "Fraise", family: "Fruits et légumes", pack: 1, unit: "kg", ingredient: "Fraises" },
  fraiseEs: { product: "Fraise Espagne cat. 1", article: "Fraise", family: "Fruits et légumes", pack: 1, unit: "kg" },
  framboise: { product: "Framboise France barquette 125 g", article: "Framboise", family: "Fruits et légumes", pack: 0.125, unit: "kg", ingredient: "Framboises" },
  citronEs: { product: "Citron jaune Espagne cal. 4", article: "Citron jaune", family: "Fruits et légumes", pack: 1, unit: "kg", ingredient: "Citrons jaunes" },
  citronIt: { product: "Citron jaune Italie non traité", article: "Citron jaune", family: "Fruits et légumes", pack: 1, unit: "kg" },
} satisfies Record<string, Omit<DemoLine, "qty" | "packPrice">>;

const E = {
  boite18: { product: "Boîte pâtissière blanche 18 x 18 cm (x50)", ref: "ED-1818", family: "Emballages", pack: 50, unit: "pièce" },
  boite24: { product: "Boîte pâtissière blanche 24 x 24 cm (x50)", ref: "ED-2424", family: "Emballages", pack: 50, unit: "pièce" },
  caissette: { product: "Caissette carton or tartelette 8 cm (x500)", ref: "ED-C08", family: "Emballages", pack: 500, unit: "pièce" },
  sac: { product: "Sac kraft viennoiserie 14 x 30 cm (x1000)", ref: "ED-SK14", family: "Emballages", pack: 1000, unit: "pièce" },
  ruban: { product: "Rubalise bolduc doré 250 m", ref: "ED-RB250", family: "Emballages", pack: 1, unit: "pièce" },
} satisfies Record<string, Omit<DemoLine, "qty" | "packPrice">>;

/** Factures dans l'ordre des dates (les plus anciennes d'abord). */
export const DEMO_INVOICES: DemoInvoice[] = [
  {
    supplier: "Comptoir des Pâtissiers",
    daysAgo: 96,
    number: "F-24081",
    note: "Commande de rentrée",
    lines: [
      { ...C.farine55, qty: 4, packPrice: 18.5 },
      { ...C.farine45, qty: 2, packPrice: 21.0 },
      { ...C.sucre, qty: 2, packPrice: 27.5 },
      { ...C.sucreGlace, qty: 1, packPrice: 16.9 },
      { ...C.beurre, qty: 3, packPrice: 76.0 },
      { ...C.tourage, qty: 2, packPrice: 89.0 },
      { ...C.creme, qty: 4, packPrice: 24.6 },
      { ...C.lait, qty: 4, packPrice: 6.3 },
      { ...C.noir, qty: 2, packPrice: 72.5 },
      { ...C.lait40, qty: 1, packPrice: 66.0 },
      { ...C.amandes, qty: 1, packPrice: 62.5 },
      { ...C.oeufsCP, qty: 2, packPrice: 55.8 },
      { product: "Praliné noisette 50 % seau 5 kg", ref: "CP-5150", article: "Praliné noisette 50 %", family: "Fruits secs", qty: 1, pack: 5, packPrice: 89.0, unit: "kg", ingredient: "Praliné noisette 50 %" },
      { product: "Gélatine poudre 200 bloom 1 kg", ref: "CP-6200", article: "Gélatine 200 bloom", family: "Épicerie", qty: 1, pack: 1, packPrice: 32.0, unit: "kg", ingredient: "Gélatine 200 bloom" },
      { product: "Vanille Bourbon Madagascar gousses (x50)", ref: "CP-6050", article: "Vanille gousse", family: "Épicerie", qty: 1, pack: 50, packPrice: 62.0, unit: "pièce", ingredient: "Gousse de vanille" },
      { product: "Levure chimique sans phosphate 1 kg", ref: "CP-6110", article: "Levure chimique", family: "Épicerie", qty: 1, pack: 1, packPrice: 6.9, unit: "kg", ingredient: "Levure chimique" },
      { product: "Cacao en poudre 100 % 1 kg", ref: "CP-4100", article: "Cacao en poudre", family: "Chocolat", qty: 1, pack: 1, packPrice: 14.9, unit: "kg", ingredient: "Cacao en poudre" },
      { product: "Sirop de glucose 1 kg", ref: "CP-2050", article: "Glucose", family: "Épicerie", qty: 2, pack: 1, packPrice: 4.2, unit: "kg", ingredient: "Glucose" },
      { product: "Fécule de maïs 1 kg", ref: "CP-6300", article: "Fécule de maïs", family: "Épicerie", qty: 2, pack: 1, packPrice: 3.2, unit: "kg", ingredient: "Fécule de maïs" },
    ],
  },
  {
    supplier: "Cash Delmas",
    daysAgo: 82,
    number: "DC-55120",
    lines: [
      { ...D.farine55, qty: 2, packPrice: 19.75 },
      { ...D.sucre, qty: 1, packPrice: 29.5 },
      { ...D.beurre, qty: 1, packPrice: 77.5 },
      { ...D.creme, qty: 2, packPrice: 26.1 },
      { ...D.oeufs, qty: 2, packPrice: 48.6 },
      { ...D.jaunes, qty: 4, packPrice: 7.9 },
      { ...D.blancs, qty: 6, packPrice: 3.4 },
      { ...D.noir, qty: 1, packPrice: 76.0 },
      { ...D.amandes, qty: 1, packPrice: 67.0 },
    ],
  },
  {
    supplier: "Primeurs Saint-Roch",
    daysAgo: 76,
    number: "BL-3301",
    lines: [
      { ...P.fraiseFr, qty: 6, packPrice: 8.5 },
      { ...P.framboise, qty: 24, packPrice: 2.38 },
      { ...P.citronEs, qty: 5, packPrice: 2.9 },
    ],
  },
  {
    supplier: "Comptoir des Pâtissiers",
    daysAgo: 61,
    number: "F-24312",
    lines: [
      { ...C.beurre, qty: 3, packPrice: 79.5 },
      { ...C.creme, qty: 4, packPrice: 24.6 },
      { ...C.noir, qty: 2, packPrice: 74.5 },
      { product: "Noisettes du Piémont torréfiées 1 kg", ref: "CP-5200", article: "Noisettes torréfiées", family: "Fruits secs", qty: 2, pack: 1, packPrice: 16.8, unit: "kg", ingredient: "Noisettes torréfiées" },
      { product: "Pâte de pistache pure 1 kg", ref: "CP-5300", article: "Pâte de pistache", family: "Fruits secs", qty: 1, pack: 1, packPrice: 48.0, unit: "kg", ingredient: "Pâte de pistache" },
      { product: "Pectine NH 1 kg", ref: "CP-6400", article: "Pectine NH", family: "Épicerie", qty: 1, pack: 1, packPrice: 39.0, unit: "kg", ingredient: "Pectine NH" },
      { product: "Sel fin de mer 1 kg", ref: "CP-6500", article: "Sel fin", family: "Épicerie", qty: 1, pack: 1, packPrice: 0.65, unit: "kg", ingredient: "Sel fin" },
      { product: "Fleur de sel de Guérande 1 kg", ref: "CP-6510", article: "Fleur de sel", family: "Épicerie", qty: 1, pack: 1, packPrice: 9.5, unit: "kg", ingredient: "Fleur de sel" },
      { product: "Miel d'acacia seau 1 kg", ref: "CP-2100", article: "Miel d'acacia", family: "Épicerie", qty: 2, pack: 1, packPrice: 11.9, unit: "kg", ingredient: "Miel d'acacia" },
      { product: "Purée de framboise surgelée 1 kg", ref: "CP-7010", article: "Purée de framboise", family: "Surgelés", qty: 3, pack: 1, packPrice: 9.8, unit: "kg", ingredient: "Purée de framboise" },
      { product: "Purée de fruit de la passion surgelée 1 kg", ref: "CP-7020", article: "Purée de passion", family: "Surgelés", qty: 2, pack: 1, packPrice: 11.5, unit: "kg", ingredient: "Purée de passion" },
      { product: "Levure boulangère fraîche 500 g", ref: "CP-6120", article: "Levure boulangère", family: "Crèmerie et œufs", qty: 4, pack: 0.5, packPrice: 1.45, unit: "kg", ingredient: "Levure boulangère" },
      { product: "Cassonade 5 kg", ref: "CP-2020", article: "Cassonade", family: "Épicerie", qty: 1, pack: 5, packPrice: 12.4, unit: "kg", ingredient: "Cassonade" },
      { product: "Feuilletine 2,5 kg", ref: "CP-6600", article: "Feuilletine", family: "Épicerie", qty: 1, pack: 2.5, packPrice: 24.0, unit: "kg", ingredient: "Feuilletine" },
      { product: "Bâtons boulangers chocolat 44 % (x300)", ref: "CP-4300", article: "Bâtons chocolat", family: "Chocolat", qty: 1, pack: 300, packPrice: 19.5, unit: "pièce", ingredient: "Bâtons chocolat" },
    ],
  },
  {
    supplier: "Emballages Duval",
    daysAgo: 55,
    number: "E-1187",
    lines: [
      { ...E.boite18, qty: 4, packPrice: 21.0 },
      { ...E.boite24, qty: 2, packPrice: 27.5 },
      { ...E.caissette, qty: 1, packPrice: 34.0 },
      { ...E.sac, qty: 1, packPrice: 38.0 },
      { ...E.ruban, qty: 2, packPrice: 6.9 },
    ],
  },
  {
    supplier: "Primeurs Saint-Roch",
    daysAgo: 47,
    number: "BL-3388",
    note: "Fin des fraises françaises : passage en Espagne",
    lines: [
      { ...P.fraiseEs, qty: 6, packPrice: 5.9 },
      { ...P.framboise, qty: 24, packPrice: 2.69 },
      { ...P.citronIt, qty: 5, packPrice: 3.4 },
    ],
  },
  {
    supplier: "Cash Delmas",
    daysAgo: 40,
    number: "DC-55897",
    lines: [
      { ...D.farine55, qty: 2, packPrice: 19.25 },
      { ...D.sucre, qty: 1, packPrice: 28.75 },
      { ...D.beurre, qty: 2, packPrice: 81.0 },
      { ...D.creme, qty: 3, packPrice: 25.2 },
      { ...D.oeufs, qty: 2, packPrice: 52.2 },
      { ...D.jaunes, qty: 4, packPrice: 7.6 },
      { ...D.blancs, qty: 6, packPrice: 3.3 },
    ],
  },
  {
    supplier: "Comptoir des Pâtissiers",
    daysAgo: 26,
    number: "F-24660",
    note: "Hausse du beurre annoncée par le commercial",
    lines: [
      { ...C.farine55, qty: 3, packPrice: 18.5 },
      { ...C.sucre, qty: 2, packPrice: 27.5 },
      { ...C.beurre, qty: 3, packPrice: 84.0 },
      { ...C.tourage, qty: 2, packPrice: 96.0 },
      { ...C.creme, qty: 4, packPrice: 25.5 },
      { ...C.noir, qty: 2, packPrice: 77.0 },
      { ...C.amandes, qty: 1, packPrice: 64.5 },
      { ...C.oeufsCP, qty: 2, packPrice: 55.8 },
    ],
  },
  {
    supplier: "Primeurs Saint-Roch",
    daysAgo: 12,
    number: "BL-3462",
    lines: [
      { ...P.fraiseEs, qty: 8, packPrice: 6.4 },
      { ...P.framboise, qty: 24, packPrice: 2.75 },
      { ...P.citronEs, qty: 6, packPrice: 3.1 },
    ],
  },
  {
    supplier: "Cash Delmas",
    daysAgo: 6,
    number: "DC-56340",
    lines: [
      { ...D.beurre, qty: 2, packPrice: 82.5 },
      { ...D.creme, qty: 3, packPrice: 25.8 },
      { ...D.oeufs, qty: 2, packPrice: 54.0 },
      { ...D.noir, qty: 1, packPrice: 75.5 },
      { ...D.amandes, qty: 1, packPrice: 65.5 },
    ],
  },
];

// ─────────────────────────────────────────────
// Recettes
// ─────────────────────────────────────────────

/** [nom, quantité, unité (g par défaut), quantité max d'une fourchette]. */
export type DemoIng = [string, number, ("g" | "L" | "cc" | "cs" | "pièce" | "QS" | "titre")?, number?];

export type DemoSub = {
  recipe: string;
  label: string;
  /** mass_target : `value` = grammes voulus ; coefficient : `value` = multiplicateur. */
  mode: "mass_target" | "coefficient";
  value: number;
};

export type DemoRecipe = {
  key: string;
  name: string;
  folder: FolderName;
  categories: CategoryName[];
  tags?: string[];
  ingredients: DemoIng[];
  steps?: string;
  notes?: string;
  source?: string;
  favorite?: boolean;
  rating?: number;
  yield?: { count: number; label: string };
  mold?: { shape: "cercle" | "cadre" | "carre"; a: number; b?: number; h?: number };
  /** Prix de vente TTC (par pièce si rendement, sinon la recette entière). */
  sale?: { price: number; vat?: number; coef?: number };
  subs?: DemoSub[];
  /** Variante d'une autre recette (clé), avec ce qui change. */
  variantOf?: { key: string; note: string };
  comments?: string[];
};

export const DEMO_RECIPES: DemoRecipe[] = [
  // ── Bases ──────────────────────────────────
  {
    key: "pate-sucree",
    name: "Pâte sucrée aux amandes",
    folder: "Pâtes de base",
    categories: ["Bases atelier"],
    tags: ["base", "tarte"],
    rating: 5,
    ingredients: [
      ["Beurre doux", 300],
      ["Sucre glace", 190],
      ["Poudre d'amandes", 60],
      ["Sel fin", 3],
      ["Oeufs", 2, "pièce"],
      ["Farine T55", 500],
    ],
    steps: [
      "Crémer le beurre pommade avec le sucre glace, la poudre d'amandes et le sel.",
      "Ajouter les œufs un à un, sans faire mousser.",
      "Incorporer la farine en une fois et arrêter dès que la pâte est homogène.",
      "Aplatir entre deux feuilles, filmer et laisser reposer 2 h au froid.",
      "Abaisser à 2,5 mm, foncer les cercles et cuire à 160 °C ventilé 15 à 18 min.",
    ].join("\n"),
    notes: "Se garde 3 jours au froid ou 1 mois au congélateur, abaissée et filmée.",
    comments: ["Pour 10 tartelettes de 8 cm, compter environ 450 g de pâte."],
  },
  {
    key: "pate-choux",
    name: "Pâte à choux",
    folder: "Pâtes de base",
    categories: ["Bases atelier"],
    tags: ["base", "choux"],
    rating: 4,
    ingredients: [
      ["Panade", 0, "titre"],
      ["Lait entier", 125],
      ["Eau", 125],
      ["Beurre doux", 110],
      ["Sel fin", 4],
      ["Sucre semoule", 4],
      ["Farine T55", 150],
      ["Appareil", 0, "titre"],
      ["Oeufs", 250, "g", 270],
    ],
    steps: [
      "# Panade",
      "Porter à ébullition le lait, l'eau, le beurre en morceaux, le sel et le sucre.",
      "Hors du feu, verser la farine d'un coup, puis dessécher 1 min sur feu moyen.",
      "# Appareil",
      "Mettre la panade au batteur avec la feuille et ajouter {250 g} d'œufs petit à petit.",
      "La pâte doit former un V qui se tient au bout de la feuille : ajouter un peu d'œuf si besoin.",
      "Pocher, puis cuire à 165 °C ventilé 35 à 40 min sans ouvrir la porte.",
    ].join("\n"),
  },
  {
    key: "creme-patissiere",
    name: "Crème pâtissière vanille",
    folder: "Crèmes & garnitures",
    categories: ["Bases atelier"],
    tags: ["base", "crème"],
    favorite: true,
    rating: 5,
    ingredients: [
      ["Lait entier", 1000],
      ["Gousse de vanille", 1, "pièce"],
      ["Jaunes d'oeufs", 200],
      ["Sucre semoule", 200],
      ["Fécule de maïs", 90],
      ["Beurre doux", 80],
    ],
    steps: [
      "Chauffer le lait avec la gousse fendue et grattée.",
      "Blanchir les jaunes avec le sucre, puis ajouter la fécule.",
      "Verser un tiers du lait chaud sur le mélange, remettre dans la casserole.",
      "Cuire en fouettant 2 min après l'ébullition.",
      "Hors du feu, ajouter {80 g} de beurre, filmer au contact et refroidir rapidement.",
    ].join("\n"),
    notes: "Refroidir en cellule à moins de 10 °C en moins de 2 h. À utiliser dans les 48 h.",
  },
  {
    key: "creme-patissiere-choco",
    name: "Crème pâtissière chocolat",
    folder: "Crèmes & garnitures",
    categories: ["Bases atelier", "Chocolat"],
    tags: ["base", "crème"],
    variantOf: { key: "creme-patissiere", note: "Même base, avec 150 g de chocolat noir 64 % fondu dans la crème chaude" },
    ingredients: [
      ["Lait entier", 1000],
      ["Gousse de vanille", 1, "pièce"],
      ["Jaunes d'oeufs", 200],
      ["Sucre semoule", 180],
      ["Fécule de maïs", 80],
      ["Beurre doux", 50],
      ["Chocolat noir 64 %", 150],
    ],
    steps: [
      "Chauffer le lait avec la gousse fendue et grattée.",
      "Blanchir les jaunes avec le sucre, puis ajouter la fécule.",
      "Verser un tiers du lait chaud sur le mélange, remettre dans la casserole.",
      "Cuire en fouettant 2 min après l'ébullition.",
      "Hors du feu, ajouter {150 g} de chocolat et le beurre, mixer, filmer au contact et refroidir.",
    ].join("\n"),
  },
  {
    key: "creme-amande",
    name: "Crème d'amande",
    folder: "Crèmes & garnitures",
    categories: ["Bases atelier"],
    tags: ["base", "tarte"],
    ingredients: [
      ["Beurre doux", 250],
      ["Sucre semoule", 250],
      ["Poudre d'amandes", 250],
      ["Oeufs", 5, "pièce"],
      ["Farine T55", 25],
    ],
    steps: [
      "Crémer le beurre pommade et le sucre sans incorporer d'air.",
      "Ajouter la poudre d'amandes, puis les œufs un à un.",
      "Finir avec la farine. Garder au froid jusqu'à 3 jours.",
    ].join("\n"),
  },
  {
    key: "creme-citron",
    name: "Crème citron",
    folder: "Crèmes & garnitures",
    categories: ["Bases atelier", "Fruits"],
    tags: ["crème", "agrume"],
    ingredients: [
      ["Citrons jaunes", 6, "pièce"],
      ["Sucre semoule", 220],
      ["Oeufs", 5, "pièce"],
      ["Beurre doux", 300],
    ],
    steps: [
      "Zester 2 citrons et presser les 6 : il faut environ 200 g de jus.",
      "Chauffer jus, zestes, sucre et œufs en fouettant jusqu'à 82 °C.",
      "Refroidir à 40 °C, ajouter le beurre en morceaux et mixer.",
      "Filmer au contact et laisser prendre 4 h au froid.",
    ].join("\n"),
  },
  {
    key: "meringue-italienne",
    name: "Meringue italienne",
    folder: "Crèmes & garnitures",
    categories: ["Bases atelier"],
    tags: ["base"],
    ingredients: [
      ["Blancs d'oeufs", 200],
      ["Sucre semoule", 400],
      ["Eau", 120],
    ],
    steps: [
      "Cuire l'eau et {400 g} de sucre à 118 °C.",
      "À 110 °C, commencer à monter les blancs.",
      "Verser le sirop en filet sur les blancs mousseux et fouetter jusqu'à 40 °C.",
    ].join("\n"),
  },
  {
    key: "mousseline-praline",
    name: "Crème mousseline praliné",
    folder: "Crèmes & garnitures",
    categories: ["Bases atelier"],
    tags: ["crème", "praliné"],
    ingredients: [
      ["Beurre doux", 250],
      ["Praliné noisette 50 %", 200],
    ],
    subs: [{ recipe: "creme-patissiere", label: "Crème pâtissière", mode: "mass_target", value: 500 }],
    steps: [
      "Fouetter la crème pâtissière froide pour la lisser.",
      "Monter le beurre pommade avec le praliné au batteur.",
      "Ajouter la crème pâtissière en trois fois et fouetter jusqu'à ce que la crème soit légère.",
    ].join("\n"),
    notes: "La crème pâtissière doit être à la même température que le beurre (environ 20 °C), sinon la mousseline tranche.",
  },
  {
    key: "dacquoise",
    name: "Dacquoise noisette",
    folder: "Pâtes de base",
    categories: ["Bases atelier"],
    tags: ["biscuit"],
    mold: { shape: "cadre", a: 40, b: 30 },
    ingredients: [
      ["Blancs d'oeufs", 200],
      ["Sucre semoule", 70],
      ["Noisettes torréfiées", 150],
      ["Sucre glace", 170],
      ["Farine T55", 40],
    ],
    steps: [
      "Mixer les noisettes avec le sucre glace et la farine.",
      "Monter les blancs en les serrant avec le sucre semoule.",
      "Incorporer les poudres à la maryse.",
      "Étaler dans le cadre et cuire à 170 °C ventilé 18 min.",
    ].join("\n"),
  },
  {
    key: "croustillant",
    name: "Croustillant praliné",
    folder: "Crèmes & garnitures",
    categories: ["Bases atelier", "Chocolat"],
    tags: ["insert"],
    ingredients: [
      ["Chocolat au lait 40 %", 60],
      ["Praliné noisette 50 %", 200],
      ["Feuilletine", 100],
      ["Fleur de sel", 1],
    ],
    steps: [
      "Fondre le chocolat au lait à 40 °C et le mélanger au praliné.",
      "Ajouter la feuilletine et la fleur de sel sans écraser.",
      "Étaler finement dans un cercle et bloquer au froid.",
    ].join("\n"),
  },
  {
    key: "mousse-chocolat",
    name: "Mousse chocolat noir",
    folder: "Crèmes & garnitures",
    categories: ["Bases atelier", "Chocolat"],
    tags: ["mousse"],
    ingredients: [
      ["Crème anglaise", 0, "titre"],
      ["Lait entier", 200],
      ["Crème 35 %", 200],
      ["Jaunes d'oeufs", 80],
      ["Sucre semoule", 40],
      ["Chocolat noir 64 %", 360],
      ["Finition", 0, "titre"],
      ["Crème 35 %", 600],
    ],
    steps: [
      "# Crème anglaise",
      "Cuire lait, crème, jaunes et sucre à 84 °C.",
      "Verser sur le chocolat en trois fois pour faire une émulsion bien lisse.",
      "# Finition",
      "À 35 °C, incorporer {600 g} de crème montée mousseuse.",
      "Couler aussitôt.",
    ].join("\n"),
  },
  {
    key: "glacage-choco",
    name: "Glaçage chocolat brillant",
    folder: "Crèmes & garnitures",
    categories: ["Bases atelier", "Chocolat"],
    tags: ["glaçage"],
    ingredients: [
      ["Crème 35 %", 200],
      ["Glucose", 60],
      ["Chocolat noir 64 %", 200],
      ["Gélatine 200 bloom", 4],
      ["Eau", 24],
    ],
    steps: [
      "Hydrater la gélatine dans l'eau froide.",
      "Bouillir la crème et le glucose, verser sur le chocolat et la gélatine.",
      "Mixer sans incorporer de bulles. Utiliser à 32 °C.",
    ].join("\n"),
  },
  {
    key: "confit-framboise",
    name: "Confit de framboise",
    folder: "Crèmes & garnitures",
    categories: ["Bases atelier", "Fruits"],
    tags: ["insert", "fruit rouge"],
    ingredients: [
      ["Purée de framboise", 400],
      ["Framboises", 100],
      ["Sucre semoule", 60],
      ["Pectine NH", 6],
    ],
    steps: [
      "Chauffer la purée et les framboises à 40 °C.",
      "Ajouter le sucre mélangé à la pectine en pluie, en fouettant.",
      "Porter à ébullition 1 min, couler en insert et congeler.",
    ].join("\n"),
  },

  // ── Produits vendus en boutique ────────────
  {
    key: "tarte-citron",
    name: "Tartelette citron meringuée",
    folder: "Tartes",
    categories: ["Vitrine boutique", "Fruits"],
    tags: ["best-seller", "agrume"],
    favorite: true,
    rating: 5,
    yield: { count: 10, label: "tartelettes" },
    mold: { shape: "cercle", a: 8, h: 2 },
    sale: { price: 4.8, vat: 5.5 },
    ingredients: [["Sucre glace", 0, "QS"]],
    subs: [
      { recipe: "pate-sucree", label: "Fond de tarte", mode: "mass_target", value: 450 },
      { recipe: "creme-citron", label: "Crème citron", mode: "mass_target", value: 650 },
      { recipe: "meringue-italienne", label: "Meringue", mode: "mass_target", value: 300 },
    ],
    steps: [
      "Cuire les fonds de pâte sucrée à blanc.",
      "Garnir de crème citron à ras et lisser.",
      "Pocher la meringue italienne avec une douille Saint-Honoré et la colorer au chalumeau.",
    ].join("\n"),
    comments: ["Meilleure vente de la vitrine : prévoir 20 pièces le samedi."],
  },
  {
    key: "tarte-fraises",
    name: "Tarte aux fraises",
    folder: "Tartes",
    categories: ["Vitrine boutique", "Fruits"],
    tags: ["saison", "à revoir"],
    rating: 4,
    yield: { count: 8, label: "parts" },
    mold: { shape: "cercle", a: 24, h: 2 },
    sale: { price: 4.2, vat: 5.5 },
    ingredients: [
      ["Fraises", 600],
      ["Sucre glace", 0, "QS"],
    ],
    subs: [
      { recipe: "pate-sucree", label: "Fond de tarte", mode: "mass_target", value: 350 },
      { recipe: "creme-amande", label: "Crème d'amande", mode: "mass_target", value: 250 },
      { recipe: "creme-patissiere", label: "Crème pâtissière", mode: "mass_target", value: 400 },
    ],
    steps: [
      "Foncer le cercle, garnir de crème d'amande et cuire à 165 °C 25 min.",
      "Refroidir, puis couvrir de crème pâtissière lissée.",
      "Disposer les fraises équeutées et coupées en deux, pointe en haut.",
      "Saupoudrer de sucre glace au moment de servir.",
    ].join("\n"),
    comments: [
      "Le coefficient tombe sous ×4 à cause des fraises : prix à revoir, ou passer à la tarte en 6 parts.",
    ],
  },
  {
    key: "eclair",
    name: "Éclair au chocolat",
    folder: "Petits gâteaux",
    categories: ["Vitrine boutique", "Chocolat"],
    tags: ["choux", "best-seller"],
    favorite: true,
    rating: 5,
    yield: { count: 20, label: "éclairs" },
    sale: { price: 3.9, vat: 5.5 },
    ingredients: [],
    subs: [
      { recipe: "pate-choux", label: "Pâte à choux", mode: "coefficient", value: 1 },
      { recipe: "creme-patissiere-choco", label: "Garniture", mode: "mass_target", value: 1000 },
      { recipe: "glacage-choco", label: "Glaçage", mode: "mass_target", value: 300 },
    ],
    steps: [
      "Pocher des éclairs de 13 cm avec une douille cannelée de 18 et cuire.",
      "Percer trois trous dessous et garnir de 50 g de crème pâtissière chocolat.",
      "Tremper le dessus dans le glaçage à 32 °C et lisser au doigt.",
    ].join("\n"),
  },
  {
    key: "paris-brest",
    name: "Paris-Brest individuel",
    folder: "Petits gâteaux",
    categories: ["Vitrine boutique"],
    tags: ["choux", "praliné"],
    rating: 5,
    yield: { count: 10, label: "Paris-Brest" },
    sale: { price: 5.2, vat: 5.5 },
    ingredients: [
      ["Noisettes torréfiées", 60],
      ["Sucre glace", 0, "QS"],
    ],
    subs: [
      { recipe: "pate-choux", label: "Couronnes", mode: "mass_target", value: 500 },
      { recipe: "mousseline-praline", label: "Mousseline", mode: "mass_target", value: 700 },
    ],
    steps: [
      "Pocher des couronnes de 8 cm, parsemer de noisettes concassées et cuire.",
      "Couper les couronnes en deux.",
      "Pocher la mousseline praliné en rosaces, refermer et saupoudrer de sucre glace.",
    ].join("\n"),
  },
  {
    key: "royal",
    name: "Entremets Royal chocolat",
    folder: "Entremets",
    categories: ["Vitrine boutique", "Chocolat"],
    tags: ["fêtes", "8 parts"],
    favorite: true,
    rating: 5,
    mold: { shape: "cercle", a: 20, h: 4.5 },
    sale: { price: 36, vat: 5.5 },
    ingredients: [["Cacao en poudre", 0, "QS"]],
    subs: [
      { recipe: "dacquoise", label: "Biscuit", mode: "mass_target", value: 250 },
      { recipe: "croustillant", label: "Croustillant", mode: "mass_target", value: 200 },
      { recipe: "mousse-chocolat", label: "Mousse", mode: "mass_target", value: 700 },
    ],
    steps: [
      "Détailler un disque de dacquoise de 18 cm et le couvrir de croustillant.",
      "Couler la moitié de la mousse dans le cercle chemisé de rhodoïd.",
      "Poser le biscuit croustillant, finir avec la mousse et lisser.",
      "Congeler, décercler et saupoudrer de cacao au pochoir.",
    ].join("\n"),
    notes: "Vendu entier (8 parts). Prix de vente pour l'entremets complet.",
  },
  {
    key: "verrine",
    name: "Verrine mousse chocolat framboise",
    folder: "Petits gâteaux",
    categories: ["Vitrine boutique", "Chocolat", "Fruits"],
    tags: ["verrine"],
    yield: { count: 12, label: "verrines" },
    sale: { price: 3.5, vat: 5.5 },
    ingredients: [["Framboises", 72]],
    subs: [
      { recipe: "confit-framboise", label: "Fond fruité", mode: "mass_target", value: 300 },
      { recipe: "mousse-chocolat", label: "Mousse", mode: "mass_target", value: 960 },
    ],
    steps: [
      "Couler 25 g de confit de framboise au fond de chaque verrine et laisser prendre.",
      "Pocher 80 g de mousse chocolat.",
      "Décorer de 6 framboises fraîches.",
    ].join("\n"),
  },
  {
    key: "financiers",
    name: "Financiers",
    folder: "Biscuits & goûters",
    categories: ["Vitrine boutique", "Goûter"],
    tags: ["petit four"],
    favorite: true,
    rating: 4,
    yield: { count: 40, label: "financiers" },
    sale: { price: 1.2, vat: 5.5 },
    ingredients: [
      ["Beurre doux", 300],
      ["Blancs d'oeufs", 360],
      ["Sucre glace", 400],
      ["Poudre d'amandes", 150],
      ["Farine T55", 120],
      ["Miel d'acacia", 30],
    ],
    steps: [
      "Cuire le beurre jusqu'à la noisette et le passer au chinois.",
      "Mélanger le sucre glace, la poudre d'amandes et la farine.",
      "Ajouter les blancs non montés et le miel, puis le beurre noisette tiède.",
      "Repos 12 h au froid. Pocher 30 g par moule et cuire à 190 °C 10 min.",
    ].join("\n"),
  },
  {
    key: "financiers-pistache",
    name: "Financiers pistache",
    folder: "Biscuits & goûters",
    categories: ["Vitrine boutique", "Goûter"],
    tags: ["petit four"],
    variantOf: { key: "financiers", note: "Avec 60 g de pâte de pistache pure et un peu moins de poudre d'amandes" },
    yield: { count: 40, label: "financiers" },
    sale: { price: 1.5, vat: 5.5 },
    ingredients: [
      ["Beurre doux", 300],
      ["Blancs d'oeufs", 360],
      ["Sucre glace", 400],
      ["Poudre d'amandes", 120],
      ["Pâte de pistache", 60],
      ["Farine T55", 120],
      ["Miel d'acacia", 30],
    ],
    steps: [
      "Cuire le beurre jusqu'à la noisette et le passer au chinois.",
      "Détendre la pâte de pistache avec un peu de blancs.",
      "Mélanger les poudres, ajouter les blancs, le miel, la pistache puis le beurre noisette tiède.",
      "Repos 12 h au froid. Pocher 30 g par moule et cuire à 190 °C 10 min.",
    ].join("\n"),
  },
  {
    key: "financiers-framboise",
    name: "Financiers framboise",
    folder: "Biscuits & goûters",
    categories: ["Vitrine boutique", "Goûter", "Fruits"],
    tags: ["petit four"],
    variantOf: { key: "financiers", note: "Une framboise fraîche posée sur chaque financier avant cuisson" },
    yield: { count: 40, label: "financiers" },
    sale: { price: 1.4, vat: 5.5 },
    ingredients: [
      ["Beurre doux", 300],
      ["Blancs d'oeufs", 360],
      ["Sucre glace", 400],
      ["Poudre d'amandes", 150],
      ["Farine T55", 120],
      ["Miel d'acacia", 30],
      ["Framboises", 160],
    ],
    steps: [
      "Préparer l'appareil à financier comme la recette nature.",
      "Pocher 30 g par moule et enfoncer une framboise au centre.",
      "Cuire à 190 °C 11 min.",
    ].join("\n"),
  },
  {
    key: "croissants",
    name: "Croissants pur beurre",
    folder: "Viennoiserie",
    categories: ["Vitrine boutique"],
    tags: ["viennoiserie", "week-end"],
    favorite: true,
    rating: 5,
    yield: { count: 24, label: "croissants" },
    sale: { price: 1.3, vat: 5.5 },
    ingredients: [
      ["Détrempe", 0, "titre"],
      ["Farine T45", 1000],
      ["Sucre semoule", 120],
      ["Sel fin", 20],
      ["Levure boulangère", 40],
      ["Lait entier", 250],
      ["Eau", 280],
      ["Beurre doux", 50],
      ["Tourage", 0, "titre"],
      ["Beurre de tourage", 500],
      ["Dorure", 0, "titre"],
      ["Oeufs", 2, "pièce"],
    ],
    steps: [
      "# Détrempe",
      "Pétrir 4 min en 1re vitesse puis 6 min en 2e. La pâte doit être à 24 °C.",
      "Aplatir, filmer et bloquer 12 h au réfrigérateur.",
      "# Tourage",
      "Enfermer {500 g} de beurre de tourage, donner un tour double puis un tour simple, 30 min de repos entre chaque.",
      "Abaisser à 3,5 mm, détailler des triangles de 9 x 25 cm (60 g) et rouler.",
      "# Pousse et cuisson",
      "Pousser 2 h à 26 °C, dorer deux fois et cuire à 170 °C ventilé 16 min.",
    ].join("\n"),
    comments: ["Avec la hausse du beurre (+10 % en trois mois), le coût d'un croissant a pris presque 3 centimes."],
  },
  {
    key: "pains-chocolat",
    name: "Pains au chocolat",
    folder: "Viennoiserie",
    categories: ["Vitrine boutique", "Chocolat"],
    tags: ["viennoiserie", "week-end"],
    variantOf: { key: "croissants", note: "Même pâte, détaillée en rectangles avec deux bâtons de chocolat" },
    yield: { count: 24, label: "pains au chocolat" },
    sale: { price: 1.45, vat: 5.5 },
    ingredients: [
      ["Détrempe", 0, "titre"],
      ["Farine T45", 1000],
      ["Sucre semoule", 120],
      ["Sel fin", 20],
      ["Levure boulangère", 40],
      ["Lait entier", 250],
      ["Eau", 280],
      ["Beurre doux", 50],
      ["Tourage", 0, "titre"],
      ["Beurre de tourage", 500],
      ["Garniture", 0, "titre"],
      ["Bâtons chocolat", 48, "pièce"],
      ["Dorure", 0, "titre"],
      ["Oeufs", 2, "pièce"],
    ],
    steps: [
      "Préparer et tourer la pâte comme pour les croissants.",
      "Abaisser à 3,5 mm et détailler des rectangles de 8 x 15 cm.",
      "Rouler avec deux bâtons de chocolat, soudure dessous.",
      "Pousser 2 h à 26 °C, dorer et cuire à 170 °C ventilé 17 min.",
    ].join("\n"),
  },
  {
    key: "cookies",
    name: "Cookies chocolat noisette",
    folder: "Biscuits & goûters",
    categories: ["Vitrine boutique", "Goûter", "Chocolat"],
    tags: ["goûter"],
    rating: 4,
    yield: { count: 20, label: "cookies" },
    sale: { price: 2.5, vat: 5.5 },
    ingredients: [
      ["Beurre doux", 200],
      ["Cassonade", 200],
      ["Sucre semoule", 80],
      ["Oeufs", 2, "pièce"],
      ["Farine T55", 330],
      ["Levure chimique", 6],
      ["Fleur de sel", 4],
      ["Chocolat noir 64 %", 200],
      ["Noisettes torréfiées", 100],
    ],
    steps: [
      "Crémer le beurre avec la cassonade et le sucre.",
      "Ajouter les œufs, puis la farine, la levure et la fleur de sel.",
      "Incorporer le chocolat et les noisettes concassées.",
      "Bouler à 55 g, aplatir légèrement et cuire à 175 °C 11 min : le cœur doit rester tendre.",
    ].join("\n"),
  },
  {
    key: "madeleines",
    name: "Madeleines au miel",
    folder: "Biscuits & goûters",
    categories: ["Goûter"],
    tags: ["goûter", "petit four"],
    yield: { count: 30, label: "madeleines" },
    sale: { price: 0.9, vat: 5.5 },
    ingredients: [
      ["Oeufs", 4, "pièce"],
      ["Sucre semoule", 150],
      ["Miel d'acacia", 40],
      ["Farine T55", 200],
      ["Levure chimique", 8],
      ["Beurre doux", 200],
      ["Citrons jaunes", 1, "pièce"],
    ],
    steps: [
      "Blanchir les œufs avec le sucre et le miel.",
      "Ajouter la farine et la levure tamisées, le zeste de citron, puis le beurre fondu tiède.",
      "Repos 12 h au froid : c'est le choc thermique qui fait la bosse.",
      "Pocher aux trois quarts et cuire à 220 °C 4 min puis 190 °C 5 min.",
    ].join("\n"),
  },
];

// ─────────────────────────────────────────────
// Cahiers, listes de courses, fiche de production
// ─────────────────────────────────────────────

export type DemoCookbook = {
  name: string;
  description: string;
  /** Une entrée = un chapitre (titre + intro) ou une recette (clé). */
  entries: ({ chapter: string; intro?: string } | { recipe: string })[];
};

export const DEMO_COOKBOOKS: DemoCookbook[] = [
  {
    name: "Carte boutique — automne",
    description: "Les produits de la vitrine, avec leurs bases, pour l'équipe de vente et de production.",
    entries: [
      { chapter: "Viennoiseries", intro: "Cuites chaque matin à partir de 6 h." },
      { recipe: "croissants" },
      { recipe: "pains-chocolat" },
      { chapter: "Petits gâteaux" },
      { recipe: "tarte-citron" },
      { recipe: "eclair" },
      { recipe: "paris-brest" },
      { recipe: "verrine" },
      { chapter: "Entremets" },
      { recipe: "royal" },
      { chapter: "Goûter" },
      { recipe: "financiers" },
      { recipe: "cookies" },
    ],
  },
  {
    name: "Fiches techniques apprentis",
    description: "Les bases de l'atelier à connaître par cœur.",
    entries: [
      { recipe: "pate-sucree" },
      { recipe: "pate-choux" },
      { recipe: "creme-patissiere" },
      { recipe: "creme-amande" },
      { recipe: "meringue-italienne" },
      { recipe: "mousse-chocolat" },
    ],
  },
];

export const DEMO_SHOPPING_LISTS = [
  {
    name: "Production du samedi",
    recipes: [
      { recipe: "croissants", coef: 2 },
      { recipe: "eclair", coef: 2 },
      { recipe: "financiers", coef: 2 },
      { recipe: "tarte-citron", coef: 2 },
    ],
    manual: [
      { name: "Boîtes pâtissières 18 x 18", qty: 30, unit: "pièce", checked: false },
      { name: "Sacs kraft viennoiserie", qty: 200, unit: "pièce", checked: true },
    ],
  },
  {
    name: "Réassort épicerie",
    recipes: [],
    manual: [
      { name: "Fécule de maïs", qty: 2000, unit: null, checked: true },
      { name: "Pectine NH", qty: 1000, unit: null, checked: false },
      { name: "Gousses de vanille", qty: 50, unit: "pièce", checked: false },
      { name: "Papier cuisson (rouleau)", qty: 2, unit: "pièce", checked: false },
    ],
  },
];

/** Fiche de production : nombre de pièces pour une recette à rendement, sinon multiplicateur. */
export const DEMO_PRODUCTION = [
  { recipe: "croissants", amount: 48 },
  { recipe: "pains-chocolat", amount: 48 },
  { recipe: "eclair", amount: 40 },
  { recipe: "tarte-citron", amount: 20 },
  { recipe: "financiers", amount: 80 },
  { recipe: "royal", amount: 3 },
];
