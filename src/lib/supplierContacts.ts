/**
 * Numéros à appeler chez un fournisseur (commercial, standard, livreur…).
 * Gardés en JSON dans suppliers.contacts : [{ nom, tel }].
 */

export type Contact = { nom: string; tel: string };

/** Au plus 10 numéros par fournisseur. */
export const MAX_CONTACTS = 10;

/** Ce qui est gardé en base → liste propre (ignore ce qui n'est pas un numéro). */
export function contactsDepuisJson(v: unknown): Contact[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((c) => (c && typeof c === "object" ? (c as Record<string, unknown>) : null))
    .filter((c): c is Record<string, unknown> => !!c)
    .map((c) => ({ nom: typeof c.nom === "string" ? c.nom : "", tel: typeof c.tel === "string" ? c.tel : "" }))
    .filter((c) => c.tel.trim());
}

/** Nettoie ce qui est tapé : enlève les lignes sans numéro, coupe les textes trop longs. Erreur si un numéro n'en est pas un. */
export function nettoieContacts(list: { nom?: string | null; tel?: string | null }[] | null | undefined): Contact[] {
  const out: Contact[] = [];
  for (const c of list ?? []) {
    const tel = (c.tel ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    const nom = (c.nom ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (!tel) continue;
    if (!/^\+?[0-9 ().\-/]{4,}$/.test(tel) || telLien(tel).replace(/\D/g, "").length < 4) {
      throw new Error(`« ${tel} » n'est pas un numéro de téléphone.`);
    }
    out.push({ nom, tel });
  }
  if (out.length > MAX_CONTACTS) throw new Error(`${MAX_CONTACTS} numéros au plus par fournisseur.`);
  return out;
}

/** « 06 12 34 56 78 » → « 0612345678 » pour un lien tel: (le + international est gardé). */
export function telLien(tel: string): string {
  const t = tel.trim();
  return (t.startsWith("+") ? "+" : "") + t.replace(/\D/g, "");
}
