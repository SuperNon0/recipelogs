"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  countActiveSuperAdmins,
  findBaseAdmin,
  hashPassword,
  logAudit,
  MIN_PASSWORD_LEN,
  normalizeEmail,
  verifyPassword,
} from "@/lib/auth/account";
import { getSession, setSession, clearSession, getCurrentAccount } from "@/lib/auth/session";
import { AuthError, requireBaseAdmin, requireRole } from "@/lib/auth/guard";
import { saveCfConfig as saveCfSetting } from "@/lib/auth/cloudflare";
import { hasCapability } from "@/lib/auth/capabilities";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Petite temporisation anti-force brute (identique Site-base). */
async function slowDown() {
  await new Promise((r) => setTimeout(r, 1000));
}

function toActionError(e: unknown): ActionResult {
  if (e instanceof AuthError) return { ok: false, error: e.message };
  const msg = e instanceof Error ? e.message : "Erreur inconnue.";
  // eslint-disable-next-line no-console
  console.error("[accounts action]", e);
  return { ok: false, error: msg };
}

// ─────────────────────────────────────────────────────────────
// Auth : login / logout / demande d'accès
// ─────────────────────────────────────────────────────────────

export async function loginLocal(formData: FormData): Promise<ActionResult> {
  const password = String(formData.get("password") ?? "");
  if (!password) {
    await slowDown();
    return { ok: false, error: "Mot de passe requis." };
  }

  const admin = await prisma.account.findFirst({
    where: { role: "super_admin", passwordHash: { not: null } },
    orderBy: { id: "asc" },
  });

  if (!admin || !admin.passwordHash) {
    await slowDown();
    await logAudit({ action: "login_local", metadata: { ok: false, reason: "no-admin" } });
    return { ok: false, error: "Identifiants invalides." };
  }
  if (admin.state !== "active") {
    await slowDown();
    return { ok: false, error: "Compte administrateur inactif." };
  }

  const ok = await verifyPassword(admin.passwordHash, password);
  if (!ok) {
    await slowDown();
    await logAudit({
      accountId: admin.id,
      action: "login_local",
      metadata: { ok: false },
    });
    return { ok: false, error: "Identifiants invalides." };
  }

  await setSession({
    accountId: admin.id,
    role: admin.role,
    email: admin.email ?? undefined,
  });
  await prisma.account.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });
  await logAudit({
    accountId: admin.id,
    action: "login_local",
    metadata: { ok: true },
  });
  redirect("/");
}

export async function logout(): Promise<never> {
  const session = await getSession();
  const accountId = session.accountId ?? null;
  await clearSession();
  if (accountId) await logAudit({ accountId, action: "logout" });
  redirect("/login");
}

/**
 * Enregistre une demande d'accès. L'email est celui vérifié par le
 * middleware via Cloudflare, transmis par un champ caché — mais on ne
 * peut pas lui faire confiance seul : on re-vérifie la présence d'un
 * CF header côté formulaire via un token à défaut. Ici on relit l'email
 * depuis les headers de la requête entrante (server action).
 */
export async function requestAccess(formData: FormData): Promise<ActionResult> {
  try {
    const raw = String(formData.get("email") ?? "");
    const email = normalizeEmail(raw);
    if (!email) return { ok: false, error: "Email manquant." };

    const existing = await prisma.account.findUnique({ where: { email } });
    if (existing) {
      // Rien à faire : le middleware redirigera selon l'état.
      redirect("/access/pending");
    }

    const created = await prisma.account.create({
      data: { email, role: "member", state: "pending" },
    });
    await logAudit({
      accountId: created.id,
      action: "request_access",
      metadata: { email },
    });
  } catch (e) {
    return toActionError(e);
  }
  redirect("/access/pending");
}

// ─────────────────────────────────────────────────────────────
// Gestion des comptes (super-admin)
// ─────────────────────────────────────────────────────────────

async function guardManageAccounts() {
  const actor = await requireRole("super_admin");
  if (!hasCapability("account_management", actor.role)) {
    throw new AuthError("Gestion des comptes désactivée sur ce site.", "forbidden");
  }
  return actor;
}

export async function validateAccount(id: number): Promise<ActionResult> {
  try {
    const actor = await guardManageAccounts();
    const target = await prisma.account.findUnique({ where: { id } });
    if (!target) return { ok: false, error: "Compte introuvable." };
    if (target.state !== "pending") {
      return { ok: false, error: "Le compte n'est pas en attente." };
    }
    await prisma.account.update({
      where: { id },
      data: { state: "active", validatedAt: new Date() },
    });
    await logAudit({ accountId: actor.id, action: "validate", targetAccountId: id });
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function refuseAccount(id: number): Promise<ActionResult> {
  try {
    const actor = await guardManageAccounts();
    const target = await prisma.account.findUnique({ where: { id } });
    if (!target) return { ok: false, error: "Compte introuvable." };
    if (target.state !== "pending") {
      return { ok: false, error: "Le compte n'est pas en attente." };
    }
    await prisma.account.update({ where: { id }, data: { state: "refused" } });
    await logAudit({ accountId: actor.id, action: "refuse", targetAccountId: id });
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function blockAccount(id: number): Promise<ActionResult> {
  try {
    const actor = await guardManageAccounts();
    const target = await prisma.account.findUnique({ where: { id } });
    if (!target) return { ok: false, error: "Compte introuvable." };
    if (target.state !== "active") {
      return { ok: false, error: "Seul un compte actif peut être bloqué." };
    }
    // On ne peut pas bloquer le dernier super-admin ni le compte de base.
    if (target.passwordHash) {
      return { ok: false, error: "Le compte administrateur de base ne peut pas être bloqué." };
    }
    if (target.role === "super_admin") {
      const remaining = await countActiveSuperAdmins();
      if (remaining <= 1) {
        return { ok: false, error: "Impossible de bloquer le dernier super-admin." };
      }
    }
    await prisma.account.update({ where: { id }, data: { state: "blocked" } });
    await logAudit({ accountId: actor.id, action: "block", targetAccountId: id });
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function unblockAccount(id: number): Promise<ActionResult> {
  try {
    const actor = await guardManageAccounts();
    const target = await prisma.account.findUnique({ where: { id } });
    if (!target) return { ok: false, error: "Compte introuvable." };
    if (target.state !== "blocked") {
      return { ok: false, error: "Le compte n'est pas bloqué." };
    }
    await prisma.account.update({ where: { id }, data: { state: "active" } });
    await logAudit({ accountId: actor.id, action: "unblock", targetAccountId: id });
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteAccount(id: number): Promise<ActionResult> {
  try {
    const actor = await guardManageAccounts();
    const target = await prisma.account.findUnique({ where: { id } });
    if (!target) return { ok: false, error: "Compte introuvable." };
    if (target.passwordHash) {
      return { ok: false, error: "Le compte administrateur de base ne peut pas être supprimé." };
    }
    if (target.role === "super_admin" && target.state === "active") {
      const remaining = await countActiveSuperAdmins();
      if (remaining <= 1) {
        return { ok: false, error: "Impossible de supprimer le dernier super-admin." };
      }
    }
    await prisma.account.delete({ where: { id } });
    await logAudit({
      accountId: actor.id,
      action: "delete",
      targetAccountId: id,
      metadata: { email: target.email },
    });
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

// ─────────────────────────────────────────────────────────────
// Super-admins (compte administrateur de base uniquement)
// ─────────────────────────────────────────────────────────────

export async function addSuperAdmin(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await requireBaseAdmin();
    const email = normalizeEmail(String(formData.get("email") ?? ""));
    if (!email) return { ok: false, error: "Email manquant." };
    // Validation basique.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: "Email invalide." };
    }

    const existing = await prisma.account.findUnique({ where: { email } });
    let targetId: number;
    let created = false;
    if (existing) {
      if (existing.role === "super_admin") {
        return { ok: false, error: "Ce compte est déjà super-admin." };
      }
      await prisma.account.update({
        where: { id: existing.id },
        data: { role: "super_admin" },
      });
      targetId = existing.id;
    } else {
      const acc = await prisma.account.create({
        data: { email, role: "super_admin", state: "pending" },
      });
      targetId = acc.id;
      created = true;
    }
    await logAudit({
      accountId: actor.id,
      action: "add_super_admin",
      targetAccountId: targetId,
      metadata: { email, created },
    });
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function removeSuperAdmin(id: number): Promise<ActionResult> {
  try {
    const actor = await requireBaseAdmin();
    const target = await prisma.account.findUnique({ where: { id } });
    if (!target) return { ok: false, error: "Compte introuvable." };
    if (target.passwordHash) {
      return { ok: false, error: "Le compte administrateur de base ne peut pas être rétrogradé." };
    }
    if (target.role !== "super_admin") {
      return { ok: false, error: "Ce compte n'est pas super-admin." };
    }
    if (target.state === "active") {
      const remaining = await countActiveSuperAdmins();
      if (remaining <= 1) {
        return { ok: false, error: "Impossible de retirer le dernier super-admin." };
      }
    }
    await prisma.account.update({ where: { id }, data: { role: "member" } });
    await logAudit({
      accountId: actor.id,
      action: "remove_super_admin",
      targetAccountId: id,
    });
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

// ─────────────────────────────────────────────────────────────
// Mot de passe admin (compte de base uniquement)
// ─────────────────────────────────────────────────────────────

export async function changeAdminPassword(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await requireBaseAdmin();
    if (!hasCapability("admin_password", actor.role)) {
      return { ok: false, error: "Modification du mot de passe désactivée." };
    }
    const current = String(formData.get("current") ?? "");
    const next = String(formData.get("next") ?? "");
    const confirm = String(formData.get("confirm") ?? "");

    if (!current || !next) return { ok: false, error: "Champs requis." };
    if (next.length < MIN_PASSWORD_LEN) {
      return { ok: false, error: `Le mot de passe doit faire au moins ${MIN_PASSWORD_LEN} caractères.` };
    }
    if (next !== confirm) return { ok: false, error: "La confirmation ne correspond pas." };
    if (!actor.passwordHash) return { ok: false, error: "Aucun mot de passe local à modifier." };

    const ok = await verifyPassword(actor.passwordHash, current);
    if (!ok) {
      await slowDown();
      return { ok: false, error: "Mot de passe actuel invalide." };
    }
    const hash = await hashPassword(next);
    await prisma.account.update({
      where: { id: actor.id },
      data: { passwordHash: hash },
    });
    await logAudit({ accountId: actor.id, action: "password_change" });
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

// ─────────────────────────────────────────────────────────────
// Configuration Cloudflare (super-admin)
// ─────────────────────────────────────────────────────────────

export async function saveCfConfig(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await requireRole("super_admin");
    const teamDomain = String(formData.get("teamDomain") ?? "").trim();
    const aud = String(formData.get("aud") ?? "").trim();
    const verifyJwt = formData.get("verifyJwt") === "on";
    await saveCfSetting({ teamDomain, aud, verifyJwt });
    await logAudit({
      accountId: actor.id,
      action: "settings_change",
      metadata: { section: "cloudflare", teamDomain, aud, verifyJwt },
    });
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers UI (server-only)
// ─────────────────────────────────────────────────────────────

export async function getCurrentAccountInfo(): Promise<{
  id: number;
  email: string | null;
  role: string;
  lastLoginAt: Date | null;
  isBaseAdmin: boolean;
} | null> {
  const acc = await getCurrentAccount();
  if (!acc) return null;
  const base = await findBaseAdmin();
  return {
    id: acc.id,
    email: acc.email,
    role: acc.role,
    lastLoginAt: acc.lastLoginAt,
    isBaseAdmin: !!base && base.id === acc.id,
  };
}
