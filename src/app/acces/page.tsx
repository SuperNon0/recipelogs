import { redirect } from "next/navigation";
import { AccessGate } from "@/components/auth/AccessGate";
import { getViewer, viewerCan } from "@/lib/auth/viewer";
import { isPermission, type Access } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

/**
 * Page où renvoient les gardes (lib/auth/guard.ts) quand une page n'est pas
 * permise : explique pourquoi (en attente, bloqué, lecture seule…).
 * Sans garde elle-même, puisque c'est elle qui accueille les refus.
 */
export default async function AccessPage({ searchParams }: { searchParams: Promise<{ besoin?: string }> }) {
  const { besoin } = await searchParams;
  const need: Access = isPermission(besoin) ? besoin : "read";
  const viewer = await getViewer();
  if (viewerCan(viewer, need)) redirect("/");
  return <AccessGate viewer={viewer} need={need} />;
}
