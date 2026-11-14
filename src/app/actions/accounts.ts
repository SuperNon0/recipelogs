"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/actionResult";
import { audit } from "@/lib/auth/audit";
import { authMode, getAuthSettings, saveAuthSettings } from "@/lib/auth/config";
import { inviterMembre, renvoyerInvitation, retirerMembre } from "@/lib/auth/passerelle";
import { normalizeTeam, verifyCloudflareJwt, tokenFromRequest } from "@/lib/auth/cloudflare";
import { requireAccess } from "@/lib/auth/guard";
import { cleanPermissions } from "@/lib/auth/permissions";
import { isMaintenanceEmail, maintenanceEmails } from "@/lib/auth/maintenance";
import {
  getViewer,
  realAccountOf,
  realManager,
  canBeViewedAs,
  VIEW_AS_COOKIE,
  verifiedEmail,
  viewAsCookieValue,
} from "@/lib/auth/viewer";
import { headers } from "next/headers";

function refresh() {
  revalidatePath("/", "layout");
}

/** Compte réel qui agit (pendant « Voir comme », c'est l'administrateur, pas le compte regardé). */
async function actingAdmin() {
  const viewer = await getViewer();
  if (viewer.kind === "open") {
    // Comptes pas encore activés : on note quand même l'adresse vérifiée, si Cloudflare la donne.
    const who = await verifiedEmail().catch(() => ({ error: "" }));
    return { email: "email" in who ? who.email : null, id: null as number | null };
  }
  const admin = realManager(viewer);
  if (!admin) throw new Error("Ton rôle ne permet pas de gérer les comptes.");
  return { email: admin.email, id: admin.id };
}

/** Autres comptes actifs au rôle Administrateur : il en faut toujours au moins un. */
async function otherAdminsCount(exceptId: number): Promise<number> {
  // Le compte de maintenance ne compte pas : le site doit garder son propre administrateur.
  return prisma.account.count({
    where: { role: { isAdmin: true }, status: "active", id: { not: exceptId }, email: { notIn: maintenanceEmails() } },
  });
}

async function target(id: number) {
  const acc = await prisma.account.findUnique({ where: { id }, include: { role: true } });
  // Le compte de maintenance ne se gère pas depuis le site.
  if (!acc || isMaintenanceEmail(acc.email)) throw new Error("Compte introuvable.");
  return acc;
}

async function findRole(id: number) {
  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) throw new Error("Rôle introuvable.");
  return role;
}

async function adminRole() {
  const existing = await prisma.role.findFirst({ where: { isAdmin: true }, orderBy: { id: "asc" } });
  return existing ?? prisma.role.create({ data: { name: "Administrateur", isAdmin: true } });
}

// ── Côté visiteur ────────────────────────────────────────────

/** « Demander un accès » : crée la demande pour l'adresse vérifiée par Cloudflare. */
export async function requestAccess(): Promise<ActionResult> {
  // Pas de garde de rôle : c'est justement l'action des adresses sans compte.
  const viewer = await getViewer();
  if (viewer.kind !== "unknown") return { ok: false, error: "Aucune demande à envoyer." };
  await prisma.account.upsert({
    where: { email: viewer.email },
    update: {},
    create: { email: viewer.email, status: "pending" },
  });
  await audit(viewer.email, "request", viewer.email);
  refresh();
  return { ok: true };
}

// ── Gestion des comptes (administrateur) ────────────────────

export async function approveAccount(id: number, roleId: number): Promise<ActionResult> {
  await requireAccess("accounts.manage");
  const me = await actingAdmin();
  const role = await findRole(roleId);
  const acc = await target(id);
  const approved = await prisma.account.updateMany({ where: { id, status: "pending" }, data: { status: "active", roleId: role.id, approvedAt: new Date() } });
  if (!approved.count) return { ok: false, error: "Ce compte ne fait plus partie des demandes en attente." };
  await audit(me.email, "approve", acc.email, role.name);
  refresh();
  return { ok: true };
}

export async function refuseAccount(id: number): Promise<ActionResult> {
  await requireAccess("accounts.manage");
  const me = await actingAdmin();
  const acc = await target(id);
  if (acc.id === me.id) return { ok: false, error: "Tu ne peux pas refuser ton propre compte." };
  const refused = await prisma.account.updateMany({ where: { id, status: "pending" }, data: { status: "refused" } });
  if (!refused.count) return { ok: false, error: "Ce compte ne fait plus partie des demandes en attente." };
  await audit(me.email, "refuse", acc.email);
  refresh();
  return { ok: true };
}

export async function setAccountBlocked(id: number, blocked: boolean): Promise<ActionResult> {
  await requireAccess("accounts.manage");
  const me = await actingAdmin();
  const acc = await target(id);
  if (acc.id === me.id) return { ok: false, error: "Tu ne peux pas bloquer ton propre compte." };
  if (blocked && acc.role?.isAdmin && (await otherAdminsCount(acc.id)) === 0) {
    return { ok: false, error: "C'est le dernier administrateur : impossible de le bloquer." };
  }
  await prisma.account.update({ where: { id }, data: { status: blocked ? "blocked" : "active" } });
  await audit(me.email, blocked ? "block" : "unblock", acc.email);
  refresh();
  return { ok: true };
}

export async function deleteAccount(id: number): Promise<ActionResult> {
  await requireAccess("accounts.manage");
  const me = await actingAdmin();
  const acc = await target(id);
  if (acc.id === me.id) return { ok: false, error: "Tu ne peux pas supprimer ton propre compte." };
  if (acc.role?.isAdmin && (await otherAdminsCount(acc.id)) === 0) {
    return { ok: false, error: "C'est le dernier administrateur : impossible de le supprimer." };
  }
  // Plateforme : la personne est aussi retirée de l'équipe chez Authentik (sinon elle garderait sa place).
  if (authMode() === "oidc") {
    const r = await retirerMembre(acc.email);
    if (!r.ok) return { ok: false, error: `Compte gardé : ${r.message}` };
  }
  await prisma.account.delete({ where: { id } });
  await audit(me.email, "delete", acc.email);
  refresh();
  return { ok: true };
}

export async function setAccountRole(id: number, roleId: number): Promise<ActionResult> {
  await requireAccess("accounts.manage");
  const me = await actingAdmin();
  const role = await findRole(roleId);
  const acc = await target(id);
  if (acc.id === me.id && !role.isAdmin) {
    return { ok: false, error: "Tu ne peux pas retirer ton propre rôle d'administrateur." };
  }
  if (acc.role?.isAdmin && !role.isAdmin && (await otherAdminsCount(acc.id)) === 0) {
    return { ok: false, error: "C'est le dernier administrateur : il doit le rester." };
  }
  await prisma.account.update({ where: { id }, data: { roleId: role.id } });
  await audit(me.email, "role", acc.email, `${acc.role?.name ?? "aucun"} → ${role.name}`);
  refresh();
  return { ok: true };
}

// ── Équipe (plateforme, connexion par Authentik) ────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * « Inviter un collaborateur » : la passerelle crée son compte de connexion
 * et lui envoie l'e-mail « Choisis ton mot de passe » ; ici, son compte est
 * prêt (actif, avec le rôle choisi) pour sa première visite.
 */
export async function inviteMember(emailInput: string, roleId: number): Promise<ActionResult & { notice?: string }> {
  await requireAccess("accounts.manage");
  if (authMode() !== "oidc") return { ok: false, error: "Les invitations n'existent qu'avec la connexion RecipeLog en ligne." };
  const me = await actingAdmin();
  const email = emailInput.trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false, error: "Cette adresse e-mail n'est pas valable." };
  if (isMaintenanceEmail(email)) return { ok: false, error: "Cette adresse ne peut pas être invitée depuis le site." };
  const role = await findRole(roleId);
  const existing = await prisma.account.findUnique({ where: { email } });
  if (existing?.status === "active") return { ok: false, error: "Cette personne a déjà un compte actif sur le site." };

  const r = await inviterMembre(email);
  let notice: string | undefined;
  if (!r.ok) {
    // Déjà dans l'équipe chez Authentik mais pas encore de compte ici : on le prépare quand même.
    if (r.code !== "deja_membre") return { ok: false, error: r.message };
    notice = "Cette personne faisait déjà partie de l'équipe : son compte est prêt, elle se connecte avec son mot de passe habituel.";
  }
  await prisma.account.upsert({
    where: { email },
    update: { status: "active", roleId: role.id, approvedAt: new Date() },
    create: { email, status: "active", roleId: role.id, approvedAt: new Date() },
  });
  await audit(me.email, "invite", email, role.name);
  refresh();
  return { ok: true, notice };
}

/** « Renvoyer l'invitation » : nouvel e-mail « Choisis ton mot de passe ». */
export async function resendInvitation(id: number): Promise<ActionResult> {
  await requireAccess("accounts.manage");
  if (authMode() !== "oidc") return { ok: false, error: "Les invitations n'existent qu'avec la connexion RecipeLog en ligne." };
  const me = await actingAdmin();
  const acc = await target(id);
  const r = await renvoyerInvitation(acc.email);
  if (!r.ok) return { ok: false, error: r.message };
  await audit(me.email, "invite_again", acc.email);
  return { ok: true };
}

// ── Rôles ────────────────────────────────────────────────────

function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 60);
}

/** Crée ou modifie un rôle : un nom et les permissions cochées. Renvoie l'id. */
export async function saveRole(
  id: number | null,
  name: string,
  permissions: string[],
  categoryIds: number[] = [],
): Promise<ActionResult & { id?: number }> {
  await requireAccess("accounts.manage");
  const me = await actingAdmin();
  const clean = cleanName(name);
  if (!clean) return { ok: false, error: "Donne un nom au rôle." };
  const perms = cleanPermissions(permissions);
  // Catégories visibles : seulement utiles sans « Voir toutes les recettes ».
  const known = await prisma.category.findMany({ where: { id: { in: categoryIds.filter(Number.isInteger) } }, select: { id: true } });
  const cats = perms.includes("recipes.view_all") ? [] : known.map((c) => c.id);
  const same = await prisma.role.findFirst({ where: { name: { equals: clean, mode: "insensitive" }, id: id ? { not: id } : undefined } });
  if (same) return { ok: false, error: `Un rôle « ${same.name} » existe déjà.` };
  if (id) {
    const role = await findRole(id);
    if (role.isAdmin) return { ok: false, error: "Le rôle Administrateur a toujours toutes les permissions." };
    await prisma.role.update({ where: { id }, data: { name: clean, permissions: perms, categoryIds: cats } });
    await audit(me.email, "role_edit", null, `${role.name === clean ? clean : `${role.name} → ${clean}`} : ${perms.length} permission(s)`);
    refresh();
    return { ok: true, id };
  }
  const role = await prisma.role.create({ data: { name: clean, permissions: perms, categoryIds: cats } });
  await audit(me.email, "role_create", null, `${clean} : ${perms.length} permission(s)`);
  refresh();
  return { ok: true, id: role.id };
}

export async function deleteRole(id: number): Promise<ActionResult> {
  await requireAccess("accounts.manage");
  const me = await actingAdmin();
  const role = await findRole(id);
  if (role.isAdmin) return { ok: false, error: "Le rôle Administrateur ne peut pas être supprimé." };
  const used = await prisma.account.count({ where: { roleId: id } });
  if (used > 0) {
    return { ok: false, error: `${used} compte${used > 1 ? "s ont" : " a"} ce rôle : donne-leur d'abord un autre rôle.` };
  }
  await prisma.role.delete({ where: { id } });
  await audit(me.email, "role_delete", null, role.name);
  refresh();
  return { ok: true };
}

// ── Voir comme ───────────────────────────────────────────────

export async function startViewAs(id: number): Promise<ActionResult> {
  await requireAccess("accounts.manage");
  const viewer = await getViewer();
  const admin = realManager(viewer);
  if (!admin) return { ok: false, error: "Il faut que les comptes soient activés." };
  if (viewer.kind === "account" && viewer.realAccount) {
    return { ok: false, error: "Reviens d'abord à ton compte." };
  }
  const acc = await target(id);
  if (acc.id === admin.id) return { ok: false, error: "C'est ton propre compte." };
  if (!canBeViewedAs(acc)) {
    return { ok: false, error: "Possible seulement pour un compte actif qui n'est pas administrateur." };
  }
  (await cookies()).set(VIEW_AS_COOKIE, await viewAsCookieValue(acc.id, admin.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  await audit(admin.email, "view_as_start", acc.email);
  refresh();
  return { ok: true };
}

export async function stopViewAs(): Promise<ActionResult> {
  // L'administrateur regarde avec les droits d'un autre : on vérifie son vrai compte.
  const viewer = await getViewer();
  const real = realAccountOf(viewer);
  (await cookies()).delete(VIEW_AS_COOKIE);
  if (viewer.kind === "account" && viewer.realAccount && real) {
    await audit(real.email, "view_as_stop", viewer.account.email);
  }
  refresh();
  return { ok: true };
}

// ── Réglages Cloudflare et activation ───────────────────────

/** Plateforme : la connexion passe par Authentik, les réglages Cloudflare ne servent pas. */
const CLOUDFLARE_OFF = "Ce site se connecte par RecipeLog en ligne : les réglages Cloudflare ne servent pas ici.";

export type CloudflareTest =
  | { ok: true; email: string }
  | { ok: false; error: string };

/** Teste l'équipe et l'AUD avec le jeton de la requête en cours, sans rien enregistrer. */
export async function testCloudflare(team: string, aud: string): Promise<CloudflareTest> {
  await requireAccess("accounts.manage");
  if (authMode() === "oidc") return { ok: false, error: CLOUDFLARE_OFF };
  const h = await headers();
  const c = await cookies();
  const token = tokenFromRequest(h.get("cf-access-jwt-assertion"), c.get("CF_Authorization")?.value);
  if (!token) {
    return {
      ok: false,
      error: "Aucun jeton Cloudflare reçu : ouvre le site par son adresse Cloudflare (pas par l'adresse locale).",
    };
  }
  const check = await verifyCloudflareJwt(token, { team, aud });
  return check.ok ? { ok: true, email: check.email } : { ok: false, error: check.error };
}

export async function saveCloudflareSettings(team: string, aud: string): Promise<ActionResult> {
  await requireAccess("accounts.manage");
  if (authMode() === "oidc") return { ok: false, error: CLOUDFLARE_OFF };
  const me = await actingAdmin();
  const current = await getAuthSettings();
  if (!normalizeTeam(team) || !aud.trim()) return { ok: false, error: "Renseigne l'équipe et l'AUD." };
  if (current.enabled) {
    // Comptes actifs : on refuse un réglage qui ne reconnaîtrait plus la personne qui l'enregistre.
    const test = await testCloudflare(team, aud);
    if (!test.ok) return { ok: false, error: `Réglage refusé, il te bloquerait dehors : ${test.error}` };
  }
  await saveAuthSettings({ enabled: current.enabled, team, aud });
  await audit(me.email, "cloudflare", null, normalizeTeam(team));
  refresh();
  return { ok: true };
}

/**
 * Active les comptes. Il faut un jeton Cloudflare valable avec les réglages
 * enregistrés : la personne qui active devient administrateur, ce qui évite
 * de se retrouver dehors.
 */
export async function enableAccounts(): Promise<ActionResult> {
  await requireAccess("accounts.manage");
  if (authMode() === "oidc") return { ok: false, error: CLOUDFLARE_OFF };
  const settings = await getAuthSettings();
  if (settings.enabled) return { ok: true };
  if (!settings.team || !settings.aud) return { ok: false, error: "Enregistre d'abord l'équipe et l'AUD Cloudflare." };
  const who = await verifiedEmail();
  if ("error" in who) return { ok: false, error: who.error };
  const admin = await adminRole();
  await prisma.account.upsert({
    where: { email: who.email },
    update: { roleId: admin.id, status: "active" },
    create: { email: who.email, roleId: admin.id, status: "active", approvedAt: new Date() },
  });
  await saveAuthSettings({ ...settings, enabled: true });
  await audit(who.email, "enable");
  refresh();
  return { ok: true };
}

export async function disableAccounts(): Promise<ActionResult> {
  await requireAccess("accounts.manage");
  if (authMode() === "oidc") return { ok: false, error: CLOUDFLARE_OFF };
  const me = await actingAdmin();
  const settings = await getAuthSettings();
  await saveAuthSettings({ ...settings, enabled: false });
  (await cookies()).delete(VIEW_AS_COOKIE);
  await audit(me.email, "disable");
  refresh();
  return { ok: true };
}
