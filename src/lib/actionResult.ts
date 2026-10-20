/** Résultat standard d'une Server Action : succès, ou message d'erreur affichable. */
export type ActionResult = { ok: true } | { ok: false; error: string };
