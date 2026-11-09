import { redirect } from "next/navigation";
import { getViewer, viewerCan, type Viewer } from "./viewer";
import { PERMISSIONS, type Access } from "./permissions";

/**
 * Gardes des droits. Chaque Server Action, page et route d'API commence par
 * l'une d'elles (tests/authGuards.test.ts le vérifie) : la page d'accueil
 * n'est pas un rempart suffisant, une action peut être appelée directement.
 */

function deniedMessage(access: Access): string {
  if (access === "read") return "Accès refusé : ton compte n'est pas actif.";
  const p = PERMISSIONS.find((x) => x.key === access);
  return `Ton rôle n'a pas la permission « ${p?.label ?? access} ».`;
}

/** Server Action : lève une erreur si le visiteur n'a pas le droit. */
export async function requireAccess(access: Access): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewerCan(viewer, access)) throw new Error(deniedMessage(access));
  return viewer;
}

/** Page : renvoie vers /acces (qui explique pourquoi) si le visiteur n'a pas le droit. */
export async function requirePage(access: Access): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewerCan(viewer, access)) redirect(`/acces?besoin=${access}`);
  return viewer;
}

/** Route d'API : renvoie une réponse 403 à retourner telle quelle, ou null si c'est permis. */
export async function apiDenied(access: Access): Promise<Response | null> {
  const viewer = await getViewer();
  if (viewerCan(viewer, access)) return null;
  return Response.json({ error: deniedMessage(access) }, { status: 403, headers: { "Cache-Control": "no-store" } });
}
