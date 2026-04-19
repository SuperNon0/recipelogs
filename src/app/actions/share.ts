"use server";

import { revalidatePath } from "next/cache";
import { createShareToken, revokeShareToken } from "@/lib/share";

export type ActionResult = { ok: true; token: string } | { ok: false; error: string };

export async function generateShareToken(
  entityType: "recipe" | "cookbook",
  entityId: number,
): Promise<ActionResult> {
  try {
    const token = await createShareToken(entityType, entityId);
    revalidatePath(
      entityType === "recipe" ? `/recipes/${entityId}` : `/cookbooks/${entityId}`,
    );
    return { ok: true, token };
  } catch {
    return { ok: false, error: "Impossible de générer le lien." };
  }
}

export async function revokeToken(
  token: string,
  entityType: "recipe" | "cookbook",
  entityId: number,
): Promise<{ ok: boolean }> {
  await revokeShareToken(token);
  revalidatePath(
    entityType === "recipe" ? `/recipes/${entityId}` : `/cookbooks/${entityId}`,
  );
  return { ok: true };
}
