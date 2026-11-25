import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS, type Permission } from "./permissions";
import { authMode } from "./config";
import { modulesCoupes } from "@/lib/modules";

/**
 * Plateforme, module « Rôles » coupé dans le panel : pas de rôles personnalisés, seulement
 * Administrateur (tout) et Membre (tout sauf les comptes, la clé Claude et la mise à jour du site).
 * Les rôles déjà créés restent sur les comptes qui les ont ; on ne peut plus en donner d'autres.
 */
export const MEMBRE = "Membre";
const SANS: Permission[] = ["accounts.manage", "mcp.manage", "site.update"];
export const MEMBRE_PERMISSIONS: Permission[] = PERMISSIONS.map((p) => p.key).filter((k) => !SANS.includes(k));

export async function rolesFixes(): Promise<boolean> {
  return authMode() === "oidc" && (await modulesCoupes()).has("roles");
}

/** Le rôle Membre (créé s'il n'existe pas encore). */
export async function roleMembre(): Promise<Role> {
  const existing = await prisma.role.findFirst({ where: { isAdmin: false, name: { equals: MEMBRE, mode: "insensitive" } }, orderBy: { id: "asc" } });
  if (existing) return existing;
  return prisma.role.create({ data: { name: MEMBRE, permissions: MEMBRE_PERMISSIONS, categoryIds: [] } });
}

/** Ce rôle peut-il être donné à un compte ? (toujours, sauf rôle personnalisé quand « Rôles » est coupé) */
export async function roleDonnable(role: Pick<Role, "isAdmin" | "name">): Promise<boolean> {
  if (role.isAdmin || role.name.toLowerCase() === MEMBRE.toLowerCase()) return true;
  return !(await rolesFixes());
}

export const MESSAGE_ROLES =
  "Ton offre comprend seulement les rôles Administrateur et Membre. Pour créer tes propres rôles, demande les rôles personnalisés à RecipeLog.";
