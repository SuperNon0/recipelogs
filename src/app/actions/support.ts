"use server";

import { revalidatePath } from "next/cache";
import { requireAccess } from "@/lib/auth/guard";
import { realAccountOf, type Viewer } from "@/lib/auth/viewer";
import { authMode } from "@/lib/auth/config";
import { fullVersion } from "@/lib/version";
import { ajouterMessageDemande, creerDemande, marquerDemandeLue, type TypeDemande } from "@/lib/auth/passerelle";

export type SupportResult = { ok: true } | { ok: false; error: string };

const court = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\r\n]+/g, " ").trim().slice(0, max) : "");

/** Compte connecté (connexion par la plateforme seulement) : son adresse et son rôle. */
function moi(viewer: Viewer) {
  if (authMode() !== "oidc") throw new Error("« Signaler un problème » n'existe que sur les RecipeLog hébergés par RecipeLog.");
  const compte = realAccountOf(viewer);
  if (!compte?.email) throw new Error("Connecte-toi d'abord.");
  return { email: compte.email.toLowerCase(), role: compte.role?.name ?? "" };
}

function erreur(e: unknown): SupportResult {
  return { ok: false, error: e instanceof Error ? e.message : "Erreur inattendue." };
}

const reglageManquant = (code: string, message: string) =>
  code === "reglage" ? "Le support n'est pas réglé sur ce serveur. Écris directement à RecipeLog." : message;

/** Nouvelle demande. La page, l'écran et le navigateur viennent du navigateur ; version et rôle, du serveur. */
export async function envoyerDemande(input: {
  type: string;
  message: string;
  page?: string;
  navigateur?: string;
  ecran?: string;
}): Promise<SupportResult> {
  try {
    const { email, role } = moi(await requireAccess("read"));
    const message = typeof input.message === "string" ? input.message.trim() : "";
    if (message.length < 3) return { ok: false, error: "Décris le problème en quelques mots." };
    const type: TypeDemande = input.type === "bug" || input.type === "idee" ? input.type : "question";
    const r = await creerDemande({
      email,
      type,
      message: message.slice(0, 5000),
      contexte: {
        page: court(input.page, 300),
        navigateur: court(input.navigateur, 300),
        ecran: court(input.ecran, 40),
        version: fullVersion(),
        role,
      },
    });
    if (!r.ok) return { ok: false, error: reglageManquant(r.code, r.message) };
    revalidatePath("/settings/support");
    return { ok: true };
  } catch (e) {
    return erreur(e);
  }
}

/** La personne répond dans une de ses demandes. */
export async function repondreDemande(id: string, message: string): Promise<SupportResult> {
  try {
    const { email } = moi(await requireAccess("read"));
    const texte = typeof message === "string" ? message.trim() : "";
    if (!texte) return { ok: false, error: "Le message est vide." };
    const r = await ajouterMessageDemande(id, email, texte.slice(0, 5000));
    if (!r.ok) return { ok: false, error: reglageManquant(r.code, r.message) };
    revalidatePath("/settings/support");
    return { ok: true };
  } catch (e) {
    return erreur(e);
  }
}

/** Réponse du support vue : la pastille « nouvelle réponse » disparaît. */
export async function voirDemande(id: string): Promise<SupportResult> {
  try {
    const { email } = moi(await requireAccess("read"));
    const r = await marquerDemandeLue(id, email);
    if (!r.ok) return { ok: false, error: r.message };
    revalidatePath("/settings/support");
    return { ok: true };
  } catch (e) {
    return erreur(e);
  }
}
