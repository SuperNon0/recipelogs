/**
 * Helpers Account : lookup, hash, audit.
 *
 * Le « compte administrateur de base » est LE compte super-admin qui possède
 * un `passwordHash` (unique par contrat produit — un seul compte fusionne
 * login local et email CF). C'est lui seul qui peut ajouter/retirer d'autres
 * super-admins et changer le mot de passe admin.
 */
import "server-only";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { Prisma, type Account, type AuditAction } from "@prisma/client";

export const BCRYPT_ROUNDS = 12;
export const MIN_PASSWORD_LEN = 8;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findAccountByEmail(email: string): Promise<Account | null> {
  const norm = normalizeEmail(email);
  if (!norm) return null;
  return prisma.account.findUnique({ where: { email: norm } });
}

/**
 * Le compte administrateur de base : super-admin avec un mot de passe local.
 * Par contrat il y en a exactement UN (fusion login local + email CF).
 */
export async function findBaseAdmin(): Promise<Account | null> {
  return prisma.account.findFirst({
    where: {
      role: "super_admin",
      passwordHash: { not: null },
    },
    orderBy: { id: "asc" },
  });
}

/** Compat : la porte du login local cherche l'unique compte avec passwordHash. */
export async function findLocalSuperAdmin(): Promise<Account | null> {
  return findBaseAdmin();
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  if (!hash || !plain) return false;
  return bcrypt.compare(plain, hash);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export type AuditInput = {
  accountId?: number | null;
  action: AuditAction;
  targetAccountId?: number | null;
  metadata?: Prisma.InputJsonValue;
};

export async function logAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        accountId: input.accountId ?? null,
        action: input.action,
        targetAccountId: input.targetAccountId ?? null,
        metadata: input.metadata ?? Prisma.JsonNull,
      },
    });
  } catch (e) {
    // Ne jamais faire échouer une action utilisateur pour un problème d'audit.
    // eslint-disable-next-line no-console
    console.error("[audit] insert failed", e);
  }
}

/** Nombre de super-admins actifs (pour empêcher la suppression du dernier). */
export async function countActiveSuperAdmins(): Promise<number> {
  return prisma.account.count({
    where: { role: "super_admin", state: "active" },
  });
}
