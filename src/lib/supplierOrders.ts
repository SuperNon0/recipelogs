/**
 * Commandes aux fournisseurs : calculs sans base de données (conditionnement
 * commandé, unités proposées, prix estimé, texte pour le commercial,
 * regroupements proposés). Utilisable côté client. Testé dans
 * tests/supplierOrders.test.ts.
 */
import { articleKey } from "./suppliers";

/** Conditionnements proposés quand on modifie un produit (on peut en écrire d'autres). */
export const PACK_NAMES = ["carton", "sac", "colis", "seau", "boîte", "bidon", "bouteille", "barquette", "plaque", "sachet", "pot", "pièce", "kg", "L"] as const;

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Mot écrit dans la désignation → conditionnement commandé.
const PACK_WORDS: [RegExp, string][] = [
  [/\b(carton|cartons|crt|ctn|ct)\b/, "carton"],
  [/\b(sac|sacs)\b/, "sac"],
  [/\b(seau|seaux)\b/, "seau"],
  [/\b(bidon|bidons)\b/, "bidon"],
  [/\b(bouteille|bouteilles|btl|bt)\b/, "bouteille"],
  [/\b(boite|boites|bte)\b/, "boîte"],
  [/\b(barquette|barquettes|barq|bq)\b/, "barquette"],
  [/\b(plaque|plaques)\b/, "plaque"],
  [/\b(sachet|sachets)\b/, "sachet"],
  [/\b(pot|pots)\b/, "pot"],
  [/\b(colis)\b/, "colis"],
];

/**
 * Ce qu'on commande pour ce produit : le conditionnement choisi, sinon celui
 * qu'on lit dans la désignation (« sac 25 kg » → sac), sinon « colis » quand
 * il y a une contenance, sinon l'unité du prix (kg, L, pièce).
 */
export function packNameOf(p: { name: string; packName?: string | null; packSize?: number | null; priceUnit: string }): string {
  if (p.packName?.trim()) return p.packName.trim();
  const n = ` ${plain(p.name)} `;
  for (const [re, word] of PACK_WORDS) if (re.test(n)) return word;
  if (p.packSize != null && p.packSize > 1) return p.priceUnit === "pièce" ? "carton" : "colis";
  return p.priceUnit;
}

/** Unités proposées dans la commande : le conditionnement d'abord, puis l'unité du prix si elle est différente. */
export function orderUnits(p: { name: string; packName?: string | null; packSize?: number | null; priceUnit: string }): string[] {
  const first = packNameOf(p);
  return first === p.priceUnit ? [first] : [first, p.priceUnit];
}

/** Prix estimé d'une unité commandée (un carton, un kg…) d'après le dernier prix connu. */
export function unitEstimate(
  p: { name: string; packName?: string | null; packSize?: number | null; priceUnit: string; price?: number | null },
  unit: string,
): number | null {
  if (p.price == null || !(p.price > 0)) return null;
  if (unit === p.priceUnit) return p.price;
  if (unit === packNameOf(p)) return p.price * (p.packSize != null && p.packSize > 0 ? p.packSize : 1);
  return null;
}

const INVARIABLE = new Set(["kg", "g", "l", "cl", "ml", "colis"]);

/** « 2 cartons », « 1 sac », « 3 kg », « 2 colis », « 1,5 kg ». */
export function qtyLabel(quantity: number, unit: string): string {
  const q = quantity.toLocaleString("fr-FR", { maximumFractionDigits: 3 }).replace(/[  ]/g, " ");
  const u = unit.trim();
  if (quantity < 2 || INVARIABLE.has(u.toLowerCase()) || /[sx]$/i.test(u) || u.includes(" ")) return `${q} ${u}`;
  return `${q} ${/eau$/i.test(u) ? `${u}x` : `${u}s`}`;
}

export type OrderTextLine = { label: string; reference?: string | null; quantity: number; unit: string };

const frDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
};

/** Texte à coller dans un message au commercial. */
export function orderText(o: {
  supplier: string;
  /** Nom de l'entreprise qui signe le message (« Maison Chanka »). */
  signature?: string | null;
  deliveryDate?: string | null;
  note?: string | null;
  lines: OrderTextLine[];
}): string {
  const head = [
    "Bonjour,",
    "",
    `Voici ma commande${o.deliveryDate ? `, à livrer le ${frDate(o.deliveryDate)}` : ""} :`,
  ];
  const lines = o.lines.map((l) => `- ${qtyLabel(l.quantity, l.unit)} : ${l.label}${l.reference?.trim() ? ` (réf. ${l.reference.trim()})` : ""}`);
  const tail = [...(o.note?.trim() ? ["", o.note.trim()] : []), "", "Merci !", ...(o.signature?.trim() ? [o.signature.trim()] : [])];
  return [...head, ...lines, ...tail].join("\n");
}

// ─────────────────────────────────────────────
// Regroupements proposés
// ─────────────────────────────────────────────

// Premiers mots qui ne disent pas ce qu'est le produit.
const VAGUE = new Set([
  "sac", "carton", "boite", "bte", "seau", "bidon", "pot", "lot", "colis", "barquette", "plaque", "sachet", "bouteille",
  "pate", "pates", "creme", "le", "la", "les", "de", "du", "des", "mini", "petit", "petite", "gros", "grand", "grande",
  "pur", "bio", "extra", "surgele", "surgeles", "frais", "fraiche",
]);

export type GroupSuggestion = {
  /** Nom proposé pour l'article qui regroupe (« Croissant »). */
  article: string;
  products: { id: number; name: string }[];
};

/**
 * Produits sans article dont la désignation commence par le même mot
 * (« Croissant pur beurre », « Croissant margarine » → « Croissant »).
 * Ce n'est qu'une proposition : l'utilisateur coche ce qu'il garde.
 * Les produits déjà rangés sous un article ne sont pas proposés.
 */
export function suggestGroups(products: { id: number; name: string; article?: string | null }[]): GroupSuggestion[] {
  const by = new Map<string, { word: string; products: { id: number; name: string }[] }>();
  for (const p of products) {
    if (p.article?.trim()) continue;
    const words = p.name.trim().split(/[\s,/()-]+/).filter(Boolean);
    const first = words.find((w) => !VAGUE.has(plain(w)) && /\p{L}{3,}/u.test(w));
    if (!first) continue;
    const key = articleKey(first).replace(/s$/, "");
    if (key.length < 4) continue;
    const g = by.get(key) ?? { word: first, products: [] };
    g.products.push({ id: p.id, name: p.name });
    by.set(key, g);
  }
  // Ce qui change la recette ne se regroupe pas : chocolat 64 % / 35 %, farine T45 / T55, crème 30 % / 35 %.
  const marks = (name: string) => [...plain(name).matchAll(/(\d+(?:[.,]\d+)?)\s*%|\bt\s?(\d{2,3})\b/g)].map((m) => m[0].replace(/\s/g, "")).sort().join("|");
  return [...by.values()]
    .filter((g) => g.products.length >= 2 && new Set(g.products.map((p) => marks(p.name))).size === 1)
    .map((g) => {
      const w = g.word.replace(/s$/i, "");
      return { article: w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(), products: g.products.sort((a, b) => a.name.localeCompare(b.name, "fr")) };
    })
    .sort((a, b) => a.article.localeCompare(b.article, "fr"));
}
