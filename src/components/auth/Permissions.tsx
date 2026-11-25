"use client";

import { createContext, useContext } from "react";
import type { Permission } from "@/lib/auth/permissions";
import type { ModuleCle } from "@/lib/modules";

/**
 * Permissions du visiteur, pour masquer ce qu'il ne peut pas faire.
 * Ce n'est qu'un confort d'affichage : chaque action est aussi vérifiée
 * côté serveur (lib/auth/guard.ts).
 */
const Ctx = createContext<Permission[] | null>(null);
/** Modules coupés dans le panel admin (plateforme, src/lib/modules.ts). */
const CtxModules = createContext<string[]>([]);

export function PermissionsProvider({ permissions, modulesOff = [], children }: { permissions: Permission[]; modulesOff?: ModuleCle[]; children: React.ReactNode }) {
  return (
    <Ctx.Provider value={permissions}>
      <CtxModules.Provider value={modulesOff}>{children}</CtxModules.Provider>
    </Ctx.Provider>
  );
}

/** module("factures") → false si ce module est coupé pour ce site (toujours vrai hors de la plateforme). */
export function useModule(): (m: ModuleCle) => boolean {
  const off = useContext(CtxModules);
  return (m) => !off.includes(m);
}

/** can("costs.view") → true si le visiteur a la permission (toujours vrai hors du site, ex. partage). */
export function useCan(): (p: Permission) => boolean {
  const perms = useContext(Ctx);
  return (p) => perms === null || perms.includes(p);
}
