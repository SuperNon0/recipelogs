/**
 * Requêtes lecture-seule sur les comptes pour peupler l'écran /settings.
 * Server-only.
 */
import "server-only";
import { prisma } from "../prisma";
import type { Account } from "@prisma/client";

export type AccountRow = Pick<
  Account,
  "id" | "email" | "role" | "state" | "createdAt" | "validatedAt" | "lastLoginAt"
> & {
  isBaseAdmin: boolean;
};

export async function listAllAccounts(): Promise<AccountRow[]> {
  const [rows, base] = await Promise.all([
    prisma.account.findMany({
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    prisma.account.findFirst({
      where: { passwordHash: { not: null } },
      orderBy: { id: "asc" },
    }),
  ]);
  const baseId = base?.id ?? -1;
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    state: r.state,
    createdAt: r.createdAt,
    validatedAt: r.validatedAt,
    lastLoginAt: r.lastLoginAt,
    isBaseAdmin: r.id === baseId,
  }));
}

export async function countSuperAdmins(): Promise<number> {
  return prisma.account.count({
    where: { role: "super_admin", state: "active" },
  });
}
