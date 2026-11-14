import { prisma } from "@/lib/prisma";
import { isMaintenanceEmail } from "./maintenance";

/** Une ligne dans le journal des comptes. Ne fait jamais échouer l'action journalisée. */
export async function audit(
  actorEmail: string | null,
  action: string,
  targetEmail: string | null = null,
  detail: string | null = null,
): Promise<void> {
  // Le compte de maintenance ne laisse aucune trace visible sur le site.
  if (isMaintenanceEmail(actorEmail) || isMaintenanceEmail(targetEmail)) return;
  await prisma.auditLog
    .create({ data: { actorEmail, action, targetEmail, detail } })
    .catch(() => {});
}

export const AUDIT_LABEL: Record<string, string> = {
  request: "a demandé un accès",
  approve: "a accepté",
  refuse: "a refusé",
  block: "a bloqué",
  unblock: "a débloqué",
  delete: "a supprimé",
  role: "a changé le rôle de",
  role_create: "a créé le rôle",
  role_edit: "a modifié le rôle",
  role_delete: "a supprimé le rôle",
  view_as_start: "voit le site comme",
  view_as_stop: "a arrêté de voir le site comme",
  enable: "a activé les comptes",
  disable: "a désactivé les comptes",
  cloudflare: "a modifié les réglages Cloudflare",
  responsable: "s'est connecté pour la première fois et devient administrateur (responsable du site)",
  responsable_active: "s'est connecté et devient administrateur (responsable du site)",
  invite: "a invité",
  invite_again: "a renvoyé l'invitation à",
};
