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
