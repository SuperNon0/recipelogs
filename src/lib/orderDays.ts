/**
 * Jours de commande et de livraison d'un fournisseur, et rappel
 * « À commander aujourd'hui ». Les jours sont gardés en texte « 1,3,5 »
 * (1 = lundi … 7 = dimanche) dans suppliers.order_days / delivery_days.
 */

export const JOURS = [
  { n: 1, court: "Lun", nom: "lundi" },
  { n: 2, court: "Mar", nom: "mardi" },
  { n: 3, court: "Mer", nom: "mercredi" },
  { n: 4, court: "Jeu", nom: "jeudi" },
  { n: 5, court: "Ven", nom: "vendredi" },
  { n: 6, court: "Sam", nom: "samedi" },
  { n: 7, court: "Dim", nom: "dimanche" },
] as const;

/** Fuseau des clients : les jours se comptent à l'heure française, pas à celle du serveur. */
export const FUSEAU = "Europe/Paris";

/** « 1,3,5 » → [1, 3, 5] (triés, sans doublon, seulement 1 à 7). */
export function parseJours(v: string | null | undefined): number[] {
  if (!v) return [];
  const set = new Set<number>();
  for (const x of v.split(/[^0-9]+/)) {
    const n = Number(x);
    if (Number.isInteger(n) && n >= 1 && n <= 7) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

/** [5, 1, 3] → « 1,3,5 », ou null si aucun jour. */
export function serialiseJours(jours: Iterable<number | string> | null | undefined): string | null {
  if (!jours) return null;
  const list = parseJours([...jours].map((j) => (typeof j === "number" ? String(j) : String(jourDepuisTexte(j) ?? ""))).join(","));
  return list.length ? list.join(",") : null;
}

/** « lundi », « Lun », « 1 » → 1. */
export function jourDepuisTexte(t: string): number | null {
  const s = t.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/^[1-7]$/.test(s)) return Number(s);
  const j = JOURS.find((x) => x.nom.startsWith(s.slice(0, 3)) && s.length >= 3);
  return j ? j.n : null;
}

/** [1, 3, 5] → « lundi, mercredi et vendredi » ; les 6 jours sauf dimanche → « tous les jours sauf le dimanche ». */
export function joursEnTexte(jours: number[]): string {
  if (!jours.length) return "";
  if (jours.length === 7) return "tous les jours";
  if (jours.length === 6) {
    const manque = JOURS.find((j) => !jours.includes(j.n))!;
    return `tous les jours sauf le ${manque.nom}`;
  }
  const noms = jours.map((n) => JOURS[n - 1].nom);
  return noms.length === 1 ? `le ${noms[0]}` : `${noms.slice(0, -1).join(", ")} et ${noms[noms.length - 1]}`;
}

/** Jour de la semaine (1 = lundi … 7 = dimanche) et date AAAA-MM-JJ, à l'heure française. */
export function aujourdHui(now: Date = new Date()): { jour: number; date: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return { jour: wd || 1, date: `${get("year")}-${get("month")}-${get("day")}` };
}

/** Prochain jour de livraison après `jour` (strictement après), ou null. Renvoie aussi l'écart en jours. */
export function prochaineLivraison(jour: number, livraisons: number[]): { jour: number; dans: number } | null {
  if (!livraisons.length) return null;
  for (let d = 1; d <= 7; d++) {
    const j = ((jour - 1 + d) % 7) + 1;
    if (livraisons.includes(j)) return { jour: j, dans: d };
  }
  return null;
}

/** « demain », « mardi », « lundi prochain » pour une livraison dans `dans` jours. */
export function quandLivre(l: { jour: number; dans: number }): string {
  if (l.dans === 1) return "demain";
  if (l.dans === 7) return `${JOURS[l.jour - 1].nom} prochain`;
  return JOURS[l.jour - 1].nom;
}

export type RappelCommande = {
  id: number;
  name: string;
  /** Livraison qui suit, en texte (« demain », « mardi »), si les jours de livraison sont réglés. */
  livraison: string | null;
  /** Une commande a déjà été passée aujourd'hui dans RecipeLog. */
  commandee: boolean;
};

/**
 * Fournisseurs à qui commander aujourd'hui, d'après leurs jours de commande.
 * `commandesDuJour` = ids des fournisseurs qui ont déjà une commande à la date du jour.
 */
export function rappelsDuJour(
  fournisseurs: { id: number; name: string; orderDays: string | null; deliveryDays: string | null }[],
  commandesDuJour: Iterable<number>,
  jour: number,
): RappelCommande[] {
  const faites = new Set(commandesDuJour);
  return fournisseurs
    .filter((f) => parseJours(f.orderDays).includes(jour))
    .map((f) => {
      const l = prochaineLivraison(jour, parseJours(f.deliveryDays));
      return { id: f.id, name: f.name, livraison: l ? quandLivre(l) : null, commandee: faites.has(f.id) };
    })
    .sort((a, b) => Number(a.commandee) - Number(b.commandee) || a.name.localeCompare(b.name, "fr"));
}
