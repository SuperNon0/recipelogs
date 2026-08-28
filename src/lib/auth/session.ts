/**
 * Session iron-session : cookie signé porteur d'accountId + role + email.
 *
 * On stocke le strict minimum ; l'état canonique (etat, role) est relu depuis
 * la BDD à chaque requête via `getCurrentAccount()`, ce qui garantit qu'un
 * compte bloqué en base perd son accès à la requête suivante.
 */
import "server-only";
import { cookies } from "next/headers";
import { getIronSession, type IronSession, type SessionOptions } from "iron-session";
import { prisma } from "@/lib/prisma";
import type { Account, AccountRole } from "@prisma/client";

export type SessionData = {
  accountId?: number;
  role?: AccountRole;
  email?: string;
};

const COOKIE_NAME = "recipelog_session";

function readSecret(): string {
  const secret = process.env.SESSION_SECRET ?? "";
  if (!secret || secret.length < 32) {
    // Iron-session exige ≥ 32 chars. En dev on log un warn et on complète
    // (empêche le crash au boot lors du premier lancement).
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(
        "[auth] SESSION_SECRET manquant/trop court (<32 chars). Fallback dev — NE PAS utiliser en prod.",
      );
    } else {
      throw new Error(
        "SESSION_SECRET manquant ou < 32 caractères. Génère 32+ octets aléatoires et redéploie.",
      );
    }
    return (secret + "0123456789abcdef0123456789abcdef0123456789abcdef").slice(0, 48);
  }
  return secret;
}

export function sessionOptions(): SessionOptions {
  return {
    cookieName: COOKIE_NAME,
    password: readSecret(),
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      // 30 jours
      maxAge: 60 * 60 * 24 * 30,
    },
  };
}

export async function getSession(): Promise<IronSession<SessionData>> {
  // Next 15 : cookies() est asynchrone.
  const store = await cookies();
  return getIronSession<SessionData>(store, sessionOptions());
}

export async function setSession(data: SessionData): Promise<void> {
  const s = await getSession();
  s.accountId = data.accountId;
  s.role = data.role;
  s.email = data.email;
  await s.save();
}

export async function clearSession(): Promise<void> {
  const s = await getSession();
  s.destroy();
}

/**
 * Récupère le compte courant depuis la BDD, à partir de la session.
 * Renvoie null si session absente, compte introuvable, ou état ≠ active.
 */
export async function getCurrentAccount(): Promise<Account | null> {
  const s = await getSession();
  if (!s.accountId) return null;
  const account = await prisma.account.findUnique({ where: { id: s.accountId } });
  if (!account) return null;
  if (account.state !== "active") return null;
  return account;
}
