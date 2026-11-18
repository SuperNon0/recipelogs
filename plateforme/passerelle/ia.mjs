// Lecture des factures par IA (lot 7) avec la clé de la plateforme.
// L'appli d'un client appelle l'IA choisie dans le panel (Claude, Gemini ou
// ChatGPT) en prenant la passerelle comme adresse de l'API : ici on vérifie la
// demande, on compte une lecture dans le quota du mois du client, on remplace
// sa clé de passerelle par la clé d'IA de RecipeLog et on renvoie la réponse
// telle quelle. La clé d'IA ne quitte jamais la passerelle : un client ne la voit pas.
//   Claude  : POST /v1/ia/anthropic/v1/messages                     (SDK Anthropic)
//   ChatGPT : POST /v1/ia/openai/v1/responses
//   Gemini  : POST /v1/ia/gemini/v1beta/models/<modèle>:generateContent
//             ou :streamGenerateContent?alt=sse (en continu : une longue lecture n'est pas coupée)
//
// Fichiers (dossier /ia, partagé avec le moteur du panel) :
//   reglages.json        écrit par le panel : { defaut: 30, clients: { maison: 100 },
//                        factures: { defaut: { attente: 30, pages: 10 }, clients: { maison: { attente: 50, pages: 10 } } } }
//   usage/<client>.json  écrit ici : { "2026-11": { lectures, entree, sortie } }
//   etat.json            écrit ici au démarrage : la clé d'installation est-elle réglée ? (le panel l'affiche)
//   cle.json             écrit par le panel (Factures par IA → « Clé d'IA ») :
//                        { fournisseur: "anthropic"|"gemini"|"openai", cle, modele, prix: { entree, sortie }, depuis }.
//                        Lisible par la passerelle seule (droits 600). Elle passe avant
//                        IA_ANTHROPIC_CLE (la clé Claude mise à l'installation, gardée en secours).
//   usage/<client>.json  compte aussi le coût estimé de chaque lecture (cout, en dollars),
//                        au prix du modèle du moment : changer d'IA en cours de mois reste juste.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

const RACINE = process.env.IA_DIR || "/ia";
const CLE_INSTALLATION = (process.env.IA_ANTHROPIC_CLE || "").trim();
const AMONT = (process.env.IA_ANTHROPIC_URL || "https://api.anthropic.com").replace(/\/+$/, "");
const MODELES = new Set((process.env.IA_MODELES || "claude-opus-5-5").split(",").map((m) => m.trim()).filter(Boolean));
const QUOTA_DEFAUT = Number.isFinite(Number(process.env.IA_QUOTA_DEFAUT)) ? Number(process.env.IA_QUOTA_DEFAUT) : 30;
const MAX_CORPS = 16 * 1024 * 1024; // un PDF de 10 Mo fait ~13,4 Mo en base64
// Lecture en continu : jusqu'à 64 000 jetons de réponse (une mercuriale de plusieurs pages).
// Sans lecture en continu, on reste à 16 000 (au-delà, la réponse met trop de temps à arriver d'un bloc).
const MAX_SORTIE = 64000;
const MAX_SORTIE_BLOC = 16000;
const BETAS = new Set(["server-side-fallback-2026-07-01"]);
// Modèles Claude qui acceptent le modèle de secours côté serveur (fallbacks: "default").
// Les autres (Haiku…) le refusent : on retire l'option avant d'envoyer.
const AVEC_SECOURS = /^claude-(fable|mythos|opus-5|sonnet-5-5)/;
const PRIX_OPUS = { entree: 4, sortie: 20 };
const AMONT_OPENAI = (process.env.IA_OPENAI_URL || "https://api.openai.com").replace(/\/+$/, "");
const AMONT_GEMINI = (process.env.IA_GEMINI_URL || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
export const FOURNISSEURS = { anthropic: "Claude", gemini: "Gemini", openai: "ChatGPT" };
const DELAI_MS = 5 * 60_000;
const DELAI_FLUX_MS = 15 * 60_000;
// Une lecture ne compte dans le quota du client que si l'IA est allée au bout de sa réponse :
// un document trop long (réponse coupée) ou refusé n'est pas compté.
const FINS_COMPTEES = new Set(["end_turn", "stop_sequence"]);

const enCours = new Map(); // client → lectures en cours (pour ne pas dépasser le quota en parallèle)
const verrous = new Map(); // client → promesse : les mises à jour du fichier d'usage passent une par une

export const mois = (d = new Date()) => d.toISOString().slice(0, 7);

async function lireJson(fichier, defaut) {
  try {
    return JSON.parse(await readFile(fichier, "utf8"));
  } catch {
    return defaut;
  }
}

async function ecrireJson(fichier, valeur) {
  await mkdir(fichier.slice(0, fichier.lastIndexOf("/")), { recursive: true });
  const tmp = `${fichier}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify(valeur, null, 1), { mode: 0o644 });
  await rename(tmp, fichier);
}

/**
 * L'IA à utiliser : celle réglée dans le panel, sinon la clé Claude de l'installation.
 * Relue à chaque lecture : un changement dans le panel compte tout de suite.
 * null = pas d'IA fournie par la plateforme.
 */
export async function configActuelle() {
  const f = await lireJson(`${RACINE}/cle.json`, null);
  const c = typeof f?.cle === "string" ? f.cle.trim() : "";
  if (c) {
    const fournisseur = FOURNISSEURS[f.fournisseur] ? f.fournisseur : "anthropic";
    const modele = typeof f.modele === "string" && /^[A-Za-z0-9._-]{1,100}$/.test(f.modele) ? f.modele : fournisseur === "anthropic" ? [...MODELES][0] : null;
    if (!modele) return null;
    const prix = Number.isFinite(f.prix?.entree) && Number.isFinite(f.prix?.sortie) ? { entree: f.prix.entree, sortie: f.prix.sortie } : null;
    return { fournisseur, cle: c, modele, prix };
  }
  if (CLE_INSTALLATION) return { fournisseur: "anthropic", cle: CLE_INSTALLATION, modele: [...MODELES][0], prix: PRIX_OPUS };
  return null;
}

export async function noterEtat() {
  try {
    await ecrireJson(`${RACINE}/etat.json`, { cle: !!CLE_INSTALLATION, modeles: [...MODELES], depuis: new Date().toISOString() });
  } catch (e) {
    console.error(`IA : impossible d'écrire ${RACINE}/etat.json (${e.message})`);
  }
}

export async function limite(client) {
  const r = await lireJson(`${RACINE}/reglages.json`, {});
  const v = r?.clients?.[client];
  if (typeof v === "number" && v >= 0) return Math.floor(v);
  return typeof r?.defaut === "number" && r.defaut >= 0 ? Math.floor(r.defaut) : QUOTA_DEFAUT;
}

// Factures prises en photo dans l'appli (« Nouvelle facture ») : combien peuvent attendre
// d'être lues en même temps, et combien de pages (photos) par facture.
const FACTURES_DEFAUT = { attente: 30, pages: 10 };
const PAGES_MAX = 20;

export async function limitesFactures(client) {
  const r = await lireJson(`${RACINE}/reglages.json`, {});
  const f = r?.factures ?? {};
  const ok = (v, max) => (Number.isInteger(v) && v >= 0 && v <= max ? v : null);
  const d = { attente: ok(f.defaut?.attente, 10_000) ?? FACTURES_DEFAUT.attente, pages: ok(f.defaut?.pages, PAGES_MAX) ?? FACTURES_DEFAUT.pages };
  const c = f.clients?.[client] ?? {};
  return { attente: ok(c.attente, 10_000) ?? d.attente, pages: Math.max(1, ok(c.pages, PAGES_MAX) ?? d.pages) };
}

async function usage(client) {
  return lireJson(`${RACINE}/usage/${client}.json`, {});
}

/** GET /v1/ia/quota */
export async function quota(client) {
  const [l, u, factures, c] = await Promise.all([limite(client), usage(client), limitesFactures(client), configActuelle()]);
  const m = mois();
  // fournisseur et modele : l'appli s'en sert pour savoir quelle IA appeler (par la passerelle).
  return { disponible: !!c && l > 0, limite: l, utilise: u[m]?.lectures ?? 0, mois: m, factures, fournisseur: c?.fournisseur ?? null, modele: c?.modele ?? null };
}

function compter(client, entree, sortie, prix) {
  const avant = verrous.get(client) ?? Promise.resolve();
  const suite = avant.then(async () => {
    const u = await usage(client);
    const m = mois();
    const c = u[m] ?? { lectures: 0, entree: 0, sortie: 0 };
    // Coût en dollars au prix du modèle du moment (estimation).
    const p = prix ?? PRIX_OPUS;
    const cout = (entree * p.entree + sortie * p.sortie) / 1_000_000;
    // Anciennes lignes sans « cout » : estimées au prix de Claude Opus 5.5.
    const avantCout = typeof c.cout === "number" ? c.cout : (c.entree * PRIX_OPUS.entree + c.sortie * PRIX_OPUS.sortie) / 1_000_000;
    u[m] = { lectures: c.lectures + 1, entree: c.entree + entree, sortie: c.sortie + sortie, cout: Math.round((avantCout + cout) * 1e6) / 1e6 };
    // On garde 13 mois d'historique.
    for (const k of Object.keys(u).sort().slice(0, -13)) delete u[k];
    await ecrireJson(`${RACINE}/usage/${client}.json`, u);
  });
  verrous.set(client, suite.catch(() => {}));
  return suite;
}

/** Vérifie le quota du mois et réserve une lecture en cours (à rendre dans un finally). false = refus déjà envoyé. */
async function reserver(client, res) {
  const q = await quota(client);
  const occupees = enCours.get(client) ?? 0;
  if (q.utilise + occupees >= q.limite) {
    refuser(res, 429, "quota_ia", q.limite > 0
      ? `Les ${q.limite} lectures par IA du mois sont utilisées. Elles reviennent le 1er du mois ; tu peux aussi mettre ta propre clé d'IA dans les réglages.`
      : "La lecture par IA n'est pas ouverte sur ton offre. Demande-la à RecipeLog, ou mets ta propre clé d'IA dans les réglages.");
    return false;
  }
  enCours.set(client, occupees + 1);
  return true;
}

const rendre = (client) => enCours.set(client, Math.max(0, (enCours.get(client) ?? 1) - 1));

function mauvaiseIA(res, client, conf) {
  // L'appli du client ne connaît pas encore l'IA choisie dans le panel (ancienne version).
  console.error(`IA : ${client} demande une autre IA que ${FOURNISSEURS[conf.fournisseur]} (appli à mettre à jour ?).`);
  return refuser(res, 503, "ia_changee", "La plateforme lit maintenant les factures avec une autre IA : ton RecipeLog doit être mis à jour. RecipeLog est prévenu ; réessaie plus tard.");
}

function refuser(res, statut, code, message) {
  // x-should-retry : le SDK ne réessaie pas un refus de la passerelle (quota, demande interdite).
  res.writeHead(statut, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "x-should-retry": "false" });
  res.end(JSON.stringify({ type: "error", error: code, message }));
}

async function lireCorps(req) {
  let taille = 0;
  const morceaux = [];
  for await (const m of req) {
    taille += m.length;
    if (taille > MAX_CORPS) return null;
    morceaux.push(m);
  }
  return Buffer.concat(morceaux);
}

/** Vérifie que la demande est bien une lecture de facture, et rien d'autre. */
export function controler(corps, betas, modeles = MODELES) {
  if (!corps || typeof corps !== "object" || Array.isArray(corps)) return "Demande illisible.";
  if (!modeles.has(corps.model)) return "Ce modèle n'est pas proposé par la plateforme.";
  if (!(Number.isInteger(corps.max_tokens) && corps.max_tokens > 0 && corps.max_tokens <= MAX_SORTIE)) return `max_tokens doit aller de 1 à ${MAX_SORTIE}.`;
  if (corps.stream !== undefined && typeof corps.stream !== "boolean") return "Demande illisible.";
  if (!corps.stream && corps.max_tokens > MAX_SORTIE_BLOC) return `Sans lecture en continu, max_tokens doit aller de 1 à ${MAX_SORTIE_BLOC}.`;
  for (const interdit of ["tools", "tool_choice", "mcp_servers", "container", "system", "speed", "service_tier", "context_management"]) {
    if (corps[interdit] !== undefined) return `Champ « ${interdit} » refusé par la plateforme.`;
  }
  if (!Array.isArray(corps.messages) || corps.messages.length !== 1 || corps.messages[0]?.role !== "user") return "Une seule demande de lecture à la fois.";
  const contenu = corps.messages[0].content;
  if (!Array.isArray(contenu) || contenu.length > 4) return "Demande de lecture invalide.";
  for (const b of contenu) {
    if (!["text", "image", "document"].includes(b?.type)) return "Seuls un fichier et la consigne sont acceptés.";
    if (b.type !== "text" && b.source?.type !== "base64") return "Le fichier doit être joint à la demande.";
  }
  for (const b of betas) if (!BETAS.has(b)) return `Option « ${b} » refusée par la plateforme.`;
  if (corps.fallbacks !== undefined && corps.fallbacks !== "default") return "Seul le modèle de secours par défaut est accepté.";
  return null;
}

/** POST /v1/ia/anthropic/v1/messages : relais vers l'API Anthropic. */
export async function relayer(client, req, res, query) {
  const conf = await configActuelle();
  if (!conf) return refuser(res, 503, "ia_indisponible", "La lecture par IA n'est pas encore ouverte sur la plateforme.");
  if (conf.fournisseur !== "anthropic") return mauvaiseIA(res, client, conf);
  const CLE = conf.cle;
  const brut = await lireCorps(req);
  if (!brut) return refuser(res, 413, "trop_gros", "Fichier trop gros pour la lecture par IA (10 Mo au plus).");
  let corps;
  try {
    corps = JSON.parse(brut.toString("utf8"));
  } catch {
    return refuser(res, 400, "json_invalide", "Demande illisible.");
  }
  const betas = String(req.headers["anthropic-beta"] || "").split(",").map((b) => b.trim()).filter(Boolean);
  // Une appli d'avant le choix du modèle demande toujours Claude Opus 5.5 : elle reçoit le modèle choisi dans le panel.
  const probleme = controler(corps, betas, new Set([...MODELES, conf.modele]));
  if (probleme) return refuser(res, 400, "demande_refusee", probleme);
  corps.model = conf.modele;
  let betasEnvoyees = betas;
  if (!AVEC_SECOURS.test(conf.modele)) {
    delete corps.fallbacks;
    betasEnvoyees = betas.filter((b) => !b.startsWith("server-side-fallback"));
  }
  const envoi = JSON.stringify(corps);

  if (!(await reserver(client, res))) return;
  try {
    const amont = await fetch(`${AMONT}/v1/messages${query.includes("beta=true") ? "?beta=true" : ""}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": CLE,
        "anthropic-version": String(req.headers["anthropic-version"] || "2023-06-01"),
        ...(betasEnvoyees.length ? { "anthropic-beta": betasEnvoyees.join(",") } : {}),
      },
      body: envoi,
      signal: AbortSignal.timeout(corps.stream ? DELAI_FLUX_MS : DELAI_MS),
    });
    const noter = async (u, fin) => {
      if (!FINS_COMPTEES.has(fin)) {
        console.error(`IA : lecture de ${client} non comptée (fin : ${fin ?? "inconnue"}).`);
        return;
      }
      const entree = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
      await compter(client, entree, u.output_tokens ?? 0, conf.prix).catch((e) => console.error(`IA : usage de ${client} non noté (${e.message})`));
    };
    // Lecture en continu : la réponse est transmise au fil de l'eau ; on y lit au passage
    // la consommation et la raison de fin (événements message_start et message_delta).
    if (amont.ok && corps.stream && amont.body) {
      res.writeHead(200, { "Content-Type": amont.headers.get("content-type") || "text/event-stream", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
      const decodeur = new TextDecoder();
      let reste = "";
      let u = {};
      let fin = null;
      const lire = (bloc) => {
        for (const l of bloc.split("\n")) {
          if (!l.startsWith("data:")) continue;
          try {
            const j = JSON.parse(l.slice(5));
            if (j.type === "message_start") u = { ...u, ...(j.message?.usage ?? {}) };
            if (j.type === "message_delta") {
              u = { ...u, ...(j.usage ?? {}) };
              if (j.delta?.stop_reason) fin = j.delta.stop_reason;
            }
            if (j.type === "error") console.error(`IA : erreur d'Anthropic pendant la lecture de ${client} : ${JSON.stringify(j.error).slice(0, 500)}`);
          } catch {
            /* morceau illisible : transmis quand même */
          }
        }
      };
      try {
        for await (const m of amont.body) {
          res.write(m);
          reste += decodeur.decode(m, { stream: true }).replace(/\r/g, "");
          let i;
          while ((i = reste.indexOf("\n\n")) >= 0) {
            lire(reste.slice(0, i));
            reste = reste.slice(i + 2);
          }
        }
        if (reste) lire(reste);
      } catch (e) {
        console.error(`IA : lecture de ${client} coupée en route (${e.message})`);
        res.destroy();
        return;
      }
      // La lecture est comptée avant de finir la réponse : la suivante trouve le bon compteur.
      await noter(u, fin);
      res.end();
      return;
    }
    const texte = await amont.text();
    if (amont.ok) {
      let j = {};
      try {
        j = JSON.parse(texte);
      } catch {
        /* réponse rendue telle quelle */
      }
      await noter(j.usage ?? {}, j.stop_reason ?? null);
    } else {
      // La vraie raison dans les journaux (recipelog-plateforme logs passerelle) : crédit épuisé,
      // modèle inconnu, fichier refusé… Sans ça, toute erreur ressemblait à « fichier illisible ».
      console.error(`IA : Anthropic a répondu ${amont.status} pour ${client} : ${texte.slice(0, 800)}`);
      if (amont.status === 401 || amont.status === 403) {
        // Clé de la plateforme refusée : ce n'est pas la faute du client, on ne lui renvoie pas l'erreur d'Anthropic.
        return refuser(res, 503, "ia_indisponible", "La lecture par IA de la plateforme est en panne. RecipeLog est prévenu ; réessaie plus tard.");
      }
    }
    res.writeHead(amont.status, {
      "Content-Type": amont.headers.get("content-type") || "application/json",
      "Cache-Control": "no-store",
      ...(amont.headers.get("retry-after") ? { "retry-after": amont.headers.get("retry-after") } : {}),
    });
    res.end(texte);
  } catch (e) {
    console.error(`IA : Anthropic injoignable (${e.message})`);
    if (res.headersSent) res.destroy();
    else refuser(res, 502, "ia_injoignable", "L'IA ne répond pas pour l'instant. Réessaie dans quelques minutes.");
  } finally {
    rendre(client);
  }
}

// ─────────────────────────────────────────────
// ChatGPT et Gemini (clé de la plateforme)
// ─────────────────────────────────────────────

const TYPES_FICHIER = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"]);

/** ChatGPT (API Responses) : un seul message, le fichier et la consigne, réponse en JSON. */
export function controlerOpenAI(corps, modele) {
  if (!corps || typeof corps !== "object" || Array.isArray(corps)) return "Demande illisible.";
  if (corps.model !== modele) return "Ce modèle n'est pas proposé par la plateforme.";
  for (const k of Object.keys(corps)) if (!["model", "input", "text", "max_output_tokens"].includes(k)) return `Champ « ${k} » refusé par la plateforme.`;
  if (corps.max_output_tokens !== undefined && !(Number.isInteger(corps.max_output_tokens) && corps.max_output_tokens > 0 && corps.max_output_tokens <= MAX_SORTIE)) return "max_output_tokens invalide.";
  if (!Array.isArray(corps.input) || corps.input.length !== 1 || corps.input[0]?.role !== "user") return "Une seule demande de lecture à la fois.";
  const contenu = corps.input[0].content;
  if (!Array.isArray(contenu) || contenu.length > 4) return "Demande de lecture invalide.";
  for (const b of contenu) {
    if (b?.type === "input_text" && typeof b.text === "string") continue;
    if (b?.type === "input_file" && typeof b.file_data === "string" && b.file_data.startsWith("data:application/pdf;base64,")) continue;
    if (b?.type === "input_image" && typeof b.image_url === "string" && /^data:image\/(jpeg|png|webp|gif);base64,/.test(b.image_url)) continue;
    return "Seuls un fichier et la consigne sont acceptés.";
  }
  if (corps.text !== undefined && corps.text?.format?.type !== "json_schema") return "Format de réponse refusé.";
  return null;
}

/** Gemini (generateContent) : un seul message, le fichier et la consigne. */
export function controlerGemini(corps) {
  if (!corps || typeof corps !== "object" || Array.isArray(corps)) return "Demande illisible.";
  for (const k of Object.keys(corps)) if (!["contents", "generationConfig"].includes(k)) return `Champ « ${k} » refusé par la plateforme.`;
  if (!Array.isArray(corps.contents) || corps.contents.length !== 1 || corps.contents[0]?.role !== "user") return "Une seule demande de lecture à la fois.";
  const parts = corps.contents[0].parts;
  if (!Array.isArray(parts) || parts.length > 4) return "Demande de lecture invalide.";
  for (const p of parts) {
    if (typeof p?.text === "string" && Object.keys(p).length === 1) continue;
    if (p?.inline_data && TYPES_FICHIER.has(p.inline_data.mime_type) && typeof p.inline_data.data === "string" && Object.keys(p).length === 1) continue;
    return "Seuls un fichier et la consigne sont acceptés.";
  }
  const g = corps.generationConfig;
  if (g !== undefined) {
    if (!g || typeof g !== "object") return "Demande illisible.";
    for (const k of Object.keys(g)) if (!["responseMimeType", "responseSchema", "responseJsonSchema", "maxOutputTokens", "temperature"].includes(k)) return `Option « ${k} » refusée par la plateforme.`;
    if (g.maxOutputTokens !== undefined && !(Number.isInteger(g.maxOutputTokens) && g.maxOutputTokens > 0 && g.maxOutputTokens <= MAX_SORTIE)) return "maxOutputTokens invalide.";
  }
  return null;
}

/**
 * POST /v1/ia/openai/v1/responses et /v1/ia/gemini/v1beta/models/<modèle>:generateContent.
 * fournisseur : "openai" | "gemini" ; modeleChemin : le modèle écrit dans l'adresse (Gemini).
 * @param {string} client
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {"openai" | "gemini"} fournisseur
 * @param {string | null} [modeleChemin]
 * @param {boolean} [flux] Gemini en continu (streamGenerateContent?alt=sse)
 */
export async function relayerAutre(client, req, res, fournisseur, modeleChemin = null, flux = false) {
  const conf = await configActuelle();
  if (!conf) return refuser(res, 503, "ia_indisponible", "La lecture par IA n'est pas encore ouverte sur la plateforme.");
  if (conf.fournisseur !== fournisseur) return mauvaiseIA(res, client, conf);
  const brut = await lireCorps(req);
  if (!brut) return refuser(res, 413, "trop_gros", "Fichier trop gros pour la lecture par IA (10 Mo au plus).");
  let corps;
  try {
    corps = JSON.parse(brut.toString("utf8"));
  } catch {
    return refuser(res, 400, "json_invalide", "Demande illisible.");
  }
  const probleme = fournisseur === "openai" ? controlerOpenAI(corps, conf.modele) : modeleChemin !== conf.modele ? "Ce modèle n'est pas proposé par la plateforme." : controlerGemini(corps);
  if (probleme) return refuser(res, 400, "demande_refusee", probleme);
  if (!(await reserver(client, res))) return;
  try {
    const amont = await fetch(
      fournisseur === "openai"
        ? `${AMONT_OPENAI}/v1/responses`
        : `${AMONT_GEMINI}/v1beta/models/${encodeURIComponent(conf.modele)}:${flux ? "streamGenerateContent?alt=sse" : "generateContent"}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...(fournisseur === "openai" ? { authorization: `Bearer ${conf.cle}` } : { "x-goog-api-key": conf.cle }) },
        body: brut,
        signal: AbortSignal.timeout(DELAI_FLUX_MS),
      },
    );
    // Gemini en continu : la réponse est transmise au fil de l'eau ; chaque morceau porte
    // la consommation jusque-là (usageMetadata) et le dernier la raison de fin.
    if (flux && amont.ok && amont.body) {
      res.writeHead(200, { "Content-Type": amont.headers.get("content-type") || "text/event-stream", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
      const decodeur = new TextDecoder();
      let reste = "";
      let u = {};
      let fin = null;
      const lire = (bloc) => {
        for (const l of bloc.split("\n")) {
          if (!l.startsWith("data:")) continue;
          try {
            const j = JSON.parse(l.slice(5));
            if (j.usageMetadata) u = j.usageMetadata;
            if (j.candidates?.[0]?.finishReason) fin = j.candidates[0].finishReason;
          } catch {
            /* morceau illisible : transmis quand même */
          }
        }
      };
      try {
        for await (const m of amont.body) {
          res.write(m);
          reste += decodeur.decode(m, { stream: true }).replace(/\r/g, "");
          let i;
          while ((i = reste.indexOf("\n\n")) >= 0) {
            lire(reste.slice(0, i));
            reste = reste.slice(i + 2);
          }
        }
        if (reste) lire(reste);
      } catch (e) {
        console.error(`IA : lecture de ${client} coupée en route (${e.message})`);
        res.destroy();
        return;
      }
      if (fin === "STOP") {
        await compter(client, u.promptTokenCount ?? 0, (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0), conf.prix).catch((e) =>
          console.error(`IA : usage de ${client} non noté (${e.message})`),
        );
      } else {
        console.error(`IA : lecture de ${client} non comptée (fin : ${fin ?? "inconnue"}).`);
      }
      res.end();
      return;
    }
    const texte = await amont.text();
    if (amont.ok) {
      let j = {};
      try {
        j = JSON.parse(texte);
      } catch {
        /* réponse rendue telle quelle */
      }
      // Comptée seulement si l'IA est allée au bout (comme pour Claude).
      const fini = fournisseur === "openai" ? j.status === "completed" : j.candidates?.[0]?.finishReason === "STOP";
      if (fini) {
        const entree = fournisseur === "openai" ? (j.usage?.input_tokens ?? 0) : (j.usageMetadata?.promptTokenCount ?? 0);
        const sortie = fournisseur === "openai" ? (j.usage?.output_tokens ?? 0) : (j.usageMetadata?.candidatesTokenCount ?? 0) + (j.usageMetadata?.thoughtsTokenCount ?? 0);
        await compter(client, entree, sortie, conf.prix).catch((e) => console.error(`IA : usage de ${client} non noté (${e.message})`));
      } else {
        console.error(`IA : lecture de ${client} non comptée (fin : ${fournisseur === "openai" ? j.status : j.candidates?.[0]?.finishReason ?? "inconnue"}).`);
      }
    } else {
      console.error(`IA : ${FOURNISSEURS[fournisseur]} a répondu ${amont.status} pour ${client} : ${texte.slice(0, 800)}`);
      if (amont.status === 401 || amont.status === 403 || (fournisseur === "gemini" && amont.status === 400 && /API_KEY/i.test(texte))) {
        return refuser(res, 503, "ia_indisponible", "La lecture par IA de la plateforme est en panne. RecipeLog est prévenu ; réessaie plus tard.");
      }
    }
    res.writeHead(amont.status, { "Content-Type": amont.headers.get("content-type") || "application/json", "Cache-Control": "no-store" });
    res.end(texte);
  } catch (e) {
    console.error(`IA : ${FOURNISSEURS[fournisseur]} injoignable (${e.message})`);
    if (res.headersSent) res.destroy();
    else refuser(res, 502, "ia_injoignable", "L'IA ne répond pas pour l'instant. Réessaie dans quelques minutes.");
  } finally {
    rendre(client);
  }
}
