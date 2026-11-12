import { cache } from "react";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import type { Account, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthSettings } from "./config";
import { currentService } from "./service";
import { tokenFromRequest, verifyCloudflareJwt } from "./cloudflare";
import { rolePermissions, type Access, type Permission } from "./permissions";
import { demoBlocks } from "@/lib/demo";

/**
 * Qui fait la requête.
 * - open : comptes désactivés, tout le monde a tous les droits (comme avant).
 * - anonymous : pas de jeton Cloudflare valable (accès direct au serveur…).
 * - unknown : jeton valable, mais adresse sans compte → « Demander un accès ».
 * - account : compte connu (en attente, actif, refusé ou bloqué). Pendant
 *   « Voir comme », account est le compte regardé et realAccount l'administrateur.
 */
export type Viewer =
  | { kind: "open" }
  | { kind: "anonymous"; error: string }
  | { kind: "unknown"; email: string }
  | { kind: "account"; account: AccountWithRole; perms: Permission[]; realAccount: AccountWithRole | null };

export type AccountWithRole = Account & { role: Role | null };

export const VIEW_AS_COOKIE = "rl_view_as";
const SECRET_KEY = "authSecret";
const SEEN_EVERY_MS = 5 * 60 * 1000;

/** Clé secrète de l'appli (signature du cookie « Voir comme »), créée au premier besoin. */
async function appSecret(): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key: SECRET_KEY } });
  if (typeof row?.value === "string" && row.value.length >= 32) return row.value;
  const secret = randomBytes(32).toString("base64url");
  await prisma.setting.upsert({
    where: { key: SECRET_KEY },
    update: {},
    create: { key: SECRET_KEY, value: secret },
  });
  const again = await prisma.setting.findUnique({ where: { key: SECRET_KEY } });
  return typeof again?.value === "string" ? again.value : secret;
}

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Valeur du cookie « Voir comme » : compte regardé, lié à l'administrateur qui regarde. */
export async function viewAsCookieValue(targetId: number, adminId: number): Promise<string> {
  const payload = `${targetId}.${adminId}`;
  return `${payload}.${sign(await appSecret(), payload)}`;
}

async function readViewAs(raw: string | undefined, adminId: number): Promise<number | null> {
  if (!raw) return null;
  const [target, admin, mac] = raw.split(".");
  if (!target || !admin || !mac || Number(admin) !== adminId) return null;
  const expected = Buffer.from(sign(await appSecret(), `${target}.${admin}`));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const id = Number(target);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** E-mail vérifié de la requête en cours (null si pas de jeton valable). */
export async function verifiedEmail(): Promise<{ email: string } | { error: string }> {
  const settings = await getAuthSettings();
  const h = await headers();
  const c = await cookies();
  const token = tokenFromRequest(h.get("cf-access-jwt-assertion"), c.get("CF_Authorization")?.value);
  if (!token) return { error: "Aucun jeton Cloudflare reçu : le site n'a pas été ouvert par son adresse Cloudflare." };
  const check = await verifyCloudflareJwt(token, settings);
  return check.ok ? { email: check.email } : { error: check.error };
}

export const getViewer = cache(async (): Promise<Viewer> => {
  // Outils MCP appelés avec la clé secrète (voir lib/auth/service.ts).
  if (currentService()) return { kind: "open" };
  const settings = await getAuthSettings();
  if (!settings.enabled) return { kind: "open" };

  const who = await verifiedEmail();
  if ("error" in who) return { kind: "anonymous", error: who.error };

  const account = await prisma.account.findUnique({ where: { email: who.email }, include: { role: true } });
  if (!account) return { kind: "unknown", email: who.email };

  if (!account.lastSeenAt || Date.now() - account.lastSeenAt.getTime() > SEEN_EVERY_MS) {
    await prisma.account.update({ where: { id: account.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }

  const perms = account.status === "active" ? rolePermissions(account.role) : [];
  if (perms.includes("accounts.manage")) {
    const targetId = await readViewAs((await cookies()).get(VIEW_AS_COOKIE)?.value, account.id);
    if (targetId && targetId !== account.id) {
      const target = await prisma.account.findUnique({ where: { id: targetId }, include: { role: true } });
      if (target && canBeViewedAs(target)) {
        return { kind: "account", account: target, perms: rolePermissions(target.role), realAccount: account };
      }
    }
  }
  return { kind: "account", account, perms, realAccount: null };
});

/** « Voir comme » : seulement un compte actif, avec un rôle, qui n'est pas administrateur. */
export function canBeViewedAs(target: AccountWithRole): boolean {
  return target.status === "active" && !!target.role && !target.role.isAdmin;
}

/** Le visiteur peut-il faire ça ? (compte actif avec la permission, ou comptes désactivés) */
export function viewerCan(viewer: Viewer, access: Access): boolean {
  // Mode démo : comptes, clé MCP et mise à jour du site fermés à tout le monde.
  if (demoBlocks(access)) return false;
  if (viewer.kind === "open") return true;
  if (viewer.kind !== "account" || viewer.account.status !== "active" || !viewer.account.role) return false;
  return access === "read" || viewer.perms.includes(access);
}

/** Permissions du visiteur (toutes quand les comptes sont désactivés). */
export function viewerPermissions(viewer: Viewer): Permission[] {
  const all =
    viewer.kind === "open"
      ? rolePermissions({ isAdmin: true, permissions: [] })
      : viewer.kind === "account" && viewerCan(viewer, "read")
        ? viewer.perms
        : [];
  return all.filter((p) => !demoBlocks(p));
}

/** Le vrai compte derrière la requête (l'administrateur pendant « Voir comme »). */
export function realAccountOf(viewer: Viewer): AccountWithRole | null {
  if (viewer.kind !== "account") return null;
  return viewer.realAccount ?? viewer.account;
}

/** Le vrai compte s'il peut gérer les comptes (même pendant « Voir comme »), sinon null. */
export function realManager(viewer: Viewer): AccountWithRole | null {
  const real = realAccountOf(viewer);
  return real && real.status === "active" && rolePermissions(real.role).includes("accounts.manage") ? real : null;
}
