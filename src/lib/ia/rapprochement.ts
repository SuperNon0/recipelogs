/**
 * Rapprocher ce qu'une IA lit sur une facture de ce qui existe déjà dans RecipeLog.
 *
 * Une facture écrit « CREME LIQ.35%MG 1L BAIGNES UHT FR » ; le produit enregistré
 * s'appelle « Crème liquide 35% MG 1 L Baignes UHT France ». Sans rapprochement,
 * la ligne créait un deuxième produit (le doublon que Noë voyait). Ici :
 * - `joliNom` : un nom TOUT EN MAJUSCULES devient « Crème liquide 35% MG 1 L… » ;
 * - `produitProche` : retrouve le produit existant (référence, même nom, ou nom proche
 *   malgré les abréviations, les majuscules et les accents), sans confondre ce qui
 *   change la recette (chocolat 64 % / 70 %, farine T45 / T55, sac 5 kg / 25 kg) ;
 * - `articleExistant` : « Fraises » ou « crème 35% » reprennent l'article déjà écrit
 *   « Fraise » / « Crème 35 % » ;
 * - `cleFournisseur` : « RIBERA ET FILS SAS » = « Ribera et Fils ».
 * Sans base de données : utilisé à l'écran de vérification, au serveur et dans les tests.
 */
import { articleKey } from "@/lib/suppliers";

// ─────────────────────────────────────────────
// Nom lisible
// ─────────────────────────────────────────────

/** Sigles gardés en majuscules. */
const SIGLES = new Set(["UHT", "AOP", "AOC", "IGP", "PNE", "MG", "IQF", "AB", "UE", "DLC", "DDM", "MSC", "BBC", "PET", "PP", "PS", "PLA", "XXL", "XL", "XS", "HT", "TTC", "I", "II", "III", "IV"]);
/** Pays et régions d'origine : une majuscule. */
const LIEUX = new Set([
  "france", "espagne", "italie", "maroc", "belgique", "portugal", "allemagne", "pays-bas", "hollande", "perou", "pérou",
  "chili", "bresil", "brésil", "equateur", "équateur", "colombie", "mexique", "turquie", "grece", "grèce", "tunisie",
  "israel", "israël", "afrique", "sicile", "bretagne", "normandie", "provence", "corse", "madagascar", "vietnam", "inde",
  "costa", "rica", "kenya", "senegal", "sénégal", "argentine", "usa", "canada", "suisse", "pologne",
]);

const PAYS_ABREGES: Record<string, string> = { fr: "France", esp: "Espagne", ita: "Italie", mar: "Maroc", bel: "Belgique", port: "Portugal" };

/** Le texte est-il crié (presque toutes ses lettres en majuscules) ? */
export function estEnMajuscules(t: string): boolean {
  const lettres = t.match(/\p{L}/gu) ?? [];
  if (lettres.length < 4) return false;
  const maj = lettres.filter((c) => c !== c.toLowerCase()).length;
  return maj / lettres.length > 0.75;
}

/**
 * « CREME LIQ.35%MG 1L BAIGNES UHT FR » → « Creme liq.35%MG 1 L baignes UHT fr ».
 * Ne touche pas un nom déjà écrit normalement (« Chocolat noir Guanaja 70% »).
 */
export function joliNom(t: string): string {
  const s = t.replace(/\s+/g, " ").trim();
  if (!estEnMajuscules(s)) return s;
  const mots = s.split(" ").map((m) => {
    const nu = m.replace(/[^\p{L}]/gu, "");
    if (nu && SIGLES.has(nu) && nu === m.replace(/[^\p{L}]/gu, "").toUpperCase()) return m.replace(/\p{L}+/gu, (x) => (SIGLES.has(x) ? x : x.toLowerCase()));
    const bas = m.toLowerCase();
    // « FR », « ESP » en fin de désignation : le pays d'origine en entier.
    const pays = PAYS_ABREGES[bas];
    if (pays) return pays;
    if (LIEUX.has(bas.replace(/[^\p{L}-]/gu, ""))) return bas.charAt(0).toUpperCase() + bas.slice(1);
    return bas.replace(/%mg\b/g, "%MG");
  });
  let r = mots.join(" ");
  // « 1l », « 5kg », « 500gr » → « 1 L », « 5 kg », « 500 g ».
  r = r.replace(/(\d)\s*(kgs?|grs?|g|cl|ml|l|litres?)\b/gi, (_, d: string, u: string) => {
    const x = u.toLowerCase();
    const unite = x.startsWith("kg") ? "kg" : x.startsWith("g") ? "g" : x === "cl" ? "cl" : x === "ml" ? "ml" : "L";
    return `${d} ${unite}`;
  });
  // Types de farine : « T55 ».
  r = r.replace(/\bt(\d{2,3})\b/g, "T$1");
  return r.charAt(0).toUpperCase() + r.slice(1);
}

// ─────────────────────────────────────────────
// Comparer deux noms de produit
// ─────────────────────────────────────────────

/** Abréviations courantes des factures de grossistes. */
const ABREV: Record<string, string> = {
  liq: "liquide", choc: "chocolat", choco: "chocolat", chocol: "chocolat", nois: "noisette", amd: "amande", amand: "amande",
  ent: "entier", entr: "entier", demi: "demi", ecr: "ecreme", past: "pasteurise", surg: "surgele", surgel: "surgele", cgl: "congele",
  cong: "congele", sach: "sachet", sac: "sac", bte: "boite", bt: "boite", crt: "carton", ctn: "carton", cart: "carton",
  pce: "piece", pces: "piece", pc: "piece", pcs: "piece", pieces: "piece", bq: "barquette", barq: "barquette", fr: "france",
  esp: "espagne", ita: "italie", mar: "maroc", cat: "categorie", nat: "nature", gr: "g", grs: "g", gramme: "g", grammes: "g",
  kgs: "kg", kilo: "kg", ltr: "l", lt: "l", litre: "l", litres: "l", fl: "fleur", farin: "farine", sucr: "sucre", poud: "poudre",
  pdre: "poudre", cr: "creme", crm: "creme", frs: "frais", fraich: "frais", fraiche: "frais", blc: "blanc", blan: "blanc",
  nr: "noir", vanil: "vanille", van: "vanille", conf: "confiture", pur: "pur", bre: "beurre", beur: "beurre", oeufs: "oeuf",
  fraises: "fraise", framb: "framboise", framboises: "framboise", citrons: "citron", tomates: "tomate",
};
/** Petits mots sans intérêt pour comparer. */
const VIDES = new Set(["de", "du", "des", "la", "le", "les", "d", "l'", "et", "a", "au", "aux", "en", "avec", "pour", "sur", "x", "un", "une"]);

/** Mots d'un nom de produit, à plat : sans accents ni majuscules, abréviations développées, chiffres séparés. */
export function motsProduit(nom: string): string[] {
  const t = articleKey(nom)
    .replace(/(\d)[.,](\d)/g, "$1·$2") // garde « 2,5 » entier
    .replace(/[’']/g, " ")
    .replace(/(\d)\s*%/g, "$1% ")
    .replace(/\bt\s?(\d{2,3})\b/g, " t$1 ")
    .replace(/(\d)(?=[a-z])/g, "$1 ")
    .replace(/([a-z]{2,})(?=\d)/g, "$1 ")
    .replace(/\bx(?=\d)/g, "x ")
    .replace(/[^a-z0-9%·\s]+/g, " ");
  return t
    .split(/\s+/)
    .filter(Boolean)
    .map((m) => ABREV[m] ?? m)
    .map((m) => m.replace(/·/g, "."))
    .filter((m) => !VIDES.has(m));
}

const estNombre = (m: string) => /^\d/.test(m);
/** Ce qui change la recette ou le produit : les %, les types de farine (T45) et les nombres (poids, volume, calibre). */
const reperes = (mots: string[]) => mots.filter((m) => estNombre(m) || /^t\d{2,3}$/.test(m));

/** Deux mots se valent : identiques, ou l'un abrège l'autre (« nois » / « noisette », 3 lettres au moins). */
function memeMot(a: string, b: string): boolean {
  if (a === b) return true;
  if (estNombre(a) || estNombre(b)) return false;
  const [c, l] = a.length <= b.length ? [a, b] : [b, a];
  if (c.length >= 3 && l.startsWith(c)) return true;
  // Pluriel : « fraises » / « fraise ».
  return c.length >= 4 && l === `${c}s`;
}

/**
 * Ressemblance de deux noms de produit, de 0 à 1 (1 = mêmes mots). 0 quand un
 * repère diffère (64 % / 70 %, T45 / T55, 1 kg / 5 kg) ou quand le premier mot
 * (le produit lui-même : « Crème », « Farine ») n'est pas le même.
 */
export function ressemblance(a: string, b: string): number {
  const A = motsProduit(a);
  const B = motsProduit(b);
  if (!A.length || !B.length) return 0;
  const premierA = A.find((m) => !estNombre(m));
  const premierB = B.find((m) => !estNombre(m));
  if (!premierA || !premierB || !memeMot(premierA, premierB)) return 0;
  // Repères : ceux du nom qui en a le moins doivent tous se retrouver dans l'autre.
  const rA = reperes(A);
  const rB = reperes(B);
  const [petit, grand] = rA.length <= rB.length ? [rA, rB] : [rB, rA];
  const reste = [...grand];
  for (const r of petit) {
    const i = reste.indexOf(r);
    if (i < 0) return 0;
    reste.splice(i, 1);
  }
  // Mots en commun, chacun compté une fois.
  const libres = [...B];
  let communs = 0;
  for (const m of A) {
    const i = libres.findIndex((x) => memeMot(m, x));
    if (i >= 0) {
      communs++;
      libres.splice(i, 1);
    }
  }
  return (2 * communs) / (A.length + B.length);
}

/** À partir de là, deux noms désignent le même produit. */
export const SEUIL_PROCHE = 0.6;

export type ProduitConnu = { nom: string; reference: string | null; unite?: string | null };
export type Rapprochement<T extends ProduitConnu> = { produit: T; par: "reference" | "nom" | "proche"; score: number };

/**
 * Le produit déjà enregistré chez ce fournisseur qui correspond à la ligne :
 * même référence, même nom (sans majuscules ni accents) ou nom proche.
 * Une référence différente de celle du produit écarte le rapprochement par le nom proche.
 */
export function produitProche<T extends ProduitConnu>(
  ligne: { produit: string; reference: string | null },
  connus: readonly T[],
): Rapprochement<T> | null {
  const ref = ligne.reference?.trim() || null;
  if (ref) {
    const p = connus.find((c) => c.reference?.trim() === ref);
    if (p) return { produit: p, par: "reference", score: 1 };
  }
  const cle = articleKey(ligne.produit);
  if (!cle) return null;
  const meme = connus.find((c) => articleKey(c.nom) === cle);
  if (meme) return { produit: meme, par: "nom", score: 1 };
  let best: Rapprochement<T> | null = null;
  for (const c of connus) {
    if (ref && c.reference?.trim() && c.reference.trim() !== ref) continue;
    const s = ressemblance(ligne.produit, c.nom);
    if (s < SEUIL_PROCHE) continue;
    // À ressemblance proche, le produit écrit normalement l'emporte sur un ancien doublon en majuscules.
    const note = s - (estEnMajuscules(c.nom) ? 0.15 : 0);
    const noteBest = best ? best.score - (estEnMajuscules(best.produit.nom) ? 0.15 : 0) : -1;
    if (note > noteBest) best = { produit: c, par: "proche", score: s };
  }
  return best;
}

// ─────────────────────────────────────────────
// Articles et fournisseurs
// ─────────────────────────────────────────────

/** « Crème 35% », « crème 35 % », « Crèmes 35 % » : même clé. */
export function cleArticle(a: string): string {
  return articleKey(a)
    .replace(/\s*%/g, " %")
    .replace(/[.,;:!?()"]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((m) => (m.length > 3 ? m.replace(/(s|x)$/, "") : m))
    .join(" ");
}

/** L'article déjà utilisé qui s'écrit presque pareil (pluriel, accent, majuscule, espace avant %), sinon null. */
export function articleExistant(article: string | null | undefined, existants: readonly string[]): string | null {
  const cle = article?.trim() ? cleArticle(article) : "";
  if (!cle) return null;
  return existants.find((a) => cleArticle(a) === cle) ?? null;
}

/** « RIBERA SAS » et « Ribera » : même nom une fois retirés la casse, les accents, la ponctuation et la forme de société. */
export function cleFournisseur(nom: string): string {
  return articleKey(nom)
    .replace(/[.,;:'’()&/-]+/g, " ")
    .replace(/\b(sas|sasu|sarl|sa|eurl|sci|snc|ets|etablissements|societe|ste|et fils|france)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Le fournisseur déjà enregistré dont le nom correspond (même nom ou nom proche), sinon null. */
export function fournisseurExistant(nom: string | null | undefined, existants: readonly string[]): string | null {
  const n = nom?.trim();
  if (!n) return null;
  const exact = existants.find((s) => s.trim().toLowerCase() === n.toLowerCase());
  if (exact) return exact;
  const cle = cleFournisseur(n);
  return cle ? (existants.find((s) => cleFournisseur(s) === cle) ?? null) : null;
}

// ─────────────────────────────────────────────
// Doublons déjà enregistrés
// ─────────────────────────────────────────────

export type ProduitDoublon = { id: number; name: string; reference: string | null; priceUnit: string; lignes: number };
export type GroupeDoublons<T extends ProduitDoublon> = { garder: T; doublons: T[] };

/**
 * Produits d'un même fournisseur qui sont en fait le même (« CREME LIQ.35%MG 1L »
 * créé par une lecture IA à côté de « Crème liquide 35% MG 1 L »). On garde le nom
 * écrit normalement, sinon celui qui a le plus de prix, sinon le plus ancien.
 * Même unité de prix seulement, et deux références différentes ne se fusionnent jamais.
 */
export function doublonsProduits<T extends ProduitDoublon>(produits: readonly T[]): GroupeDoublons<T>[] {
  const ordre = [...produits].sort(
    (a, b) => Number(estEnMajuscules(a.name)) - Number(estEnMajuscules(b.name)) || b.lignes - a.lignes || a.id - b.id,
  );
  const pris = new Set<number>();
  const groupes: GroupeDoublons<T>[] = [];
  for (const g of ordre) {
    if (pris.has(g.id)) continue;
    const doublons = ordre.filter(
      (p) =>
        p.id !== g.id &&
        !pris.has(p.id) &&
        p.priceUnit === g.priceUnit &&
        !(p.reference?.trim() && g.reference?.trim() && p.reference.trim() !== g.reference.trim()) &&
        (articleKey(p.name) === articleKey(g.name) || ressemblance(p.name, g.name) >= SEUIL_PROCHE),
    );
    if (!doublons.length) continue;
    pris.add(g.id);
    for (const d of doublons) pris.add(d.id);
    groupes.push({ garder: g, doublons });
  }
  return groupes.sort((a, b) => a.garder.name.localeCompare(b.garder.name, "fr"));
}
