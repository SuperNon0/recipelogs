"use server";

import { revalidatePath } from "next/cache";
import { deleteMcpToken, regenerateMcpToken } from "@/lib/mcp/token";

/** Active l'accès MCP, ou change sa clé (l'ancienne adresse ne marche plus). */
export async function regenerateMcpAccess(): Promise<string> {
  const token = await regenerateMcpToken();
  revalidatePath("/settings/mcp");
  revalidatePath("/settings");
  return token;
}

/** Coupe l'accès MCP : l'adresse renvoie « introuvable ». */
export async function disableMcpAccess(): Promise<void> {
  await deleteMcpToken();
  revalidatePath("/settings/mcp");
  revalidatePath("/settings");
}
