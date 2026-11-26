import { NextResponse, type NextRequest } from "next/server";
import { SHARE_ENABLED } from "@/lib/features";
import { PATH_HEADER, SEARCH_HEADER } from "@/lib/auth/path";
import { BUILD_ID } from "@/lib/appGuard";


/**
 * Protège les chemins pensés pour échapper à Cloudflare.
 *
 * /share/* (partage public) :
 * - Partage désactivé → 404.
 * - Partage activé → lecture seule : les « Server Actions » de Next.js
 *   peuvent être appelées depuis n'importe quelle URL (requête POST avec
 *   l'en-tête Next-Action). Sur /share, qui est censé échapper à Cloudflare,
 *   on les refuse pour qu'un visiteur ne puisse rien modifier.
 *
 * /api/mcp/* (accès MCP pour Claude) : protégé par sa clé secrète dans la
 * route elle-même ; ici on refuse seulement les Server Actions, pour la même
 * raison que sur /share.
 *
 * Partout ailleurs : on transmet seulement le chemin à la mise en page, qui
 * affiche les pages d'accès (demande, attente, refus, blocage) quand les
 * comptes sont activés. Les droits eux-mêmes sont vérifiés côté serveur
 * (src/lib/auth/guard.ts), le middleware n'ayant pas accès à la base.
 */
export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Fiches OAuth de l'accès MCP (connexion de Claude par Authentik) : les
  // adresses /.well-known/… imposées par les normes sont servies par
  // /api/mcp/oauth/… (src/lib/mcp/oauth.ts). /.well-known/oauth-protected-resource/api/mcp
  // (RFC 9728, ressource avec chemin) donne la même fiche.
  const wellKnown = OAUTH_WELL_KNOWN.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
  if (wellKnown) {
    if (req.headers.has("next-action")) return new NextResponse("Forbidden", { status: 403 });
    return NextResponse.rewrite(new URL(wellKnown[1], req.url));
  }
  const isShare = path.startsWith("/share");
  const isMcp = path.startsWith("/api/mcp");

  if (isShare || isMcp) {
    if (req.headers.has("next-action")) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    if (isShare) {
      if (!SHARE_ENABLED) return new NextResponse("Not found", { status: 404 });
      if (req.method !== "GET" && req.method !== "HEAD") {
        return new NextResponse("Forbidden", { status: 403 });
      }
    }
  }

  const headers = new Headers(req.headers);
  headers.set(PATH_HEADER, path);
  headers.set(SEARCH_HEADER, req.nextUrl.search);
  const res = NextResponse.next({ request: { headers } });
  // Démarrage rapide (public/sw.js) : la copie de l'accueil gardée sur le
  // téléphone sait de quelle version du site elle vient.
  if (BUILD_ID) res.headers.set("x-recipelog-build", BUILD_ID);
  return res;
}

const OAUTH_WELL_KNOWN: [string, string][] = [
  ["/.well-known/oauth-protected-resource", "/api/mcp/oauth/ressource"],
  ["/.well-known/oauth-authorization-server", "/api/mcp/oauth/serveur"],
];

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
