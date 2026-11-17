import Anthropic from "@anthropic-ai/sdk";
import { MODELE_PLATEFORME, type ReglagesIA } from "./reglages";
import { SCHEMA_DOCUMENT, consigne, lireJson, nettoyerDocument, type ContexteLecture, type DocumentLu, type TypeLecture } from "./document";

/**
 * Envoie une photo ou un PDF à l'IA choisie dans les réglages et rend le
 * document lu. Claude passe par le SDK officiel (avec la clé du client, ou
 * par la passerelle de la plateforme qui ajoute la clé de RecipeLog et compte
 * les lectures) ; ChatGPT et Gemini par leur API web, avec la clé du client.
 */

export type Fichier = { data: Buffer; mime: string; nom: string };

export type ResultatIA =
  | { ok: true; document: DocumentLu; modele: string; secours: boolean }
  | { ok: false; code: string; message: string };

export type OptionsIA = {
  /** Tests : adresse d'une fausse API. */
  anthropicBaseURL?: string;
  fetch?: typeof fetch;
};

const TYPES_IMAGES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
// Lecture en continu : la réponse arrive au fil de l'eau, donc une longue mercuriale
// (plusieurs pages, plusieurs centaines de lignes) tient dans une seule lecture.
const MAX_SORTIE = 64000;
const DELAI_MS = 15 * 60_000;

const erreur = (code: string, message: string): ResultatIA => ({ ok: false, code, message });

export function fichierAccepte(mime: string): boolean {
  return mime === "application/pdf" || TYPES_IMAGES.has(mime);
}

export async function lireAvecIA(
  reglages: ReglagesIA,
  fichier: Fichier,
  type: TypeLecture,
  ctx: ContexteLecture,
  opts: OptionsIA = {},
): Promise<ResultatIA> {
  if (reglages.mode === "off") return erreur("off", "La lecture par IA n'est pas activée (Réglages → Lecture des factures par IA).");
  if (!fichierAccepte(fichier.mime)) return erreur("format", "Envoie un PDF ou une photo (JPG, PNG ou WebP).");
  const texte = consigne(type, ctx);
  if (reglages.mode === "plateforme" || reglages.fournisseur === "anthropic") return claude(reglages, fichier, texte, opts);
  if (!reglages.cle) return erreur("cle_absente", "Aucune clé d'API n'est enregistrée.");
  return reglages.fournisseur === "openai" ? chatgpt(reglages, fichier, texte, opts) : gemini(reglages, fichier, texte, opts);
}

// ─────────────────────────────────────────────
// Claude (SDK officiel)
// ─────────────────────────────────────────────

async function claude(r: ReglagesIA, f: Fichier, texte: string, opts: OptionsIA): Promise<ResultatIA> {
  const plateforme = r.mode === "plateforme";
  const passerelle = (process.env.RECIPELOG_PASSERELLE_URL ?? "").trim().replace(/\/+$/, "");
  const client = new Anthropic(
    plateforme
      ? {
          // La passerelle reconnaît le client à sa clé (comme pour l'équipe) et ajoute la clé de RecipeLog.
          apiKey: null,
          authToken: (process.env.RECIPELOG_PASSERELLE_CLE ?? "").trim(),
          baseURL: opts.anthropicBaseURL ?? `${passerelle}/v1/ia/anthropic`,
          // Pas de second essai automatique : la passerelle compterait deux lectures dans le quota.
          maxRetries: 0,
          timeout: DELAI_MS,
        }
      : { apiKey: r.cle, baseURL: opts.anthropicBaseURL, maxRetries: 2, timeout: DELAI_MS },
  );
  const data = f.data.toString("base64");
  const piece: Anthropic.Beta.BetaContentBlockParam =
    f.mime === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: f.mime as "image/jpeg", data } };
  try {
    const rep = await client.beta.messages
      .stream({
      model: plateforme ? MODELE_PLATEFORME : r.modele,
      max_tokens: MAX_SORTIE,
      // Si le modèle refuse (filtre de sécurité trop prudent), l'API relance avec le modèle de secours conseillé.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { format: { type: "json_schema", schema: SCHEMA_DOCUMENT as unknown as Record<string, unknown> } },
      messages: [{ role: "user", content: [piece, { type: "text", text: texte }] }],
    })
      .finalMessage();
    if (rep.stop_reason === "refusal") return erreur("refus", "L'IA a refusé de lire ce document. Essaie avec une photo plus nette ou saisis la facture à la main.");
    if (rep.stop_reason === "max_tokens") return erreur("trop_long", "Le document est trop long pour une seule lecture : envoie-le en plusieurs fois (quelques pages à la fois).");
    const t = rep.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const secours = (rep.usage.iterations ?? []).some((i) => i.type === "fallback_message");
    return { ok: true, document: nettoyerDocument(lireJson(t)), modele: rep.model, secours };
  } catch (e) {
    return erreurClaude(e, plateforme);
  }
}

function erreurClaude(e: unknown, plateforme: boolean): ResultatIA {
  // La vraie raison reste dans les journaux du site : le message affiché est volontairement simple.
  if (e instanceof Anthropic.APIError) {
    console.error(`IA : erreur de Claude (${e.status ?? "sans réponse"}) : ${String(e.message).slice(0, 800)}`);
  } else {
    console.error("IA : erreur pendant la lecture :", e instanceof Error ? e.message : e);
  }
  if (e instanceof Anthropic.APIError) {
    // Refus de la passerelle : { error: "quota_ia", message: "…" }.
    const corps = (e.error ?? {}) as { error?: unknown; message?: unknown };
    const code = typeof corps.error === "string" ? corps.error : null;
    if (plateforme && code && typeof corps.message === "string") return erreur(code, corps.message);
    if (e instanceof Anthropic.AuthenticationError) {
      return plateforme
        ? erreur("cle_invalide", "La plateforme n'a pas reconnu ce site. Préviens RecipeLog.")
        : erreur("cle_refusee", "Ta clé Claude est refusée. Vérifie-la dans Réglages → Lecture des factures par IA.");
    }
    if (e instanceof Anthropic.PermissionDeniedError) return erreur("cle_refusee", "Ta clé Claude n'a pas le droit d'utiliser ce modèle.");
    if (e instanceof Anthropic.RateLimitError) return erreur("limite", "L'IA reçoit trop de demandes en ce moment. Réessaie dans une minute.");
    if (!plateforme && e instanceof Anthropic.BadRequestError && /credit|billing/i.test(String(e.message))) {
      return erreur("credit", "Le crédit de ton compte Claude est épuisé. Recharge-le chez Anthropic, puis réessaie.");
    }
    if (e instanceof Anthropic.BadRequestError) return erreur("refus_api", "L'IA n'a pas accepté ce fichier (trop gros, trop de pages ou illisible).");
    if (e instanceof Anthropic.APIConnectionTimeoutError) return erreur("delai", "L'IA a mis trop de temps à répondre. Réessaie avec moins de pages.");
    if (e instanceof Anthropic.APIConnectionError) return erreur("injoignable", "L'IA ne répond pas pour l'instant. Réessaie dans quelques minutes.");
    return erreur("ia_erreur", `L'IA a renvoyé une erreur (${e.status ?? "?"}). Réessaie plus tard.`);
  }
  if (e instanceof Error && e.message === "réponse illisible") return erreur("illisible", "La réponse de l'IA était illisible. Réessaie.");
  return erreur("ia_erreur", "Erreur inattendue pendant la lecture.");
}

// ─────────────────────────────────────────────
// ChatGPT et Gemini (clé du client)
// ─────────────────────────────────────────────

async function posterJson(
  opts: OptionsIA,
  url: string,
  headers: Record<string, string>,
  corps: unknown,
): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; status: number }> {
  const doFetch = opts.fetch ?? fetch;
  try {
    const res = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(DELAI_MS),
    });
    if (!res.ok) {
      console.error(`IA : ${new URL(url).hostname} a répondu ${res.status} : ${(await res.text().catch(() => "")).slice(0, 800)}`);
      return { ok: false, status: res.status };
    }
    return { ok: true, json: (await res.json()) as Record<string, unknown> };
  } catch (e) {
    console.error(`IA : ${new URL(url).hostname} injoignable :`, e instanceof Error ? e.message : e);
    return { ok: false, status: 0 };
  }
}

function erreurHttp(nom: string, status: number): ResultatIA {
  if (status === 401 || status === 403) return erreur("cle_refusee", `Ta clé ${nom} est refusée. Vérifie-la dans Réglages → Lecture des factures par IA.`);
  if (status === 404) return erreur("modele", `Le modèle choisi n'existe pas chez ${nom}. Vérifie son nom dans les réglages.`);
  if (status === 429) return erreur("limite", `${nom} refuse pour l'instant (limite ou crédit épuisé sur ton compte).`);
  if (status === 0) return erreur("injoignable", `${nom} ne répond pas pour l'instant. Réessaie dans quelques minutes.`);
  return erreur("ia_erreur", `${nom} a renvoyé une erreur (${status}).`);
}

function finir(t: string, modele: string): ResultatIA {
  try {
    return { ok: true, document: nettoyerDocument(lireJson(t)), modele, secours: false };
  } catch {
    return erreur("illisible", "La réponse de l'IA était illisible. Réessaie.");
  }
}

async function chatgpt(r: ReglagesIA, f: Fichier, texte: string, opts: OptionsIA): Promise<ResultatIA> {
  const data = `data:${f.mime};base64,${f.data.toString("base64")}`;
  const piece = f.mime === "application/pdf" ? { type: "input_file", filename: f.nom || "facture.pdf", file_data: data } : { type: "input_image", image_url: data };
  const rep = await posterJson(opts, "https://api.openai.com/v1/responses", { Authorization: `Bearer ${r.cle}` }, {
    model: r.modele,
    input: [{ role: "user", content: [piece, { type: "input_text", text: texte }] }],
    text: { format: { type: "json_schema", name: "document", schema: SCHEMA_DOCUMENT, strict: true } },
  });
  if (!rep.ok) return erreurHttp("ChatGPT", rep.status);
  const sortie = Array.isArray(rep.json.output) ? (rep.json.output as { type?: string; content?: { type?: string; text?: string }[] }[]) : [];
  const t = sortie.flatMap((o) => (o.type === "message" ? (o.content ?? []).filter((c) => c.type === "output_text").map((c) => c.text ?? "") : [])).join("");
  if (rep.json.status === "incomplete") return erreur("trop_long", "Le document est trop long pour une seule lecture : envoie-le en plusieurs fois (quelques pages à la fois).");
  if (!t) return erreur("refus", "ChatGPT n'a rien renvoyé pour ce document.");
  return finir(t, r.modele);
}

async function gemini(r: ReglagesIA, f: Fichier, texte: string, opts: OptionsIA): Promise<ResultatIA> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(r.modele)}:generateContent`;
  const rep = await posterJson(opts, url, { "x-goog-api-key": r.cle }, {
    contents: [
      {
        role: "user",
        parts: [
          { inline_data: { mime_type: f.mime, data: f.data.toString("base64") } },
          { text: `${texte}\nRéponds uniquement par un objet JSON qui suit ce schéma :\n${JSON.stringify(SCHEMA_DOCUMENT)}` },
        ],
      },
    ],
    generationConfig: { responseMimeType: "application/json" },
  });
  if (!rep.ok) return erreurHttp("Gemini", rep.status);
  const cand = Array.isArray(rep.json.candidates) ? (rep.json.candidates as { finishReason?: string; content?: { parts?: { text?: string }[] } }[]) : [];
  const t = (cand[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  if (cand[0]?.finishReason === "MAX_TOKENS") return erreur("trop_long", "Le document est trop long pour une seule lecture : envoie-le en plusieurs fois (quelques pages à la fois).");
  if (!t) return erreur("refus", "Gemini n'a rien renvoyé pour ce document.");
  return finir(t, r.modele);
}

/**
 * Vérifie la clé et le nom du modèle sans lire de document (gratuit chez les
 * trois fournisseurs : on demande seulement la fiche du modèle).
 */
export async function testerCle(r: ReglagesIA, opts: OptionsIA = {}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!r.cle) return { ok: false, message: "Aucune clé d'API n'est enregistrée." };
  if (r.fournisseur === "anthropic") {
    try {
      await new Anthropic({ apiKey: r.cle, baseURL: opts.anthropicBaseURL, maxRetries: 1, timeout: 20_000 }).models.retrieve(r.modele);
      return { ok: true };
    } catch (e) {
      if (e instanceof Anthropic.NotFoundError) return { ok: false, message: `La clé marche, mais le modèle « ${r.modele} » n'existe pas.` };
      const res = erreurClaude(e, false);
      return { ok: false, message: res.ok ? "" : res.message };
    }
  }
  const doFetch = opts.fetch ?? fetch;
  const nom = r.fournisseur === "openai" ? "ChatGPT" : "Gemini";
  try {
    const res =
      r.fournisseur === "openai"
        ? await doFetch(`https://api.openai.com/v1/models/${encodeURIComponent(r.modele)}`, { headers: { Authorization: `Bearer ${r.cle}` }, signal: AbortSignal.timeout(20_000) })
        : await doFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(r.modele)}`, { headers: { "x-goog-api-key": r.cle }, signal: AbortSignal.timeout(20_000) });
    if (res.ok) return { ok: true };
    const e = erreurHttp(nom, res.status);
    return { ok: false, message: e.ok ? "" : e.message };
  } catch {
    return { ok: false, message: `${nom} ne répond pas pour l'instant.` };
  }
}
