import { randomBytes } from "node:crypto";

/**
 * Lectures en cours. Une lecture par IA peut durer plus d'une minute, et
 * Cloudflare coupe une requête au bout de 100 secondes : l'action lance donc
 * la lecture en arrière-plan et le navigateur demande où elle en est toutes
 * les 2 secondes. En mémoire du serveur (un seul processus par client) :
 * une lecture perdue au redémarrage se relance d'un clic.
 */
export type Travail<T> = { etat: "en_cours" } | { etat: "fini"; resultat: T };

type Entree = { etat: "en_cours" | "fini"; resultat?: unknown; qui: string; debut: number };

const DUREE_MAX = 30 * 60_000;
const MAX_EN_COURS_PAR_PERSONNE = 3;

const g = globalThis as unknown as { __rlTravauxIA?: Map<string, Entree> };
const travaux = (g.__rlTravauxIA ??= new Map());

function nettoyer() {
  const limite = Date.now() - DUREE_MAX;
  for (const [id, t] of travaux) if (t.debut < limite) travaux.delete(id);
}

/** Lance `tache` et rend son numéro tout de suite. */
export function lancer<T>(qui: string, tache: () => Promise<T>, enErreur: (e: unknown) => T): string {
  nettoyer();
  const enCours = [...travaux.values()].filter((t) => t.qui === qui && t.etat === "en_cours").length;
  if (enCours >= MAX_EN_COURS_PAR_PERSONNE) throw new Error("Trois lectures sont déjà en cours : attends qu'elles finissent.");
  const id = randomBytes(12).toString("hex");
  const t: Entree = { etat: "en_cours", qui, debut: Date.now() };
  travaux.set(id, t);
  tache()
    .catch(enErreur)
    .then((resultat) => {
      t.etat = "fini";
      t.resultat = resultat;
    });
  return id;
}

/** null : numéro inconnu (lecture trop ancienne, serveur redémarré, ou lancée par quelqu'un d'autre). */
export function suivre<T>(qui: string, id: string): Travail<T> | null {
  const t = travaux.get(id);
  if (!t || t.qui !== qui) return null;
  if (t.etat === "en_cours") return { etat: "en_cours" };
  travaux.delete(id);
  return { etat: "fini", resultat: t.resultat as T };
}
