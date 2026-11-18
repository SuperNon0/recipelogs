/**
 * Envoi des documents (factures, mercuriales) en texte base64.
 *
 * Pourquoi : le pare-feu de Cloudflare (règles gérées) lit le contenu des
 * envois et bloque parfois un PDF ou une photo tout à fait normal, parce
 * qu'une suite d'octets de l'image ressemble par hasard à une attaque. Le
 * navigateur reçoit alors une page « Attention Required! | Cloudflare » au
 * lieu de la réponse du site, et RecipeLog affiche « L'envoi n'a pas
 * marché ». Vu le 2026-11-18 sur une mercuriale PDF de 4 Mo.
 *
 * En base64, le fichier n'est plus que des lettres, chiffres, « + », « / »
 * et « = » : les règles du pare-feu n'y trouvent plus rien. Le serveur le
 * remet en fichier avec `deballerFichier` (qui accepte aussi un fichier
 * envoyé normalement). Coût : le fichier pèse un tiers de plus pendant
 * l'envoi.
 *
 * Format : « RLB64.<nom en base64>.<type en base64>.<contenu en base64> ».
 */
const PREFIXE = "RLB64.";

function b64Texte(s: string): string {
  const octets = new TextEncoder().encode(s);
  let bin = "";
  for (const o of octets) bin += String.fromCharCode(o);
  return btoa(bin);
}

/** Navigateur : le fichier en texte base64, prêt à mettre dans un FormData. */
export function emballerFichier(f: File): Promise<string> {
  return new Promise((ok, ko) => {
    const r = new FileReader();
    r.onerror = () => ko(r.error ?? new Error("Lecture du fichier impossible."));
    r.onload = () => {
      const url = String(r.result ?? "");
      const virgule = url.indexOf(",");
      ok(`${PREFIXE}${b64Texte(f.name || "document")}.${b64Texte(f.type || "")}.${virgule >= 0 ? url.slice(virgule + 1) : ""}`);
    };
    r.readAsDataURL(f);
  });
}

/** Serveur : rend le fichier, qu'il soit arrivé en base64 ou normalement. */
export function deballerFichier(v: FormDataEntryValue | null): File | null {
  if (v == null) return null;
  if (typeof v !== "string") return v;
  if (!v.startsWith(PREFIXE)) return null;
  const [nom, type, contenu] = v.slice(PREFIXE.length).split(".");
  if (contenu === undefined) return null;
  const texte = (s: string) => {
    try {
      return Buffer.from(s, "base64").toString("utf8");
    } catch {
      return "";
    }
  };
  return new File([Buffer.from(contenu, "base64")], texte(nom) || "document", { type: texte(type) });
}

/** Serveur : tous les fichiers d'un champ (plusieurs pages). */
export function deballerFichiers(vs: FormDataEntryValue[]): File[] {
  return vs.map(deballerFichier).filter((f): f is File => !!f && f.size > 0);
}
