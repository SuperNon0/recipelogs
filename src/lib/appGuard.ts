/**
 * Outils de AppGuard (src/components/AppGuard.tsx), séparés pour être testés.
 */

/** Numéro du build affiché par ce navigateur (next.config.ts), comparé à /api/health. */
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "";

/**
 * Erreur typique d'une page ouverte avant une mise à jour du site : elle
 * réclame un morceau de code ou une action qui n'existent plus sur le serveur.
 * Recharger la page règle tout.
 */
export function estErreurDeVersion(err: unknown): boolean {
  if (!err) return false;
  const nom = typeof err === "object" && err && "name" in err ? String((err as { name: unknown }).name) : "";
  const texte = typeof err === "string" ? err : err instanceof Error || (typeof err === "object" && err && "message" in err) ? String((err as { message: unknown }).message) : "";
  if (nom === "ChunkLoadError") return true;
  return /Loading (CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to find Server Action|An unexpected response was received from the server/i.test(
    texte,
  );
}

/** Pages où l'on écrit (formulaires) : jamais rechargées sans demander. */
const PAGES_DE_SAISIE = /\/(new|edit|commande|import-[\w-]+)(\/|$)/;

/**
 * Peut-on recharger tout de suite sans rien faire perdre ? Non si une fenêtre
 * est ouverte, si un champ est en cours de saisie ou sur une page de formulaire.
 */
export function doitRecharger(doc: Document, chemin: string): boolean {
  if (PAGES_DE_SAISIE.test(chemin)) return false;
  if (doc.querySelector('[aria-modal="true"], [role="dialog"], [role="menu"], .modal-veil, .sheet-veil, .voile, .lab')) return false;
  const champ = doc.activeElement as HTMLElement | null;
  if (champ && champ.matches("input, textarea, select, [contenteditable='true']")) return false;
  return true;
}

const CLE = "recipelog-recharge";

/**
 * Recharge la page, au plus une fois toutes les 30 secondes : si l'erreur
 * revient juste après, on n'entre pas dans une boucle de rechargements.
 */
export function rechargerUneFois(maintenant = Date.now()): boolean {
  try {
    const avant = Number(sessionStorage.getItem(CLE) || 0);
    if (maintenant - avant < 30_000) return false;
    sessionStorage.setItem(CLE, String(maintenant));
  } catch {
    // Stockage indisponible (navigation privée) : on recharge quand même.
  }
  window.location.reload();
  return true;
}
