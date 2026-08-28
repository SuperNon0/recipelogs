/**
 * Capabilities (permissions configurables) — miroir léger de Site-base.
 *
 * Chaque capability déclare un niveau requis, lu depuis `CAP_<CLE>` de
 * l'environnement. Cela permet de désactiver certaines fonctionnalités
 * sensibles (mise à jour du site, gestion des comptes…) sans toucher au
 * code.
 */
import type { AccountRole } from "@prisma/client";

export type CapabilityLevel = "off" | "member" | "super_admin";

const LEVELS: readonly CapabilityLevel[] = ["off", "member", "super_admin"] as const;

export const CAPABILITIES = {
  account_management: {
    label: "Gestion des comptes",
    default: "super_admin" as CapabilityLevel,
    envKey: "CAP_ACCOUNT_MANAGEMENT",
  },
  admin_password: {
    label: "Mot de passe administrateur",
    default: "super_admin" as CapabilityLevel,
    envKey: "CAP_ADMIN_PASSWORD",
  },
  site_update: {
    label: "Mise à jour du site",
    default: "super_admin" as CapabilityLevel,
    envKey: "CAP_SITE_UPDATE",
  },
} as const;

export type CapabilityKey = keyof typeof CAPABILITIES;

export function capabilityLevel(key: CapabilityKey): CapabilityLevel {
  const cap = CAPABILITIES[key];
  const raw = (process.env[cap.envKey] ?? cap.default).toString().trim().toLowerCase();
  return (LEVELS as readonly string[]).includes(raw)
    ? (raw as CapabilityLevel)
    : cap.default;
}

export function hasCapability(
  key: CapabilityKey,
  role: AccountRole | null | undefined,
): boolean {
  const level = capabilityLevel(key);
  if (level === "off") return false;
  if (!role) return false;
  if (level === "super_admin") return role === "super_admin";
  // 'member' : tout compte actif (le super-admin l'est aussi).
  return role === "member" || role === "super_admin";
}
