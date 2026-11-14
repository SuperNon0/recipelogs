import { NextResponse, type NextRequest } from "next/server";
import { SHARE_ENABLED } from "@/lib/features";
import { PATH_HEADER, SEARCH_HEADER } from "@/lib/auth/path";


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
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
