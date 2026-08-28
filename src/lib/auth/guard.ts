/**
 * Garde-fous côté server actions & route handlers.
 * Ces helpers ne sont utilisables que dans un contexte serveur (App Router).
 */
import "server-only";
import type { Account, AccountRole } from "@prisma/client";
import { getCurrentAccount } from "./session";
import { findBaseAdmin } from "./account";

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly kind: "unauth" | "forbidden" = "forbidden",
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export async function requireAccount(): Promise<Account> {
  const account = await getCurrentAccount();
  if (!account) {
    throw new AuthError("Session invalide, connexion requise.", "unauth");
  }
  return account;
}

export async function requireRole(role: AccountRole): Promise<Account> {
  const account = await requireAccount();
  if (role === "super_admin" && account.role !== "super_admin") {
    throw new AuthError("Action réservée aux super-admins.", "forbidden");
  }
  return account;
}

/**
 * N'autorise que le compte administrateur de base (celui avec passwordHash).
 * Utilisé pour ajouter/retirer d'autres super-admins et changer le mot de
 * passe local.
 */
export async function requireBaseAdmin(): Promise<Account> {
  const account = await requireRole("super_admin");
  const base = await findBaseAdmin();
  if (!base || base.id !== account.id) {
    throw new AuthError("Réservé au compte administrateur de base.", "forbidden");
  }
  return account;
}
