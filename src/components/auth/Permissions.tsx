"use client";

import { createContext, useContext } from "react";
import type { Permission } from "@/lib/auth/permissions";

/**
 * Permissions du visiteur, pour masquer ce qu'il ne peut pas faire.
 * Ce n'est qu'un confort d'affichage : chaque action est aussi vérifiée
 * côté serveur (lib/auth/guard.ts).
 */
const Ctx = createContext<Permission[] | null>(null);

export function PermissionsProvider({ permissions, children }: { permissions: Permission[]; children: React.ReactNode }) {
  return <Ctx.Provider value={permissions}>{children}</Ctx.Provider>;
}

/** can("costs.view") → true si le visiteur a la permission (toujours vrai hors du site, ex. partage). */
export function useCan(): (p: Permission) => boolean {
  const perms = useContext(Ctx);
  return (p) => perms === null || perms.includes(p);
}
