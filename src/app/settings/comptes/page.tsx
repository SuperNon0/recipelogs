import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePage } from "@/lib/auth/guard";
import { authForcedOff, getAuthSettings } from "@/lib/auth/config";
import { realAccountOf } from "@/lib/auth/viewer";
import { AUDIT_LABEL } from "@/lib/auth/audit";
import { AccountsManager, type AccountInfo, type AuditInfo, type RoleInfo } from "@/components/settings/AccountsManager";
import { cleanPermissions } from "@/lib/auth/permissions";
import { isMaintenanceEmail } from "@/lib/auth/maintenance";

export const dynamic = "force-dynamic";

export default async function AccountsSettingsPage() {
  const viewer = await requirePage("accounts.manage");
  const [settings, roles, accounts, log, categories] = await Promise.all([
    getAuthSettings(),
    prisma.role.findMany({ orderBy: [{ isAdmin: "desc" }, { name: "asc" }] }),
    prisma.account.findMany({ orderBy: [{ createdAt: "asc" }] }),
    prisma.auditLog.findMany({ orderBy: { at: "desc" }, take: 40 }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, color: true } }),
  ]);
  const me = realAccountOf(viewer);

  // Le compte de maintenance (.env du serveur) n'est jamais affiché.
  const visible = accounts.filter((a) => !isMaintenanceEmail(a.email));
  const rows: AccountInfo[] = visible.map((a) => ({
    id: a.id,
    email: a.email,
    roleId: a.roleId,
    status: a.status,
    createdAt: a.createdAt.toISOString(),
    lastSeenAt: a.lastSeenAt?.toISOString() ?? null,
    isMe: a.id === me?.id,
  }));
  const roleRows: RoleInfo[] = roles.map((r) => ({
    id: r.id,
    name: r.name,
    isAdmin: r.isAdmin,
    permissions: cleanPermissions(r.permissions),
    categoryIds: r.categoryIds,
    accounts: visible.filter((a) => a.roleId === r.id).length,
  }));
  const entries: AuditInfo[] = log
    .filter((l) => !isMaintenanceEmail(l.actorEmail) && !isMaintenanceEmail(l.targetEmail))
    .map((l) => ({
    id: l.id,
    at: l.at.toISOString(),
    text: [l.actorEmail ?? "Quelqu'un", AUDIT_LABEL[l.action] ?? l.action, l.targetEmail].filter(Boolean).join(" "),
    detail: l.detail,
  }));

  return (
    <div className="set-page">
      <Link href="/settings" className="crumb">
        <ChevronLeft size={14} /> Réglages
      </Link>
      <div className="page-head">
        <h1>Comptes</h1>
        <p className="sub">Qui peut entrer sur RecipeLog, et ce que chacun peut y faire</p>
      </div>
      <AccountsManager
        enabled={settings.enabled}
        forcedOff={authForcedOff()}
        team={settings.team}
        aud={settings.aud}
        roles={roleRows}
        categories={categories}
        accounts={rows}
        log={entries}
      />
    </div>
  );
}
