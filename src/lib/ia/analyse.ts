import { prisma } from "@/lib/prisma";
import { getQuotaIA } from "@/lib/auth/passerelle";
import { getReglagesIA, surPlateforme } from "./reglages";

/**
 * Comment on fait lire une facture ou une mercuriale déposée sur le site :
 * - « ia » : l'IA la lit tout de suite (IA de RecipeLog ou propre clé du client) ;
 * - « mcp » : elle attend dans « À traiter » et Claude la remplit par le
 *   connecteur RecipeLog (MCP).
 * Sur la plateforme, le panel dit ce que le client a le droit d'utiliser
 * (IA, MCP ou les deux). Avec les deux, le client choisit son mode préféré
 * dans Réglages → Lecture des factures (table settings, clé « analyse ») :
 * c'est le bouton mis en avant à chaque dépôt. Hors plateforme : les deux.
 * Sa propre clé d'IA reste toujours possible : elle ne coûte rien à RecipeLog.
 */
export type ModeAnalyse = "ia" | "mcp";
export type PermisPanel = "les-deux" | "ia" | "mcp";
export type ModesAnalyse = {
  /** Ce que le panel permet (« les-deux » hors plateforme). */
  panel: PermisPanel;
  ia: boolean;
  mcp: boolean;
  /** Le mode mis en avant : celui choisi dans les réglages, ou le seul permis. */
  prefere: ModeAnalyse;
};

const KEY = "analyse";

export async function getPrefere(): Promise<ModeAnalyse | null> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } }).catch(() => null);
  const v = (row?.value ?? {}) as { prefere?: unknown };
  return v.prefere === "ia" || v.prefere === "mcp" ? v.prefere : null;
}

export async function savePrefere(prefere: ModeAnalyse): Promise<void> {
  const value = { prefere };
  await prisma.setting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
}

/** Ce que permet le panel : lu sur la passerelle ; s'il ne répond pas, on ne coupe rien. */
export async function permisPanel(): Promise<PermisPanel> {
  if (!surPlateforme()) return "les-deux";
  const q = await getQuotaIA();
  return q.ok && q.quota.analyse ? q.quota.analyse : "les-deux";
}

/** Règle pure (testée) : ce qui est permis et le bouton mis en avant. */
export function calculerModes(panel: PermisPanel, modeIA: "plateforme" | "cle" | "off", choisi: ModeAnalyse | null): ModesAnalyse {
  // « Claude (MCP) seulement » coupe l'IA de RecipeLog, pas la clé du client.
  const ia = panel !== "mcp" || modeIA === "cle";
  const mcp = panel !== "ia";
  // Sans choix : l'IA si elle est réglée, sinon Claude.
  const prefere: ModeAnalyse = !ia ? "mcp" : !mcp ? "ia" : (choisi ?? (modeIA === "off" ? "mcp" : "ia"));
  return { panel, ia, mcp, prefere };
}

export async function modesAnalyse(): Promise<ModesAnalyse> {
  const [panel, reglages, choisi] = await Promise.all([permisPanel(), getReglagesIA(), getPrefere()]);
  return calculerModes(panel, reglages.mode, choisi);
}
