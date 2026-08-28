/**
 * Middleware Next.js — auth v2.
 *
 * Runtime : Node (Prisma incompatible Edge, et iron-session + jose y sont
 * marginalement plus légers). Le middleware garde-t-il des lookups DB courts :
 * un `findUnique` par requête non-cachée uniquement quand la session n'est pas
 * déjà validée.
 *
 * Pipeline :
 *   1. Skip routes publiques (login, /access/*, /share/*, /api/health,
 *      assets Next, /api/deploy/log).
 *   2. Session iron-session : si accountId présent + compte actif en base
 *      → laisse passer.
 *   3. Sinon on tente `getCfEmail(request)` :
 *        - email connu, actif → ouvre session + laisse passer
 *        - email connu, pending/refused/blocked → /access/<état>
 *        - email inconnu → /access/request?email=<...>
 *        - pas d'email → /login
 */
import { NextResponse, type NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/prisma";
import { sessionOptions, type SessionData } from "@/lib/auth/session";
import { getCfEmail } from "@/lib/auth/cloudflare";
import { normalizeEmail } from "@/lib/auth/account";

// Force Node runtime : Prisma ne fonctionne pas en Edge.
// Documenté dans le CDC : Auth v2, contrainte connue.
export const runtime = "nodejs";

/** Préfixes non protégés (login, pages d'état, partage public, healthcheck, assets). */
const PUBLIC_PREFIXES = [
  "/login",
  "/access/",
  "/share/",
  "/api/health",
  "/api/deploy/log", // bouton mise à jour depuis /settings
  "/_next/",
  "/favicon",
  "/uploads/",
  "/robots.txt",
  "/sitemap.xml",
];

function isPublic(pathname: string): boolean {
  if (pathname === "/login") return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

function redirectTo(request: NextRequest, path: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = path;
  url.search = "";
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  // 1. Session iron-session — lecture directe via l'API request/response.
  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(request, res, sessionOptions());

  if (session.accountId) {
    // On revalide contre la base : un compte bloqué en cours de route perd
    // l'accès immédiatement. Coût : 1 findUnique par requête protégée.
    const account = await prisma.account.findUnique({
      where: { id: session.accountId },
      select: { id: true, state: true, role: true, email: true },
    });
    if (account && account.state === "active") {
      // Injecte les infos dans les headers pour les server components.
      res.headers.set("x-account-id", String(account.id));
      if (account.email) res.headers.set("x-account-email", account.email);
      res.headers.set("x-account-role", account.role);
      return res;
    }
    // Session obsolète ou compte non-actif : on nettoie et on redirige selon l'état.
    session.destroy();
    if (account) {
      const target =
        account.state === "pending"
          ? "/access/pending"
          : account.state === "refused"
            ? "/access/refused"
            : "/access/blocked";
      return redirectTo(request, target);
    }
  }

  // 2. Tentative Cloudflare Access.
  let cfEmail: string | null = null;
  try {
    cfEmail = await getCfEmail(request);
  } catch {
    cfEmail = null;
  }

  if (cfEmail) {
    const norm = normalizeEmail(cfEmail);
    const account = await prisma.account.findUnique({
      where: { email: norm },
      select: { id: true, state: true, role: true, email: true },
    });

    if (!account) {
      const url = request.nextUrl.clone();
      url.pathname = "/access/request";
      url.search = `?email=${encodeURIComponent(norm)}`;
      return NextResponse.redirect(url);
    }
    if (account.state === "pending") return redirectTo(request, "/access/pending");
    if (account.state === "refused") return redirectTo(request, "/access/refused");
    if (account.state === "blocked") return redirectTo(request, "/access/blocked");

    // active : on ouvre la session.
    session.accountId = account.id;
    session.role = account.role;
    session.email = account.email ?? undefined;
    await session.save();
    await prisma.account.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date() },
    });
    res.headers.set("x-account-id", String(account.id));
    if (account.email) res.headers.set("x-account-email", account.email);
    res.headers.set("x-account-role", account.role);
    return res;
  }

  // 3. Ni session ni CF : login local.
  return redirectTo(request, "/login");
}

export const config = {
  // Exclut assets statiques ; le matcher évite les .png/.svg/.ico etc.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
