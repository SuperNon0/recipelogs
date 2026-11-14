import { prisma } from "@/lib/prisma";
import { isDemo } from "@/lib/demo";

/**
 * Réglages de la lecture des factures par IA (table settings, clé « ia ») :
 * - plateforme : RecipeLog fournit l'IA (clé de la plateforme, avec un
 *   nombre de lectures par mois réglé dans le panel). Seulement sur la
 *   plateforme (la passerelle est réglée) ;
 * - cle : le client met sa propre clé (Claude, ChatGPT ou Gemini), il paie
 *   directement son fournisseur d'IA, sans limite de la plateforme ;
 * - off : pas de lecture par IA.
 * La clé n'est jamais renvoyée au navigateur : seulement ses 4 derniers caractères.
 */
export type FournisseurIA = "anthropic" | "openai" | "gemini";
export type ModeIA = "plateforme" | "cle" | "off";
export type ReglagesIA = { mode: ModeIA; fournisseur: FournisseurIA; cle: string; modele: string };

export const FOURNISSEURS_IA: { id: FournisseurIA; nom: string; modele: string; ouObtenir: string }[] = [
  { id: "anthropic", nom: "Claude (Anthropic)", modele: "claude-opus-5-5", ouObtenir: "https://platform.claude.com/settings/keys" },
  { id: "openai", nom: "ChatGPT (OpenAI)", modele: "gpt-5", ouObtenir: "https://platform.openai.com/api-keys" },
  { id: "gemini", nom: "Gemini (Google)", modele: "gemini-2.5-flash", ouObtenir: "https://aistudio.google.com/apikey" },
];

/** Modèle utilisé avec la clé de la plateforme (la passerelle refuse les autres). */
export const MODELE_PLATEFORME = "claude-opus-5-5";

const KEY = "ia";

export function surPlateforme(): boolean {
  return !!(process.env.RECIPELOG_PASSERELLE_URL?.trim() && process.env.RECIPELOG_PASSERELLE_CLE?.trim());
}

const estFournisseur = (v: unknown): v is FournisseurIA => v === "anthropic" || v === "openai" || v === "gemini";

export async function getReglagesIA(): Promise<ReglagesIA> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } }).catch(() => null);
  const v = (row?.value ?? {}) as Partial<ReglagesIA>;
  const fournisseur = estFournisseur(v.fournisseur) ? v.fournisseur : "anthropic";
  let mode: ModeIA = v.mode === "cle" || v.mode === "off" || v.mode === "plateforme" ? v.mode : surPlateforme() ? "plateforme" : "off";
  if (mode === "plateforme" && !surPlateforme()) mode = "off";
  if (isDemo()) mode = "off";
  return {
    mode,
    fournisseur,
    cle: typeof v.cle === "string" ? v.cle : "",
    modele: typeof v.modele === "string" && v.modele.trim() ? v.modele.trim() : FOURNISSEURS_IA.find((f) => f.id === fournisseur)!.modele,
  };
}

/** Ce que la page Réglages voit (sans la clé). */
export type ReglagesIAPublic = Omit<ReglagesIA, "cle"> & { cleFin: string | null; plateforme: boolean; demo: boolean };

export function versPublic(r: ReglagesIA): ReglagesIAPublic {
  const { cle, ...reste } = r;
  return { ...reste, cleFin: cle ? cle.slice(-4) : null, plateforme: surPlateforme(), demo: isDemo() };
}

/** cle vide = garder la clé déjà enregistrée ; cle « - » = l'effacer. */
export async function saveReglagesIA(next: { mode: ModeIA; fournisseur: FournisseurIA; cle?: string; modele?: string }): Promise<ReglagesIA> {
  const avant = await getReglagesIA();
  const cleTapee = (next.cle ?? "").trim();
  const cle = cleTapee === "-" ? "" : cleTapee || (next.fournisseur === avant.fournisseur ? avant.cle : "");
  if (next.mode === "plateforme" && !surPlateforme()) throw new Error("La clé de la plateforme n'existe que sur un RecipeLog hébergé par RecipeLog.");
  if (next.mode === "cle" && !cle) throw new Error("Colle ta clé d'API pour utiliser ta propre IA.");
  if (cle && (cle.length > 400 || /\s/.test(cle))) throw new Error("Cette clé n'a pas l'air valable (pas d'espace, 400 caractères au plus).");
  const modele = (next.modele ?? "").trim().slice(0, 100);
  if (modele && !/^[A-Za-z0-9._:/-]+$/.test(modele)) throw new Error("Nom de modèle invalide.");
  const value = { mode: next.mode, fournisseur: next.fournisseur, cle, modele };
  await prisma.setting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
  return getReglagesIA();
}
