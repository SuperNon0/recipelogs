import { NextResponse, type NextRequest } from "next/server";
import { SHARE_ENABLED } from "@/lib/features";

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
 */
export function middleware(req: NextRequest) {
  if (req.headers.has("next-action")) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  if (req.nextUrl.pathname.startsWith("/api/mcp")) {
    return NextResponse.next();
  }
  if (!SHARE_ENABLED) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new NextResponse("Forbidden", { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/share/:path*", "/api/mcp/:path*"],
};
