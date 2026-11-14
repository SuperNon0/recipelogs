/**
 * Import d'une mercuriale (liste de prix d'un fournisseur) en Excel ou CSV :
 * lecture du tableau, colonnes devinées d'après les titres, puis lignes de
 * prix à vérifier. Le PDF et les photos passent par la lecture IA. Sans base
 * de données ni fichier (utilisable côté client) ; lecture du fichier dans
 * mercurialeFichier.ts. Testé dans tests/mercuriale.test.ts.
 */
import type { PriceUnit } from "@/lib/cost";
import { nombre, type LigneLue } from "@/lib/ia/document";


// ─────────────────────────────────────────────
// Colonnes
// ─────────────────────────────────────────────

export const ROLES = ["produit", "reference", "prix", "prixColis", "contenance", "unite", "famille"] as const;
export type Role = (typeof ROLES)[number];
export type Colonnes = Partial<Record<Role, number>>;

export const NOMS_ROLES: Record<Role, string> = {
  produit: "Produit",
  reference: "Référence",
  prix: "Prix au kg / L / pièce",
  prixColis: "Prix du colis",
  contenance: "Contenance du colis",
  unite: "Unité",
  famille: "Famille",
};

const sansAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const MOTIFS: [Role, RegExp][] = [
  ["reference", /^(ref|reference|code|code article|ean|gencod|sku|art\.?)\b|\bref\b/],
  ["prixColis", /prix.*(colis|carton|uvc|lot|cond)|(colis|carton).*prix|prix.*unite de vente/],
  ["prix", /prix|tarif|p\.?\s?u\b|€|eur\b|ht\b/],
  ["contenance", /contenance|conditionnement|colisage|\bcdt\b|\bcond\b|poids|volume|\bpcb\b/],
  ["unite", /^unite|^unit|^u\b|udv|unite de prix/],
  ["famille", /famille|rayon|categorie|gamme/],
  ["produit", /designation|libelle|produit|article|description|^nom\b|denomination/],
];

/** Ligne des titres : la première qui contient un titre de produit ou de prix. */
export function ligneEntete(lignes: string[][]): number {
  for (let i = 0; i < Math.min(lignes.length, 30); i++) {
    const t = lignes[i].map(sansAccents);
    if (t.some((c) => /designation|libelle|produit|article|description/.test(c)) && t.some((c) => /prix|tarif|€/.test(c))) return i;
  }
  return 0;
}

export function devinerColonnes(entete: string[]): Colonnes {
  const res: Colonnes = {};
  const prises = new Set<number>();
  for (const [role, motif] of MOTIFS) {
    const i = entete.findIndex((c, j) => !prises.has(j) && motif.test(sansAccents(c)));
    if (i >= 0) {
      res[role] = i;
      prises.add(i);
    }
  }
  return res;
}

// ─────────────────────────────────────────────
// Lignes de prix
// ─────────────────────────────────────────────

/** « 25 kg » → 25 kg ; « 500 g » → 0,5 kg ; « 75 cl » → 0,75 L ; « x 50 » → 50 pièces. */
export function lireContenance(v: string): { valeur: number; unite: PriceUnit | null } | null {
  const t = sansAccents(v).replace(/\s+/g, "");
  const m = t.match(/^(?:x)?(\d+(?:[.,]\d+)?)(kg|g|l|cl|ml|pc|pce|pces|pieces?|u|x)?/) ?? t.match(/^x(\d+)/);
  if (!m) return null;
  const n = nombre(m[1]);
  if (n == null || n <= 0) return null;
  const u = m[2] ?? (t.startsWith("x") ? "x" : "");
  if (u === "g") return { valeur: n / 1000, unite: "kg" };
  if (u === "kg") return { valeur: n, unite: "kg" };
  if (u === "cl") return { valeur: n / 100, unite: "L" };
  if (u === "ml") return { valeur: n / 1000, unite: "L" };
  if (u === "l") return { valeur: n, unite: "L" };
  if (u) return { valeur: n, unite: "pièce" };
  return { valeur: n, unite: null };
}

function uniteTexte(v: string): PriceUnit | null {
  const t = sansAccents(v).replace(/[^a-z]/g, "");
  if (!t) return null;
  if (t === "kg" || t === "kilo" || t === "k") return "kg";
  if (t === "l" || t === "litre" || t === "lt") return "L";
  if (/^(p|pc|pce|piece|u|un|unite|colis|ct|carton|bt|boite|botte|barq|bq|sac|pot|plateau|sachet|lot|douz)/.test(t)) return "pièce";
  return null;
}

export function lignesDepuisTableau(lignes: string[][], entete: number, col: Colonnes, uniteParDefaut: PriceUnit = "kg"): LigneLue[] {
  if (col.produit == null || (col.prix == null && col.prixColis == null)) return [];
  const cell = (l: string[], r: Role) => (col[r] != null ? (l[col[r]!] ?? "") : "");
  const res: LigneLue[] = [];
  for (const l of lignes.slice(entete + 1)) {
    const produit = cell(l, "produit");
    const prix = nombre(cell(l, "prix"));
    const prixColis = nombre(cell(l, "prixColis"));
    if (!produit || (prix == null && prixColis == null)) continue;
    const cont = cell(l, "contenance") ? lireContenance(cell(l, "contenance")) : null;
    const unite = uniteTexte(cell(l, "unite")) ?? cont?.unite ?? uniteParDefaut;
    res.push({
      produit: produit.slice(0, 200),
      reference: cell(l, "reference").slice(0, 100) || null,
      article: null,
      famille: cell(l, "famille").slice(0, 100) || null,
      quantite: null,
      contenance: cont?.valeur ?? null,
      unite,
      prixUnitaire: prix,
      prixColis,
      montant: null,
      aVerifier: null,
    });
  }
  return res;
}
