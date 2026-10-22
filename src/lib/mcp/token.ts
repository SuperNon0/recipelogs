import { randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

/** Clé secrète de l'accès MCP, rangée dans la table settings. Absente = accès coupé. */
const MCP_TOKEN_KEY = "mcpToken";

export async function getMcpToken(): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: MCP_TOKEN_KEY } });
  return typeof row?.value === "string" && row.value.length >= 32 ? row.value : null;
}

/** Crée (ou remplace) la clé : l'ancienne adresse cesse aussitôt de marcher. */
export async function regenerateMcpToken(): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.setting.upsert({
    where: { key: MCP_TOKEN_KEY },
    update: { value: token },
    create: { key: MCP_TOKEN_KEY, value: token },
  });
  return token;
}

export async function deleteMcpToken(): Promise<void> {
  await prisma.setting.deleteMany({ where: { key: MCP_TOKEN_KEY } });
}

/** Comparaison en temps constant, pour ne rien laisser deviner de la clé. */
export function tokensMatch(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
