import { prisma } from "./prisma";
import { buildRecipeSnapshot, getCookbookDetail } from "./cookbooks";

export async function createShareToken(
  entityType: "recipe" | "cookbook",
  entityId: number,
): Promise<string> {
  // Révoquer les tokens existants actifs pour cette entité
  await prisma.shareToken.updateMany({
    where: { entityType, entityId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const token = crypto.randomUUID().replace(/-/g, "");
  await prisma.shareToken.create({
    data: { token, entityType, entityId },
  });
  return token;
}

export async function revokeShareToken(token: string) {
  await prisma.shareToken.updateMany({
    where: { token },
    data: { revokedAt: new Date() },
  });
}

export async function getActiveToken(
  entityType: "recipe" | "cookbook",
  entityId: number,
) {
  return prisma.shareToken.findFirst({
    where: { entityType, entityId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function resolveShareToken(token: string) {
  const row = await prisma.shareToken.findUnique({ where: { token } });
  if (!row || row.revokedAt) return null;
  return row;
}

export async function getPublicRecipeData(recipeId: number) {
  return buildRecipeSnapshot(recipeId);
}

export async function getPublicCookbookData(cookbookId: number) {
  return getCookbookDetail(cookbookId);
}
