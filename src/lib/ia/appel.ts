import Anthropic from "@anthropic-ai/sdk";
import { MODELE_PLATEFORME, type FournisseurIA, type ReglagesIA } from "./reglages";
import { getQuotaIA } from "@/lib/auth/passerelle";
import { SCHEMA_DOCUMENT, consigne, lireJson, nettoyerDocument, type ContexteLecture, type DocumentLu, type TypeLecture } from "./document";

/**
 * Envoie une photo ou un PDF à l'IA choisie dans les réglages et rend le
 * document lu. Claude passe par le SDK officiel, ChatGPT et Gemini par leur API
 * web : avec la clé du client, ou par la passerelle de la plateforme (l'IA et le
 * modèle choisis dans le panel), qui ajoute la clé de RecipeLog et compte les lectures.
 */

export type Fichier = { data: Buffer; mime: string; nom: string };

export type ResultatIA =
  | { ok: true; document: DocumentLu; modele: string; secours: boolean }
  | { ok: false; code: string; message: string };

export type OptionsIA = {
  /** Tests : adresse d'une fausse API. */
  anthropicBaseURL?: string;
  fetch?: typeof fetch;
  /** Tests : IA de la plateforme (sinon demandée à la passerelle). */
  plateforme?: IAPlateforme;
};

/** L'IA de la plateforme, réglée dans le panel. */
export type IAPlateforme = { fournisseur: FournisseurIA; modele: string };

// Modèles Claude qui acceptent le modèle de secours côté serveur ; les autres (Haiku…) le refusent.
const AVEC_SECOURS = /^claude-(fable|mythos|opus-5|sonnet-5-5)/;

async function iaPlateforme(): Promise<IAPlateforme> {
  const q = await getQuotaIA();
  if (q.ok && q.quota.fournisseur && q.quota.modele) return { fournisseur: q.quota.fournisseur, modele: q.quota.modele };
  return { fournisseur: "anthropic", modele: MODELE_PLATEFORME };
}

const passerelleURL = () => (process.env.RECIPELOG_PASSERELLE_URL ?? "").trim().replace(/\/+$/, "");
const passerelleCle = () => (process.env.RECIPELOG_PASSERELLE_CLE ?? "").trim();

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
  if (reglages.mode === "plateforme") {
    const ia = opts.plateforme ?? (await iaPlateforme());
    const r: ReglagesIA = { ...reglages, fournisseur: ia.fournisseur, modele: ia.modele, cle: "" };
    if (ia.fournisseur === "anthropic") return claude(r, fichier, texte, opts);
    return ia.fournisseur === "openai" ? chatgpt(r, fichier, texte, opts) : gemini(r, fichier, texte, opts);
  }
  if (reglages.fournisseur === "anthropic") return claude(reglages, fichier, texte, opts);
  if (!reglages.cle) return erreur("cle_absente", "Aucune clé d'API n'est enregistrée.");
  return reglages.fournisseur === "openai" ? chatgpt(reglages, fichier, texte, opts) : gemini(reglages, fichier, texte, opts);
}

// ─────────────────────────────────────────────
// Claude (SDK officiel)
// ─────────────────────────────────────────────

async function claude(r: ReglagesIA, f: Fichier, texte: string, opts: OptionsIA): Promise<ResultatIA> {
  const plateforme = r.mode === "plateforme";
  const passerelle = passerelleURL();
  const client = new Anthropic(
    plateforme
      ? {
          // La passerelle reconnaît le client à sa clé (comme pour l'équipe) et ajoute la clé de RecipeLog.
          apiKey: null,
          authToken: passerelleCle(),
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
      model: r.modele,
      max_tokens: MAX_SORTIE,
      // Si le modèle refuse (filtre de sécurité trop prudent), l'API relance avec le modèle de secours conseillé
      // (seulement pour les modèles qui l'acceptent).
      ...(AVEC_SECOURS.test(r.modele) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
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
): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; status: number; corps?: string }> {
  const doFetch = opts.fetch ?? fetch;
  try {
    const res = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(DELAI_MS),
    });
    if (!res.ok) {
      const corps = await res.text().catch(() => "");
      console.error(`IA : ${new URL(url).hostname} a répondu ${res.status} : ${corps.slice(0, 800)}`);
      return { ok: false, status: res.status, corps };
    }
    return { ok: true, json: (await res.json()) as Record<string, unknown> };
  } catch (e) {
    console.error(`IA : ${new URL(url).hostname} injoignable :`, e instanceof Error ? e.message : e);
    return { ok: false, status: 0 };
  }
}

/** Avec la clé de la plateforme : la passerelle explique elle-même un refus ({ error, message }). */
function erreurPlateforme(nom: string, status: number, corps?: string): ResultatIA {
  try {
    const j = JSON.parse(corps ?? "") as { error?: unknown; message?: unknown };
    if (typeof j.error === "string" && typeof j.message === "string") return erreur(j.error, j.message);
  } catch {
    /* réponse du fournisseur, pas de la passerelle */
  }
  if (status === 401) return erreur("cle_invalide", "La plateforme n'a pas reconnu ce site. Préviens RecipeLog.");
  if (status === 429) return erreur("limite", `${nom} reçoit trop de demandes en ce moment. Réessaie dans une minute.`);
  if (status === 0) return erreur("injoignable", "L'IA ne répond pas pour l'instant. Réessaie dans quelques minutes.");
  if (status === 400) return erreur("refus_api", "L'IA n'a pas accepté ce fichier (trop gros, trop de pages ou illisible).");
  return erreur("ia_erreur", `L'IA a renvoyé une erreur (${status}). Réessaie plus tard.`);
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
  const plateforme = r.mode === "plateforme";
  const rep = await posterJson(opts, plateforme ? `${passerelleURL()}/v1/ia/openai/v1/responses` : "https://api.openai.com/v1/responses", { Authorization: `Bearer ${plateforme ? passerelleCle() : r.cle}` }, {
    model: r.modele,
    input: [{ role: "user", content: [piece, { type: "input_text", text: texte }] }],
    text: { format: { type: "json_schema", name: "document", schema: SCHEMA_DOCUMENT, strict: true } },
  });
  if (!rep.ok) return plateforme ? erreurPlateforme("ChatGPT", rep.status, rep.corps) : erreurHttp("ChatGPT", rep.status);
  const sortie = Array.isArray(rep.json.output) ? (rep.json.output as { type?: string; content?: { type?: string; text?: string }[] }[]) : [];
  const t = sortie.flatMap((o) => (o.type === "message" ? (o.content ?? []).filter((c) => c.type === "output_text").map((c) => c.text ?? "") : [])).join("");
  if (rep.json.status === "incomplete") return erreur("trop_long", "Le document est trop long pour une seule lecture : envoie-le en plusieurs fois (quelques pages à la fois).");
  if (!t) return erreur("refus", "ChatGPT n'a rien renvoyé pour ce document.");
  return finir(t, r.modele);
}

/**
 * Gemini en continu (streamGenerateContent) : la réponse arrive morceau par morceau.
 * Sans ça, une longue mercuriale (plus de 5 minutes de lecture) était coupée par
 * Node, qui abandonne une réponse dont les en-têtes tardent plus de 5 minutes.
 */
async function gemini(r: ReglagesIA, f: Fichier, texte: string, opts: OptionsIA): Promise<ResultatIA> {
  const plateforme = r.mode === "plateforme";
  const base = plateforme ? `${passerelleURL()}/v1/ia/gemini` : "https://generativelanguage.googleapis.com";
  const url = `${base}/v1beta/models/${encodeURIComponent(r.modele)}:streamGenerateContent?alt=sse`;
  const doFetch = opts.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(plateforme ? { Authorization: `Bearer ${passerelleCle()}` } : { "x-goog-api-key": r.cle }) },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { inline_data: { mime_type: f.mime, data: f.data.toString("base64") } },
              { text: `${texte}\nRéponds uniquement par un objet JSON qui suit ce schéma :\n${JSON.stringify(SCHEMA_DOCUMENT)}` },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: MAX_SORTIE },
      }),
      signal: AbortSignal.timeout(DELAI_MS),
    });
  } catch (e) {
    console.error(`IA : Gemini injoignable :`, e instanceof Error ? e.message : e);
    return plateforme ? erreurPlateforme("Gemini", 0) : erreurHttp("Gemini", 0);
  }
  if (!res.ok) {
    const corps = await res.text().catch(() => "");
    console.error(`IA : Gemini a répondu ${res.status} : ${corps.slice(0, 800)}`);
    if (plateforme) return erreurPlateforme("Gemini", res.status, corps);
    return erreurHttp("Gemini", cleGeminiRefusee(res.status, corps) ? 401 : res.status);
  }
  let t = "";
  let fin: string | undefined;
  try {
    for await (const evt of evenementsSSE(res)) {
      const j = evt as { candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[]; error?: { message?: string } };
      if (j.error) throw new Error(j.error.message ?? "erreur de Gemini");
      const c = j.candidates?.[0];
      t += (c?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
      if (c?.finishReason) fin = c.finishReason;
    }
  } catch (e) {
    console.error("IA : lecture Gemini coupée :", e instanceof Error ? e.message : e);
    return erreur("injoignable", "La lecture a été coupée en route. Réessaie dans quelques minutes.");
  }
  if (fin === "MAX_TOKENS") return erreur("trop_long", "Le document est trop long pour une seule lecture : envoie-le en plusieurs fois (quelques pages à la fois).");
  if (!t) return erreur("refus", "Gemini n'a rien renvoyé pour ce document.");
  return finir(t, r.modele);
}

/** Google répond 400 (et non 401) quand la clé d'API n'est pas valable. */
function cleGeminiRefusee(status: number, corps: string): boolean {
  return status === 400 && /API_KEY_INVALID|API key not valid|API_KEY/i.test(corps);
}

/** Lit un flux « text/event-stream » et rend chaque « data: {…} » en objet. */
async function* evenementsSSE(res: Response): AsyncGenerator<unknown> {
  if (!res.body) return;
  const lecteur = res.body.getReader();
  const decodeur = new TextDecoder();
  let reste = "";
  const lire = (bloc: string) =>
    bloc
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .filter(Boolean)
      .map((d) => JSON.parse(d) as unknown);
  for (;;) {
    const { value, done } = await lecteur.read();
    if (done) break;
    reste += decodeur.decode(value, { stream: true }).replace(/\r/g, "");
    let i;
    while ((i = reste.indexOf("\n\n")) >= 0) {
      yield* lire(reste.slice(0, i));
      reste = reste.slice(i + 2);
    }
  }
  reste += decodeur.decode();
  if (reste.trim()) yield* lire(reste);
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
    const corps = r.fournisseur === "gemini" ? await res.text().catch(() => "") : "";
    const e = erreurHttp(nom, cleGeminiRefusee(res.status, corps) ? 401 : res.status);
    return { ok: false, message: e.ok ? "" : e.message };
  } catch {
    return { ok: false, message: `${nom} ne répond pas pour l'instant.` };
  }
}
