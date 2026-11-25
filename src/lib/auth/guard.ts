import { redirect } from "next/navigation";
import { getViewer, realAccountOf, viewerCan, type Viewer } from "./viewer";
import { PERMISSIONS, type Access } from "./permissions";
import { authMode } from "./config";
import { isMaintenanceEmail } from "./maintenance";
import { getAnnonces } from "./passerelle";
import { PATH_HEADER } from "./path";
import { PERMISSIONS_DU_MODULE, moduleDeLaPage, modulesCoupes, type ModuleCle } from "@/lib/modules";

/**
 * Gardes des droits. Chaque Server Action, page et route d'API commence par
 * l'une d'elles (tests/authGuards.test.ts le vérifie) : la page d'accueil
 * n'est pas un rempart suffisant, une action peut être appelée directement.
 */

export const MESSAGE_MAINTENANCE = "RecipeLog est en maintenance : rien ne peut être enregistré pour l'instant. Réessaie dans quelques minutes.";

/**
 * Plateforme : pendant une maintenance, le site est un vrai verrou. Les actions, les
 * routes d'API et le MCP sont refusés, pas seulement les pages : quelqu'un déjà dans
 * l'appli ne peut plus rien enregistrer pendant une restauration ou un déménagement.
 * L'équipe RecipeLog (compte de maintenance) garde l'accès pour vérifier le site.
 */
export async function enMaintenance(viewer: Viewer): Promise<boolean> {
  if (authMode() !== "oidc") return false;
  const { maintenance } = await getAnnonces();
  if (!maintenance) return false;
  return !isMaintenanceEmail(viewer.kind === "unknown" ? viewer.email : realAccountOf(viewer)?.email);
}

function deniedMessage(access: Access, viewer?: Viewer): string {
  // Plateforme : session finie (7 jours sans visite) ou déconnexion dans un autre onglet.
  if (viewer?.kind === "anonymous" && authMode() === "oidc") return "Ta session a expiré : recharge la page pour te reconnecter (ce que tu étais en train d'écrire n'est pas enregistré).";
  if (access === "read") return "Accès refusé : ton compte n'est pas actif.";
  const p = PERMISSIONS.find((x) => x.key === access);
  return `Ton rôle n'a pas la permission « ${p?.label ?? access} ».`;
}

export const MESSAGE_MODULE = "Cette partie de RecipeLog n'est pas activée sur ton site.";

/** Plateforme : la permission demandée appartient-elle à un module coupé dans le panel ? */
async function permissionCoupee(access: Access): Promise<boolean> {
  const off = await modulesCoupes();
  if (!off.size) return false;
  return [...off].some((m: ModuleCle) => (PERMISSIONS_DU_MODULE[m] ?? []).some((p) => p === access));
}

/** Plateforme : l'adresse demandée est-elle celle d'un module coupé ? */
async function pageCoupee(): Promise<boolean> {
  const off = await modulesCoupes();
  if (!off.size) return false;
  let path = "";
  try {
    const { headers } = await import("next/headers");
    path = (await headers()).get(PATH_HEADER) ?? "";
  } catch {
    return false;
  }
  const m = moduleDeLaPage(path);
  return !!m && off.has(m);
}

/** Server Action : lève une erreur si le visiteur n'a pas le droit. */
export async function requireAccess(access: Access): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewerCan(viewer, access)) throw new Error(deniedMessage(access, viewer));
  if (await permissionCoupee(access)) throw new Error(MESSAGE_MODULE);
  if (await enMaintenance(viewer)) throw new Error(MESSAGE_MAINTENANCE);
  return viewer;
}

/** Page : renvoie vers /acces (qui explique pourquoi) si le visiteur n'a pas le droit. */
export async function requirePage(access: Access): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewerCan(viewer, access)) redirect(`/acces?besoin=${access}`);
  // Module coupé dans le panel admin : sa page renvoie vers l'accueil.
  if ((await pageCoupee()) || (await permissionCoupee(access))) redirect("/");
  return viewer;
}

/** Route d'API : renvoie une réponse 403 à retourner telle quelle, ou null si c'est permis. */
export async function apiDenied(access: Access): Promise<Response | null> {
  const viewer = await getViewer();
  if (!viewerCan(viewer, access)) {
    return Response.json({ error: deniedMessage(access, viewer) }, { status: viewer.kind === "anonymous" ? 401 : 403, headers: { "Cache-Control": "no-store" } });
  }
  if ((await pageCoupee()) || (await permissionCoupee(access))) {
    return Response.json({ error: MESSAGE_MODULE }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  if (await enMaintenance(viewer)) {
    return Response.json({ error: MESSAGE_MAINTENANCE }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "120" } });
  }
  return null;
}
