import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clearCookies, oidcSetup } from "@/lib/auth/oidcRoutes";
import { SESSION_COOKIE, SESSION_MAX_AGE, cookieOptions, signSession, verifySession } from "@/lib/auth/session";
import { isMaintenanceEmail } from "@/lib/auth/maintenance";
import { getEquipe } from "@/lib/auth/passerelle";

export const dynamic = "force-dynamic";

const RENOUVELER_APRES_S = 12 * 60 * 60;

/**
 * POST /auth/renouveler : appelé de temps en temps par le site ouvert dans le navigateur
 * (components/auth/SessionKeeper). Tant que la personne utilise RecipeLog, sa session de
 * 7 jours repart pour 7 jours : elle n'est plus coupée en plein travail.
 *
 * Avant de renouveler (une fois toutes les 12 heures au plus), on redemande à la plateforme
 * si la personne fait toujours partie de l'équipe : quelqu'un qui en a été retiré est
 * déconnecté ici, au lieu de garder son accès jusqu'à 7 jours.
 * Ouverte sans garde, comme les autres routes /auth (tests/authGuards.test.ts) : elle ne
 * fait que relire et prolonger le cookie de session déjà présent.
 */
export async function POST() {
  const setup = oidcSetup();
  if (!setup.ok) return setup.response;
  const json = (corps: Record<string, unknown>, status = 200) =>
    NextResponse.json(corps, { status, headers: { "Cache-Control": "no-store" } });

  const check = verifySession((await cookies()).get(SESSION_COOKIE)?.value, setup.secret);
  if (!check.ok) return json({ connecte: false }, 401);
  const { email, iat } = check.session;
  if (Date.now() / 1000 - iat < RENOUVELER_APRES_S) return json({ connecte: true });

  if (!isMaintenanceEmail(email)) {
    const r = await getEquipe();
    // Plateforme injoignable : on ne prolonge pas, on ne coupe pas non plus (nouvel essai plus tard).
    if (!r.ok) return json({ connecte: true });
    if (!r.equipe.membres.some((m) => m.email === email && m.actif)) {
      return clearCookies(json({ connecte: false }, 401), [SESSION_COOKIE]);
    }
  }
  const res = json({ connecte: true, renouvele: true });
  res.cookies.set(SESSION_COOKIE, signSession(email, setup.secret), cookieOptions(SESSION_MAX_AGE));
  return res;
}
