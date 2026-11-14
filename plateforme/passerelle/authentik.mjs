// Tout ce que la plateforme demande à Authentik passe par ici.
// Seule la passerelle détient la clé d'Authentik (AUTHENTIK_TOKEN).
// Voir ../connexion.md.
import { createHash, randomBytes } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

const URL_INTERNE = (process.env.AUTHENTIK_URL || "http://recipelog-authentik:9000").replace(/\/$/, "");
const URL_PUBLIQUE = (process.env.AUTHENTIK_PUBLIC || "https://auth.recipelog.cc").replace(/\/$/, "");
const JETON = process.env.AUTHENTIK_TOKEN || "";
const DOMAINE = process.env.DOMAINE || "recipelog.cc";

export const GROUPE_SUPER = "super-admins";
export const groupeClient = (nom) => `client-${nom}`;
export const slugClient = (nom) => `rl-${nom}`;
export const hacher = (cle) => createHash("sha256").update(cle).digest("hex");

export class ErreurPasserelle extends Error {
  constructor(statut, code, message, extra = {}) {
    super(message);
    this.statut = statut;
    this.code = code;
    this.extra = extra;
  }
}

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;
export function emailValide(e) {
  return typeof e === "string" && e.length <= 254 && EMAIL_RE.test(e.trim());
}
export function nomValide(n) {
  return typeof n === "string" && /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/.test(n);
}

/**
 * Appel à l'API d'Authentik. On passe par le réseau Docker mais avec l'adresse
 * publique en en-tête : les liens qu'Authentik fabrique (email de mot de passe,
 * émetteur OIDC) portent alors https://auth.<domaine>.
 */
export async function api(methode, chemin, corps) {
  let rep;
  try {
    rep = await requete(methode, `${URL_INTERNE}/api/v3${chemin}`, corps);
  } catch {
    throw new ErreurPasserelle(503, "authentik_indisponible", "Authentik ne répond pas pour le moment. Réessaie dans une minute.");
  }
  if (rep.statut === 204) return null;
  let donnees = null;
  try {
    donnees = rep.texte ? JSON.parse(rep.texte) : null;
  } catch {
    donnees = rep.texte;
  }
  if (rep.statut < 200 || rep.statut >= 300) {
    if (rep.statut >= 500) {
      throw new ErreurPasserelle(503, "authentik_indisponible", "Authentik a rencontré une erreur. Réessaie dans une minute.");
    }
    throw new ErreurPasserelle(rep.statut, "authentik", `Authentik a refusé : ${methode} ${chemin} → ${rep.statut}`, { detail: donnees });
  }
  return donnees;
}

// fetch() ne laisse pas choisir l'en-tête Host : on passe par node:http.
function requete(methode, adresse, corps, { anonyme = false, cookie = "" } = {}) {
  const u = new URL(adresse);
  const charge = corps === undefined ? null : Buffer.from(JSON.stringify(corps));
  return new Promise((ok, ko) => {
    const req = (u.protocol === "https:" ? httpsRequest : httpRequest)(
      {
        method: methode,
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        headers: {
          ...(anonyme ? {} : { Authorization: `Bearer ${JETON}` }),
          ...(cookie ? { Cookie: cookie } : {}),
          Accept: "application/json",
          Host: new URL(URL_PUBLIQUE).host,
          "X-Forwarded-Proto": "https",
          ...(charge ? { "Content-Type": "application/json", "Content-Length": charge.length } : {}),
        },
        timeout: 15000,
      },
      (rep) => {
        const morceaux = [];
        rep.on("data", (m) => morceaux.push(m));
        rep.on("end", () =>
          ok({ statut: rep.statusCode ?? 0, texte: Buffer.concat(morceaux).toString("utf8"), cookies: rep.headers["set-cookie"] ?? [] }),
        );
        rep.on("error", ko);
      },
    );
    req.on("timeout", () => req.destroy(new Error("délai dépassé")));
    req.on("error", ko);
    if (charge) req.write(charge);
    req.end();
  });
}

const q = (o) => "?" + new URLSearchParams(o).toString();

async function tous(chemin, params = {}) {
  const r = await api("GET", chemin + q({ page_size: "500", ...params }));
  return r?.results ?? [];
}

// ------------------------------------------------------------ objets fixes
const cache = new Map();
async function une(cleCache, chemin, params, quoi) {
  if (cache.has(cleCache)) return cache.get(cleCache);
  const [x] = await tous(chemin, params);
  if (!x) throw new ErreurPasserelle(500, "configuration", `Authentik : ${quoi} introuvable (les réglages RecipeLog sont-ils appliqués ?).`);
  cache.set(cleCache, x);
  return x;
}
const flux = (slug) => une(`flux:${slug}`, "/flows/instances/", { slug }, `flux ${slug}`);
const portee = (managed) => une(`portee:${managed}`, "/propertymappings/provider/scope/", { managed }, `portée ${managed}`);
const certificat = () => une("cert", "/crypto/certificatekeypairs/", { name: "authentik Self-signed Certificate" }, "certificat");

export async function groupe(nom) {
  const [g] = await tous("/core/groups/", { name: nom, include_users: "false" });
  return g ?? null;
}

async function groupeObligatoire(nom) {
  const g = await groupe(nom);
  if (!g) throw new ErreurPasserelle(500, "configuration", `Groupe Authentik « ${nom} » introuvable.`);
  return g;
}

// ------------------------------------------------------------ comptes
export async function utilisateurParEmail(email) {
  const e = email.trim().toLowerCase();
  const liste = await tous("/core/users/", { email: e, include_groups: "true" });
  return liste.find((u) => (u.email || "").toLowerCase() === e) ?? null;
}

async function assurerUtilisateur(email, nomAffiche) {
  const e = email.trim().toLowerCase();
  const existant = await utilisateurParEmail(e);
  if (existant) {
    if (!existant.is_active) await api("PATCH", `/core/users/${existant.pk}/`, { is_active: true });
    return existant;
  }
  return api("POST", "/core/users/", {
    username: e,
    name: (nomAffiche || "").trim() || e,
    email: e,
    is_active: true,
    path: "recipelog",
    type: "internal",
  });
}

/**
 * Email « Choisis ton mot de passe ». false si l'envoi a échoué (SMTP non réglé…).
 *
 * On joue le flux de récupération comme un visiteur anonyme qui aurait tapé
 * son adresse : c'est l'étape email du flux qui crée le lien (3 jours, voir le
 * blueprint) et envoie l'email. Surtout PAS l'API recovery_email + modification
 * du jeton : modifier ce jeton par l'API le transforme en clé d'API.
 */
export async function envoyerInvitation(utilisateur) {
  const chemin = `${URL_INTERNE}/api/v3/flows/executor/recipelog-recuperation/?query=`;
  try {
    const debut = await requete("GET", chemin, undefined, { anonyme: true });
    if (debut.statut !== 200) throw new Error(`début du flux → ${debut.statut}`);
    const cookie = debut.cookies.map((c) => c.split(";")[0]).join("; ");
    if (!cookie) throw new Error("pas de session Authentik");
    const fin = await requete(
      "POST",
      chemin,
      { component: "ak-stage-identification", uid_field: utilisateur.email },
      { anonyme: true, cookie },
    );
    // Authentik renvoie vers l'étape suivante ; c'est en l'affichant que
    // l'étape email envoie l'email.
    let rep = fin;
    const cookie2 = fin.cookies.length ? fin.cookies.map((c) => c.split(";")[0]).join("; ") : cookie;
    if (rep.statut === 302) rep = await requete("GET", chemin, undefined, { anonyme: true, cookie: cookie2 });
    if (rep.statut !== 200) throw new Error(`étape email → ${rep.statut}`);
    let d = null;
    try { d = JSON.parse(rep.texte); } catch { /* rien */ }
    if (d?.component !== "ak-stage-email") throw new Error(`réponse inattendue : ${d?.component ?? rep.texte.slice(0, 200)}`);
    return true;
  } catch (e) {
    console.error(`Envoi de l'email à ${utilisateur.email} impossible :`, e.message);
    return false;
  }
}

const estSuperAdmin = (u) => (u.groups_obj ?? []).some((g) => g.name === GROUPE_SUPER);
const groupesClients = (u) => (u.groups_obj ?? []).filter((g) => g.name.startsWith("client-"));

function versMembre(u) {
  return {
    email: (u.email || "").toLowerCase(),
    nom: u.name || "",
    actif: !!u.is_active,
    derniereConnexion: u.last_login ?? null,
  };
}

// ------------------------------------------------------------ clients
/** Retrouve le client à partir de sa clé (en-tête Authorization de l'instance). */
const parCle = new Map(); // hash → { nom, jusqua }
export async function clientParCle(cle) {
  if (!cle || cle.length < 32) return null;
  const h = hacher(cle);
  const c = parCle.get(h);
  if (c && c.jusqua > Date.now()) return c.nom;
  const groupes = await tous("/core/groups/", { search: "client-", include_users: "false" });
  for (const g of groupes) {
    const a = g.attributes ?? {};
    if (a.recipelog_cle_sha256 === h && typeof a.recipelog_instance === "string") {
      parCle.set(h, { nom: a.recipelog_instance, jusqua: Date.now() + 60_000 });
      return a.recipelog_instance;
    }
  }
  return null;
}

export async function equipe(nom) {
  const g = await groupeObligatoire(groupeClient(nom));
  const membres = (await tous("/core/users/", { groups_by_name: groupeClient(nom), include_groups: "true" }))
    .filter((u) => !estSuperAdmin(u))
    .map(versMembre)
    .sort((a, b) => a.email.localeCompare(b.email));
  const max = g.attributes?.max_utilisateurs;
  return { instance: nom, max: Number.isInteger(max) && max > 0 ? max : null, membres };
}

export async function inviter(nom, email, nomAffiche) {
  if (!emailValide(email)) throw new ErreurPasserelle(400, "email_invalide", "Cette adresse email n'est pas valable.");
  const g = await groupeObligatoire(groupeClient(nom));
  const e = email.trim().toLowerCase();
  const { max, membres } = await equipe(nom);
  if (membres.some((m) => m.email === e)) throw new ErreurPasserelle(409, "deja_membre", "Cette personne fait déjà partie de l'équipe.");
  if (max !== null && membres.length >= max) {
    throw new ErreurPasserelle(409, "quota", `Ton abonnement compte ${max} utilisateurs et ils sont tous pris. Demande des places en plus pour inviter quelqu'un d'autre.`, { max });
  }
  const u = await assurerUtilisateur(e, nomAffiche);
  await api("POST", `/core/groups/${g.pk}/add_user/`, { pk: u.pk });
  const invitationEnvoyee = await envoyerInvitation(u);
  const frais = await utilisateurParEmail(e);
  return { membre: versMembre(frais ?? u), invitationEnvoyee };
}

export async function retirer(nom, email) {
  const g = await groupeObligatoire(groupeClient(nom));
  const u = await utilisateurParEmail(email);
  if (!u || !groupesClients(u).some((x) => x.name === g.name)) {
    throw new ErreurPasserelle(404, "inconnu", "Cette personne ne fait pas partie de l'équipe.");
  }
  await api("POST", `/core/groups/${g.pk}/remove_user/`, { pk: u.pk });
  const autres = groupesClients(u).filter((x) => x.name !== g.name);
  if (!autres.length && !estSuperAdmin(u)) {
    await api("PATCH", `/core/users/${u.pk}/`, { is_active: false });
  }
}

export async function renvoyer(nom, email) {
  const u = await utilisateurParEmail(email);
  if (!u || !groupesClients(u).some((x) => x.name === groupeClient(nom))) {
    throw new ErreurPasserelle(404, "inconnu", "Cette personne ne fait pas partie de l'équipe.");
  }
  return { invitationEnvoyee: await envoyerInvitation(u) };
}

// ------------------------------------------------------------ administration (cli.mjs)
/**
 * Crée tout ce qu'il faut pour un nouveau client : groupe, fournisseur OIDC,
 * application réservée au groupe du client et aux super-admins.
 * Renvoie les secrets à écrire dans instance.env (montrés une seule fois).
 */
export async function creerClient(nom, { max = null, url = `https://${nom}.${DOMAINE}` } = {}) {
  if (!nomValide(nom)) throw new ErreurPasserelle(400, "nom_invalide", `Nom de client invalide : ${nom}`);
  if (await groupe(groupeClient(nom))) throw new ErreurPasserelle(409, "existe", `Le client « ${nom} » existe déjà dans Authentik.`);
  const cle = randomBytes(32).toString("hex");
  const secret = randomBytes(48).toString("hex");
  const slug = slugClient(nom);

  const g = await api("POST", "/core/groups/", {
    name: groupeClient(nom),
    attributes: {
      recipelog_instance: nom,
      recipelog_cle_sha256: hacher(cle),
      max_utilisateurs: Number.isInteger(max) && max > 0 ? max : null,
    },
  });
  const [autorisation, invalidation, openid, emailP, profil, cert] = await Promise.all([
    flux("default-provider-authorization-implicit-consent"),
    flux("recipelog-deconnexion"),
    portee("goauthentik.io/providers/oauth2/scope-openid"),
    portee("goauthentik.io/providers/oauth2/scope-email"),
    portee("goauthentik.io/providers/oauth2/scope-profile"),
    certificat(),
  ]);
  const fournisseur = await api("POST", "/providers/oauth2/", {
    name: `RecipeLog ${nom}`,
    authorization_flow: autorisation.pk,
    invalidation_flow: invalidation.pk,
    client_type: "confidential",
    client_id: slug,
    client_secret: secret,
    redirect_uris: [{ matching_mode: "strict", url: `${url}/auth/retour` }],
    property_mappings: [openid.pk, emailP.pk, profil.pk],
    signing_key: cert.pk,
    include_claims_in_id_token: true,
    sub_mode: "hashed_user_id",
    issuer_mode: "per_provider",
    access_code_validity: "minutes=2",
    access_token_validity: "minutes=10",
  });
  const appli = await api("POST", "/core/applications/", {
    name: `RecipeLog ${nom}`,
    slug,
    provider: fournisseur.pk,
    meta_launch_url: url,
    policy_engine_mode: "any",
  });
  const sup = await groupeObligatoire(GROUPE_SUPER);
  await api("POST", "/policies/bindings/", { target: appli.pk, group: g.pk, order: 0, enabled: true, negate: false, timeout: 30 });
  await api("POST", "/policies/bindings/", { target: appli.pk, group: sup.pk, order: 1, enabled: true, negate: false, timeout: 30 });

  return {
    OIDC_ISSUER: `${URL_PUBLIQUE}/application/o/${slug}/`,
    OIDC_INTERNE: URL_INTERNE,
    OIDC_CLIENT_ID: slug,
    OIDC_CLIENT_SECRET: secret,
    RECIPELOG_PASSERELLE_CLE: cle,
  };
}

export async function supprimerClient(nom) {
  const slug = slugClient(nom);
  const [appli] = await tous("/core/applications/", { slug });
  if (appli) await api("DELETE", `/core/applications/${slug}/`);
  const [f] = await tous("/providers/oauth2/", { client_id: slug });
  if (f) await api("DELETE", `/providers/oauth2/${f.pk}/`);
  const g = await groupe(groupeClient(nom));
  if (g) {
    const membres = await tous("/core/users/", { groups_by_name: groupeClient(nom), include_groups: "true" });
    await api("DELETE", `/core/groups/${g.pk}/`);
    for (const u of membres) {
      const autres = groupesClients(u).filter((x) => x.name !== g.name);
      if (!autres.length && !estSuperAdmin(u)) await api("PATCH", `/core/users/${u.pk}/`, { is_active: false });
    }
  }
}

export async function changerQuota(nom, max) {
  const g = await groupeObligatoire(groupeClient(nom));
  const m = Number.isInteger(max) && max > 0 ? max : null;
  await api("PATCH", `/core/groups/${g.pk}/`, { attributes: { ...(g.attributes ?? {}), max_utilisateurs: m } });
  return { instance: nom, max: m };
}

/** Super-admins : toi (ADMIN_EMAILS). Compte créé + email pour choisir le mot de passe. */
export async function initialiser(adminEmails) {
  const sup = await groupeObligatoire(GROUPE_SUPER);
  const resultats = [];
  for (const brut of adminEmails) {
    const email = brut.trim().toLowerCase();
    if (!emailValide(email)) continue;
    const existait = !!(await utilisateurParEmail(email));
    const u = await assurerUtilisateur(email, "");
    await api("POST", `/core/groups/${sup.pk}/add_user/`, { pk: u.pk });
    const invitation = existait ? false : await envoyerInvitation(u);
    resultats.push({ email, cree: !existait, invitationEnvoyee: invitation });
  }
  return resultats;
}

/**
 * Bouton « Se connecter avec Google » sur la page de connexion.
 * Google ne crée jamais de compte : il relie seulement un compte Google à un
 * compte RecipeLog qui a la même adresse email (créé par une invitation).
 */
export async function brancherGoogle(clientId, secret) {
  if (!clientId || !secret) throw new ErreurPasserelle(400, "google", "Il faut l'identifiant et le secret du client OAuth Google.");
  const flot = await flux("default-source-authentication");
  const corps = {
    name: "Google",
    slug: "google",
    enabled: true,
    provider_type: "google",
    consumer_key: clientId,
    consumer_secret: secret,
    authentication_flow: flot.pk,
    enrollment_flow: null,
    user_matching_mode: "email_link",
    // Adresses de Google déjà connues d'Authentik : pas de découverte au réglage.
    oidc_well_known_url: "",
    oidc_jwks_url: "",
    policy_engine_mode: "any",
  };
  const [existante] = await tous("/sources/oauth/", { slug: "google" });
  const source = existante ? await api("PATCH", "/sources/oauth/google/", corps) : await api("POST", "/sources/oauth/", corps);
  const [etape] = await tous("/stages/identification/", { name: "default-authentication-identification" });
  if (!etape) throw new ErreurPasserelle(500, "configuration", "Étape de connexion introuvable.");
  if (!etape.sources.includes(source.pk)) {
    await api("PATCH", `/stages/identification/${etape.pk}/`, { sources: [...etape.sources, source.pk] });
  }
  return { ok: true, adresseDeRetourGoogle: `${URL_PUBLIQUE}/source/oauth/callback/google/` };
}
