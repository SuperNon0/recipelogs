import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { UPLOAD_DIR } from "@/lib/uploads";
import { limites } from "@/lib/modules";

/**
 * Limites de l'offre (plateforme), réglées dans le panel admin sous la flèche de
 * chaque module (src/lib/modules.ts, Limites). Sans limite réglée, rien n'est bloqué.
 * Une limite ne supprime jamais rien : elle empêche seulement d'en ajouter.
 */
export class LimiteAtteinte extends Error {}

const FIN = " Demande à RecipeLog d'agrandir ton offre si tu as besoin de plus.";

/** Refuse si ajouter `ajout` recettes dépasse la limite de l'offre. */
export async function verifierRecettes(ajout = 1): Promise<void> {
  const max = (await limites()).recettes;
  if (!max) return;
  const n = await prisma.recipe.count();
  if (n + ajout > max) {
    throw new LimiteAtteinte(
      ajout > 1 && n < max
        ? `Ton offre comprend ${max} recettes : tu en as ${n}, il reste de la place pour ${max - n}, pas pour ${ajout}.${FIN}`
        : `Ton offre comprend ${max} recettes et tu les as toutes. Supprime une recette pour en ajouter une autre.${FIN}`,
    );
  }
}

/** Places qui restent pour des recettes (Infinity sans limite). */
export async function placesRecettes(): Promise<number> {
  const max = (await limites()).recettes;
  if (!max) return Infinity;
  return Math.max(0, max - (await prisma.recipe.count()));
}

export async function cahiersPleins(): Promise<boolean> {
  const max = (await limites()).cahiers;
  return !!max && (await prisma.cookbook.count()) >= max;
}

export async function verifierCahiers(): Promise<void> {
  const max = (await limites()).cahiers;
  if (!max) return;
  if ((await prisma.cookbook.count()) >= max) throw new LimiteAtteinte(`Ton offre comprend ${max} cahier${max > 1 ? "s" : ""} et tu les as tous.${FIN}`);
}

export async function verifierThemes(): Promise<void> {
  const max = (await limites()).themes;
  if (!max) return;
  if ((await prisma.pdfTheme.count({ where: { presetKey: null } })) >= max) throw new LimiteAtteinte(`Ton offre comprend ${max} thème${max > 1 ? "s" : ""} PDF et tu les as tous.${FIN}`);
}

/** Rôles en plus d'Administrateur. */
export async function verifierRoles(): Promise<void> {
  const max = (await limites()).roles;
  if (!max) return;
  if ((await prisma.role.count({ where: { isAdmin: false } })) >= max) {
    throw new LimiteAtteinte(`Ton offre comprend ${max} rôle${max > 1 ? "s" : ""} en plus d'Administrateur et tu les as tous.${FIN}`);
  }
}

// ── Place des fichiers (factures, mercuriales, photos) ─────────────

let poids: { octets: number; jusqua: number } | null = null;

async function tailleDossier(dir: string): Promise<number> {
  let total = 0;
  let entrees;
  try {
    entrees = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entrees) {
    const p = join(dir, e.name);
    if (e.isDirectory()) total += await tailleDossier(p);
    else if (e.isFile()) total += await stat(p).then((s) => s.size).catch(() => 0);
  }
  return total;
}

/** Place prise par les fichiers envoyés (gardée 5 minutes, ajoutée à chaque envoi). */
export async function octetsUtilises(): Promise<number> {
  if (poids && Date.now() < poids.jusqua) return poids.octets;
  const octets = await tailleDossier(UPLOAD_DIR);
  poids = { octets, jusqua: Date.now() + 5 * 60_000 };
  return octets;
}

/** Refuse un envoi de `octets` si la place de l'offre est pleine ; sinon le compte tout de suite. */
export async function verifierPlace(octets: number): Promise<void> {
  const mo = (await limites()).fichiersMo;
  if (!mo) return;
  const utilises = await octetsUtilises();
  const max = mo * 1024 * 1024;
  if (utilises + octets > max) {
    const libre = Math.max(0, max - utilises);
    throw new LimiteAtteinte(
      `La place pour les fichiers de ton offre (${mo >= 1024 ? `${Math.round((mo / 1024) * 10) / 10} Go` : `${mo} Mo`}) est presque pleine : il reste ${Math.round(libre / 1024 / 1024)} Mo. Supprime d'anciennes factures ou mercuriales.${FIN}`,
    );
  }
  if (poids) poids.octets += octets;
}

// ── Liens vidéo lus par mois ───────────────────────────────────────

function cleMois(d = new Date()): string {
  return `videosLues:${d.toISOString().slice(0, 7)}`;
}

export async function videosCeMois(): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key: cleMois() } });
  return typeof row?.value === "number" ? row.value : 0;
}

/** Refuse si les liens vidéo du mois de l'offre sont tous lus. */
export async function verifierVideos(): Promise<void> {
  const max = (await limites()).videosMois;
  if (!max) return;
  if ((await videosCeMois()) >= max) {
    throw new LimiteAtteinte(`Ton offre comprend ${max} lien${max > 1 ? "s" : ""} vidéo par mois, déjà tous lus ce mois-ci. Ça repart le 1er du mois prochain.${FIN}`);
  }
}

/** Compte un lien lu ce mois-ci (seulement s'il y a une limite). */
export async function noterVideo(): Promise<void> {
  if (!(await limites()).videosMois) return;
  const key = cleMois();
  const n = await videosCeMois();
  await prisma.setting.upsert({ where: { key }, update: { value: n + 1 }, create: { key, value: n + 1 } });
}

/** « Fait avec RecipeLog » en bas des PDF (réglé dans le panel, flèche de « Thèmes PDF »). */
export async function marquePdf(): Promise<boolean> {
  return (await limites()).marquePdf === true;
}
