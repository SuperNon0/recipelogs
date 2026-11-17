"use server";

import { requireAccess } from "@/lib/auth/guard";
import { revalidatePath } from "next/cache";
import { deleteMcpToken, regenerateMcpToken } from "@/lib/mcp/token";
import { revokeAllOauth } from "@/lib/mcp/oauth";

/** Active l'accès MCP, ou change sa clé (l'ancienne adresse ne marche plus). */
export async function regenerateMcpAccess(): Promise<string> {
  await requireAccess("mcp.manage");
  const token = await regenerateMcpToken();
  revalidatePath("/settings/mcp");
  revalidatePath("/settings");
  return token;
}

/** Coupe l'accès MCP : l'adresse renvoie « introuvable ». */
export async function disableMcpAccess(): Promise<void> {
  await requireAccess("mcp.manage");
  await deleteMcpToken();
  revalidatePath("/settings/mcp");
  revalidatePath("/settings");
}

/** Déconnecte Claude (connexion par compte) : tous les jetons OAuth déjà donnés cessent de marcher. */
export async function revokeMcpOauth(): Promise<void> {
  await requireAccess("mcp.manage");
  await revokeAllOauth();
  revalidatePath("/settings/mcp");
}
