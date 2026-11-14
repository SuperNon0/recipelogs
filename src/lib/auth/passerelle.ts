/**
 * Client de la passerelle de la plateforme (plateforme/connexion.md) : c'est
 * elle qui crée les comptes Authentik, les met dans le groupe du client et
 * envoie les invitations. Seule la passerelle a la clé de l'API Authentik.
 *
 * Ne lève jamais d'erreur : chaque appel renvoie un résultat typé, avec un
 * message en français prêt à afficher.
 */

export type Membre = { email: string; nom: string; actif: boolean; derniereConnexion: string | null };
export type Equipe = { instance: string; max: number | null; membres: Membre[] };

export type PasserelleError = {
  ok: false;
  /** Code de la passerelle (quota, deja_membre, email_invalide, cle_invalide, authentik_indisponible…), ou injoignable / reglage. */
  code: string;
  status: number;
  message: string;
  max?: number | null;
};
export type PasserelleResult<T> = ({ ok: true } & T) | PasserelleError;

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type PasserelleOptions = { url?: string; key?: string; fetch?: FetchLike; timeoutMs?: number };

const TIMEOUT_MS = 8000;

/** Message affiché pour chaque erreur connue (la phrase de la passerelle sert si le code est inconnu). */
export function passerelleMessage(code: string, max?: number | null, fallback?: string): string {
  switch (code) {
    case "quota":
      return `Toutes les places de ton offre sont prises${typeof max === "number" ? ` (${max} utilisateurs)` : ""}. Retire quelqu'un de l'équipe, ou demande plus de places à RecipeLog.`;
    case "deja_membre":
      return "Cette personne fait déjà partie de l'équipe.";
    case "email_invalide":
      return "Cette adresse e-mail n'est pas valable.";
    case "cle_invalide":
      return "Le site n'est pas reconnu par la plateforme (clé de la passerelle refusée). Préviens RecipeLog.";
    case "authentik_indisponible":
      return "Le service de connexion ne répond pas pour l'instant. Réessaie dans quelques minutes.";
    case "introuvable":
      return "Cette personne ne fait pas partie de l'équipe.";
    case "injoignable":
      return "La plateforme ne répond pas pour l'instant. Réessaie dans quelques minutes.";
    case "reglage":
      return "La gestion de l'équipe n'est pas réglée sur ce serveur (RECIPELOG_PASSERELLE_URL ou RECIPELOG_PASSERELLE_CLE manquant).";
    default:
      return fallback || "La plateforme a renvoyé une erreur inattendue. Réessaie plus tard.";
  }
}

function fail(code: string, status: number, max?: number | null, fallback?: string): PasserelleError {
  return { ok: false, code, status, message: passerelleMessage(code, max, fallback), ...(max !== undefined ? { max } : {}) };
}

async function call(
  method: string,
  path: string,
  body: unknown,
  opts: PasserelleOptions,
): Promise<{ ok: true; status: number; json: Record<string, unknown> | null } | PasserelleError> {
  const base = (opts.url ?? process.env.RECIPELOG_PASSERELLE_URL ?? "").trim().replace(/\/+$/, "");
  const key = (opts.key ?? process.env.RECIPELOG_PASSERELLE_CLE ?? "").trim();
  if (!base || !key) return fail("reglage", 0);
  const doFetch: FetchLike = opts.fetch ?? ((u, i) => fetch(u, i));
  let res: Response;
  try {
    res = await doFetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
    });
  } catch {
    return fail("injoignable", 0);
  }
  let json: Record<string, unknown> | null = null;
  try {
    const text = await res.text();
    const parsed = text ? JSON.parse(text) : null;
    json = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    json = null;
  }
  if (res.ok) return { ok: true, status: res.status, json };
  const code = typeof json?.error === "string" ? json.error : res.status === 404 ? "introuvable" : res.status === 503 ? "authentik_indisponible" : `http_${res.status}`;
  const max = typeof json?.max === "number" ? json.max : json?.max === null ? null : undefined;
  return fail(code, res.status, max, typeof json?.message === "string" ? json.message : undefined);
}

function toMembre(v: unknown): Membre | null {
  if (!v || typeof v !== "object") return null;
  const m = v as Record<string, unknown>;
  if (typeof m.email !== "string") return null;
  return {
    email: m.email.toLowerCase(),
    nom: typeof m.nom === "string" ? m.nom : "",
    actif: m.actif !== false,
    derniereConnexion: typeof m.derniereConnexion === "string" ? m.derniereConnexion : null,
  };
}

const enc = (email: string) => encodeURIComponent(email.trim().toLowerCase());

/** GET /v1/equipe : membres et nombre de places. */
export async function getEquipe(opts: PasserelleOptions = {}): Promise<PasserelleResult<{ equipe: Equipe }>> {
  const r = await call("GET", "/v1/equipe", undefined, opts);
  if (!r.ok) return r;
  const j = r.json ?? {};
  const membres = Array.isArray(j.membres) ? j.membres.map(toMembre).filter((m): m is Membre => !!m) : [];
  return {
    ok: true,
    equipe: {
      instance: typeof j.instance === "string" ? j.instance : "",
      max: typeof j.max === "number" ? j.max : null,
      membres,
    },
  };
}

/** POST /v1/equipe : crée le compte si besoin, l'ajoute à l'équipe et envoie l'invitation. */
export async function inviterMembre(
  email: string,
  nom?: string,
  opts: PasserelleOptions = {},
): Promise<PasserelleResult<{ membre: Membre | null; invitationEnvoyee: boolean }>> {
  const r = await call("POST", "/v1/equipe", { email: email.trim().toLowerCase(), ...(nom ? { nom } : {}) }, opts);
  if (!r.ok) return r;
  return { ok: true, membre: toMembre(r.json?.membre), invitationEnvoyee: r.json?.invitationEnvoyee === true };
}

/** DELETE /v1/equipe/<email> : retire de l'équipe (404 = déjà retiré, compté comme réussi). */
export async function retirerMembre(email: string, opts: PasserelleOptions = {}): Promise<PasserelleResult<object>> {
  const r = await call("DELETE", `/v1/equipe/${enc(email)}`, undefined, opts);
  if (!r.ok && r.status === 404) return { ok: true };
  return r.ok ? { ok: true } : r;
}

/** POST /v1/equipe/<email>/invitation : renvoie l'e-mail « Choisis ton mot de passe ». */
export async function renvoyerInvitation(
  email: string,
  opts: PasserelleOptions = {},
): Promise<PasserelleResult<{ invitationEnvoyee: boolean }>> {
  const r = await call("POST", `/v1/equipe/${enc(email)}/invitation`, undefined, opts);
  if (!r.ok) return r;
  return { ok: true, invitationEnvoyee: r.json?.invitationEnvoyee === true };
}

// ------------------------------------------------------------ support (« Signaler un problème »)

export type TypeDemande = "bug" | "question" | "idee";
export type MessageDemande = { de: "client" | "support"; qui: string; texte: string; date: string };
export type Demande = {
  id: string;
  date: string;
  maj: string;
  type: TypeDemande;
  email: string;
  statut: "ouvert" | "repondu" | "ferme";
  luClient: boolean;
  messages: MessageDemande[];
};
export type ContexteDemande = { page?: string; navigateur?: string; ecran?: string; version?: string; role?: string };

function toDemande(v: unknown): Demande | null {
  if (!v || typeof v !== "object") return null;
  const d = v as Record<string, unknown>;
  if (typeof d.id !== "string" || !Array.isArray(d.messages)) return null;
  const messages = d.messages
    .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
    .map((m) => ({
      de: m.de === "support" ? ("support" as const) : ("client" as const),
      qui: typeof m.qui === "string" ? m.qui : "",
      texte: typeof m.texte === "string" ? m.texte : "",
      date: typeof m.date === "string" ? m.date : "",
    }));
  return {
    id: d.id,
    date: typeof d.date === "string" ? d.date : "",
    maj: typeof d.maj === "string" ? d.maj : "",
    type: d.type === "bug" || d.type === "idee" ? d.type : "question",
    email: typeof d.email === "string" ? d.email : "",
    statut: d.statut === "repondu" || d.statut === "ferme" ? d.statut : "ouvert",
    luClient: d.luClient !== false,
    messages,
  };
}

/** POST /v1/support : nouvelle demande, envoyée au support de RecipeLog. */
export async function creerDemande(
  demande: { email: string; type: TypeDemande; message: string; contexte: ContexteDemande },
  opts: PasserelleOptions = {},
): Promise<PasserelleResult<{ demande: Demande | null }>> {
  const r = await call("POST", "/v1/support", demande, opts);
  if (!r.ok) return r;
  return { ok: true, demande: toDemande(r.json?.demande) };
}

/** GET /v1/support?email= : les demandes de cette personne, la plus récente d'abord. */
export async function listerDemandes(email: string, opts: PasserelleOptions = {}): Promise<PasserelleResult<{ demandes: Demande[] }>> {
  const r = await call("GET", `/v1/support?email=${enc(email)}`, undefined, opts);
  if (!r.ok) return r;
  const liste = Array.isArray(r.json?.demandes) ? r.json.demandes : [];
  return { ok: true, demandes: liste.map(toDemande).filter((d): d is Demande => !!d) };
}

/** POST /v1/support/<id>/messages : la personne répond dans sa demande (elle se rouvre). */
export async function ajouterMessageDemande(
  id: string,
  email: string,
  message: string,
  opts: PasserelleOptions = {},
): Promise<PasserelleResult<{ demande: Demande | null }>> {
  const r = await call("POST", `/v1/support/${encodeURIComponent(id)}/messages`, { email, message }, opts);
  if (!r.ok) return r;
  return { ok: true, demande: toDemande(r.json?.demande) };
}

/** POST /v1/support/<id>/lu : la personne a vu la réponse. */
export async function marquerDemandeLue(id: string, email: string, opts: PasserelleOptions = {}): Promise<PasserelleResult<object>> {
  const r = await call("POST", `/v1/support/${encodeURIComponent(id)}/lu`, { email }, opts);
  return r.ok ? { ok: true } : r;
}

// ------------------------------------------------------------ maintenance et bandeaux (lot 6)

export type Bandeau = { id: string; niveau: "info" | "alerte"; texte: string; maintenance?: { debut: string; fin: string | null } };
export type Annonces = { maintenance: { message: string; fin: string | null } | null; bandeaux: Bandeau[] };

const AUCUNE: Annonces = { maintenance: null, bandeaux: [] };
let cache: { valeur: Annonces; jusqua: number } | null = null;

function toAnnonces(j: Record<string, unknown> | null): Annonces {
  const m = j?.maintenance as Record<string, unknown> | null | undefined;
  const bandeaux = Array.isArray(j?.bandeaux) ? j.bandeaux : [];
  return {
    maintenance:
      m && typeof m === "object"
        ? { message: typeof m.message === "string" ? m.message : "", fin: typeof m.fin === "string" ? m.fin : null }
        : null,
    bandeaux: bandeaux
      .filter((b): b is Record<string, unknown> => !!b && typeof b === "object" && typeof b.id === "string" && typeof b.texte === "string")
      .map((b) => {
        const mt = b.maintenance as Record<string, unknown> | undefined;
        return {
          id: b.id as string,
          niveau: b.niveau === "alerte" ? ("alerte" as const) : ("info" as const),
          texte: b.texte as string,
          ...(mt && typeof mt.debut === "string" ? { maintenance: { debut: mt.debut, fin: typeof mt.fin === "string" ? mt.fin : null } } : {}),
        };
      }),
  };
}

/**
 * GET /v1/annonces : maintenance en cours et bandeaux de la plateforme pour ce site.
 * Gardé 30 secondes (chaque page le demande). Plateforme injoignable = rien à afficher :
 * une panne de la passerelle ne doit jamais bloquer le site.
 */
export async function getAnnonces(opts: PasserelleOptions = {}): Promise<Annonces> {
  if (!opts.fetch && cache && cache.jusqua > Date.now()) return cache.valeur;
  const r = await call("GET", "/v1/annonces", undefined, { timeoutMs: 3000, ...opts });
  const valeur = r.ok ? toAnnonces(r.json) : AUCUNE;
  if (!opts.fetch) cache = { valeur, jusqua: Date.now() + (r.ok ? 30000 : 10000) };
  return valeur;
}

// ------------------------------------------------------------ lecture des factures par IA (lot 7)

/** Lectures par IA avec la clé de la plateforme : limite du mois réglée dans le panel. */
export type QuotaIA = { disponible: boolean; limite: number; utilise: number; mois: string };

/** GET /v1/ia/quota. disponible = false : la plateforme n'a pas (encore) de clé d'IA. */
export async function getQuotaIA(opts: PasserelleOptions = {}): Promise<PasserelleResult<{ quota: QuotaIA }>> {
  const r = await call("GET", "/v1/ia/quota", undefined, { timeoutMs: 4000, ...opts });
  if (!r.ok) return r;
  const j = r.json ?? {};
  return {
    ok: true,
    quota: {
      disponible: j.disponible === true,
      limite: typeof j.limite === "number" ? j.limite : 0,
      utilise: typeof j.utilise === "number" ? j.utilise : 0,
      mois: typeof j.mois === "string" ? j.mois : "",
    },
  };
}
