// Vente (lot 8) : ton identité d'éditeur, les offres et leurs prix, et les
// pages publiques qui en découlent, sur le site vitrine :
//   /tarifs  /mentions-legales  /cgv  /confidentialite  /sous-traitance
// Les réglages sont dans <DONNEES>/vente/vente.json, modifiés depuis le panel
// (section « Vente »). Tout est facultatif : un champ vide s'affiche
// « à compléter » ; tant que « publier » n'est pas coché, les pages portent un
// bandeau « brouillon » et ne sont pas indexées par les moteurs de recherche.
// Le moteur sert GET /vente et POST /vente ; le panel affiche les pages.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

export class RefusVente extends Error {}

export const PAGES = {
  tarifs: "Tarifs",
  "mentions-legales": "Mentions légales",
  cgv: "Conditions générales de vente",
  confidentialite: "Politique de confidentialité",
  "sous-traitance": "Accord de sous-traitance des données",
};

export const CHAMPS = ["nom", "statut", "siren", "rcs", "adresse", "email", "telephone", "directeur", "numeroTva", "ville", "emailsService", "sauvegardesExternes"];

// Prix d'exemple, à changer dans le panel.
export const OFFRES_EXEMPLE = [
  { nom: "Essentiel", prix: 29, utilisateurs: 3, lectures: 30, mcp: false, texte: "Pour une boutique ou un laboratoire qui démarre." },
  { nom: "Équipe", prix: 59, utilisateurs: 10, lectures: 100, mcp: true, texte: "Pour une équipe avec plusieurs postes et apprentis." },
  { nom: "Sur mesure", prix: null, utilisateurs: 0, lectures: 0, mcp: true, texte: "Plusieurs boutiques, une école, des besoins à part : on en parle." },
];

export const PAR_DEFAUT = {
  publie: false,
  identite: Object.fromEntries(CHAMPS.map((c) => [c, ""])),
  tva: "franchise",
  essai: 30,
  annuel: 2,
  offres: OFFRES_EXEMPLE,
  enVigueur: "",
  majLe: null,
};

const fichier = (donnees) => `${donnees}/vente/vente.json`;

export async function lire(donnees) {
  let v = {};
  try {
    v = JSON.parse(await readFile(fichier(donnees), "utf8"));
  } catch {
    v = {};
  }
  return {
    ...PAR_DEFAUT,
    ...v,
    identite: { ...PAR_DEFAUT.identite, ...(v.identite ?? {}) },
    offres: Array.isArray(v.offres) ? v.offres : PAR_DEFAUT.offres,
  };
}

const texte = (v, max, nom) => {
  if (v == null) return "";
  if (typeof v !== "string" || v.length > max || /[\u0000-\u0008\u000b-\u001f]/.test(v)) throw new RefusVente(`${nom} : ${max} caractères au plus.`);
  return v.trim();
};
const entier = (v, min, max, nom) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new RefusVente(`${nom} : nombre entre ${min} et ${max}.`);
  return n;
};

/** Contrôle et range ce que le panel envoie. */
export function nettoyer(c) {
  if (!c || typeof c !== "object") throw new RefusVente("Réglages manquants.");
  const identite = {};
  for (const k of CHAMPS) identite[k] = texte(c.identite?.[k], k === "adresse" ? 300 : 160, k);
  if (identite.email && !/^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/.test(identite.email)) throw new RefusVente("Adresse e-mail invalide.");
  if (identite.siren && !/^[0-9 ]{9,17}$/.test(identite.siren)) throw new RefusVente("SIREN : 9 chiffres (ou SIRET : 14 chiffres).");
  if (!Array.isArray(c.offres) || c.offres.length > 6) throw new RefusVente("De 0 à 6 offres.");
  const offres = c.offres.map((o, i) => {
    const nom = texte(o?.nom, 40, `Offre ${i + 1}, nom`);
    if (!nom) throw new RefusVente(`Offre ${i + 1} : donne-lui un nom.`);
    const prix = entier(o.prix, 0, 100000, `${nom}, prix`);
    return {
      nom,
      prix: prix == null ? null : Math.round(prix * 100) / 100,
      utilisateurs: entier(o.utilisateurs, 0, 10000, `${nom}, utilisateurs`) ?? 0,
      lectures: entier(o.lectures, 0, 100000, `${nom}, lectures IA`) ?? 0,
      mcp: Boolean(o.mcp),
      texte: texte(o.texte, 200, `${nom}, description`),
    };
  });
  if (!["franchise", "assujetti"].includes(c.tva)) throw new RefusVente("TVA : franchise ou assujetti.");
  const date = texte(c.enVigueur, 10, "Date");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RefusVente("Date : AAAA-MM-JJ.");
  return {
    publie: Boolean(c.publie),
    identite,
    tva: c.tva,
    essai: entier(c.essai, 0, 365, "Essai") ?? 0,
    annuel: entier(c.annuel, 0, 6, "Mois offerts à l'année") ?? 0,
    offres,
    enVigueur: date,
  };
}

/** Ce qui manque pour publier (affiché dans le panel). */
export function manques(v) {
  const i = v.identite;
  const m = [];
  if (!i.nom) m.push("ton nom ou celui de l'entreprise");
  if (!i.statut) m.push("ton statut");
  if (!i.siren) m.push("le SIREN");
  if (!i.adresse) m.push("l'adresse");
  if (!i.email) m.push("l'e-mail de contact");
  if (!i.telephone) m.push("le téléphone (obligatoire pour l'hébergeur, donc toi)");
  if (!i.ville) m.push("la ville du tribunal");
  if (v.tva === "assujetti" && !i.numeroTva) m.push("le numéro de TVA");
  return m;
}

export async function regler(donnees, corps) {
  const v = { ...nettoyer(corps), majLe: new Date().toISOString() };
  await mkdir(`${donnees}/vente`, { recursive: true });
  const tmp = `${fichier(donnees)}.${randomBytes(4).toString("hex")}`;
  await writeFile(tmp, `${JSON.stringify(v, null, 2)}\n`);
  await rename(tmp, fichier(donnees));
  return { ...(await lire(donnees)), manques: manques(v) };
}

// ------------------------------------------------------------ pages publiques

const echapper = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const prixFr = (n) => `${Number(n).toLocaleString("fr-FR", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })} €`;
const dateFr = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/** Rend une page. nom = clé de PAGES. */
export function page(nom, v, { domaine, cssUrl }) {
  if (!PAGES[nom]) return null;
  const i = v.identite;
  const ac = (val) => (val ? echapper(val) : `<mark>à compléter</mark>`);
  const facultatif = (val, avant = "", apres = "") => (val ? `${avant}${echapper(val)}${apres}` : "");
  const contact = i.email ? `<a href="mailto:${echapper(i.email)}">${echapper(i.email)}</a>` : ac("");
  const ht = v.tva === "franchise" ? "TVA non applicable (article 293 B du CGI)" : "hors taxes, TVA en plus";
  const enVigueur = v.enVigueur ? dateFr(v.enVigueur) : ac("");
  const editeur = `${ac(i.nom)}${facultatif(i.statut, ", ")}`;
  const sousTraitants = [
    ["Cloudflare, Inc.", "Réseau, protection et connexion", "États-Unis"],
    ["Anthropic, PBC", "Lecture des factures par IA, seulement avec l'IA de la plateforme", "États-Unis"],
    ["Google LLC", "Connexion « avec Google », si elle est choisie", "États-Unis"],
    [i.emailsService || "Service d'envoi d'e-mails", "Envoi des e-mails (invitations, mots de passe, annonces)", i.emailsService ? "voir ce service" : "à compléter"],
    ...(i.sauvegardesExternes ? [[i.sauvegardesExternes, "Copie chiffrée des sauvegardes", "France"]] : []),
  ];
  const tableST = `<table><thead><tr><th>Service</th><th>Rôle</th><th>Pays</th></tr></thead><tbody>${sousTraitants
    .map(([a, b, c]) => `<tr><td>${echapper(a)}</td><td>${echapper(b)}</td><td>${c === "à compléter" ? ac("") : echapper(c)}</td></tr>`)
    .join("")}</tbody></table>`;

  const corps = {
    tarifs: () => {
      const cartes = v.offres
        .map(
          (o) => `<article class="offre"><h2>${echapper(o.nom)}</h2>
      <p class="prix">${o.prix == null ? "Sur devis" : `${prixFr(o.prix)}<small> / mois</small>`}</p>
      ${o.texte ? `<p>${echapper(o.texte)}</p>` : ""}
      <ul>
        <li>${o.utilisateurs ? `Jusqu'à ${o.utilisateurs} utilisateur${o.utilisateurs > 1 ? "s" : ""}` : "Utilisateurs selon le besoin"}</li>
        <li>Recettes, coûts de revient, marges, fournisseurs et factures</li>
        <li>${o.lectures ? `${o.lectures} lectures de factures par IA par mois` : o.prix == null ? "Lectures de factures par IA selon le besoin" : "Saisie des factures à la main"}</li>
        ${o.mcp ? "<li>Accès pour Claude (MCP)</li>" : ""}
        <li>Sauvegarde chaque nuit, mises à jour et support compris</li>
      </ul></article>`,
        )
        .join("");
      return `<p class="chapo">${v.essai ? `Essai gratuit de ${v.essai} jours, sans carte bancaire. ` : ""}Sans engagement : tu arrêtes quand tu veux, à la fin du mois payé.${v.annuel ? ` À l'année, ${v.annuel} mois offert${v.annuel > 1 ? "s" : ""}.` : ""}</p>
      <div class="offres">${cartes || "<p>Les offres arrivent bientôt.</p>"}</div>
      <p class="petit">Prix en euros par mois, ${ht}. Réservé aux professionnels. Voir les <a href="/cgv">conditions générales de vente</a>.</p>`;
    },
    "mentions-legales": () => `
      <h2>Éditeur</h2><p>Le site ${echapper(domaine)} et le service RecipeLog (ses adresses en *.${echapper(domaine)}) sont édités par ${editeur}, SIREN ${ac(i.siren)}${facultatif(i.rcs, ", ")}, ${ac(i.adresse)}.<br>
      ${v.tva === "franchise" ? "TVA non applicable, article 293 B du CGI." : `TVA intracommunautaire : ${ac(i.numeroTva)}.`}</p>
      <p>Contact : ${contact}${facultatif(i.telephone, ", ")}.</p>
      <h2>Directeur de la publication</h2><p>${ac(i.directeur || i.nom)}.</p>
      <h2>Hébergement</h2><p>Le service est hébergé par l'éditeur lui-même, sur un serveur situé en France : ${editeur}, ${ac(i.adresse)}, ${ac(i.telephone)}.<br>
      Le trafic passe par Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, États-Unis (réseau et protection).${i.sauvegardesExternes ? ` Les sauvegardes sont aussi copiées, chiffrées, chez ${echapper(i.sauvegardesExternes)}.` : ""}</p>
      <h2>Propriété intellectuelle</h2><p>Le logiciel RecipeLog, son nom, son logo et les textes de ce site appartiennent à l'éditeur. Les recettes, photos, factures et autres contenus ajoutés par les clients restent leur propriété.</p>
      <h2>Données personnelles et cookies</h2><p>Voir la <a href="/confidentialite">politique de confidentialité</a>. Le site n'utilise que des cookies nécessaires à la connexion : pas de publicité, pas de suivi.</p>`,
    cgv: () => `
      <p class="petit">En vigueur au ${enVigueur}.</p>
      <h2>1. Objet</h2><p>Ces conditions encadrent l'abonnement au service en ligne RecipeLog (recettes, coûts de revient, fournisseurs et factures), fourni par ${editeur} (« RecipeLog », voir les <a href="/mentions-legales">mentions légales</a>) à un client professionnel (« le Client »). Elles priment sur tout autre document du Client.</p>
      <h2>2. Clients concernés</h2><p>Le service est réservé aux professionnels (artisans, restaurants, pâtisseries, traiteurs, écoles…) agissant pour leur activité. Le Client déclare avoir cette qualité ; le droit de rétractation du Code de la consommation ne s'applique donc pas.</p>
      <h2>3. Commande et essai</h2><p>L'abonnement démarre à la création de l'espace du Client (son adresse &lt;nom&gt;.${echapper(domaine)}).${v.essai ? ` Un essai gratuit de ${v.essai} jours est proposé ; à son terme, l'espace est mis en pause tant que le Client n'a pas choisi d'offre. Les données de l'essai sont gardées 30 jours.` : ""}</p>
      <h2>4. Offres et prix</h2><p>Les offres, ce qu'elles comprennent (utilisateurs, lectures de factures par IA, accès MCP) et leurs prix sont ceux de la page <a href="/tarifs">Tarifs</a> au jour de la commande, en euros, ${ht}. RecipeLog peut changer ses prix pour l'avenir en prévenant le Client par e-mail au moins 30 jours avant ; le Client peut alors résilier sans frais.</p>
      <h2>5. Paiement</h2><p>L'abonnement est payable d'avance, chaque mois ou chaque année, par virement ou par le moyen indiqué sur la facture. Une facture est émise à chaque échéance. En cas de retard, sont dues des pénalités au taux de trois fois le taux d'intérêt légal et l'indemnité forfaitaire de 40 € pour frais de recouvrement (articles L441-10 et D441-5 du Code de commerce). Après une relance restée sans réponse 15 jours, l'espace peut être mis en pause, sans perte de données.</p>
      <h2>6. Durée et résiliation</h2><p>L'abonnement se renouvelle tout seul pour la même période. Le Client peut le résilier à tout moment par e-mail ou depuis « Signaler un problème » ; la résiliation prend effet à la fin de la période déjà payée, sans remboursement de la période en cours. RecipeLog peut résilier en cas de manquement grave du Client (usage illégal, impayé persistant, atteinte à la sécurité) après une mise en demeure restée sans effet 15 jours, ou avec un préavis de 3 mois s'il arrête le service.</p>
      <h2>7. Fin de contrat et données</h2><p>Pendant 30 jours après la fin, le Client peut demander l'export de ses données (recettes, photos et factures). Ensuite son espace, sa base et ses fichiers sont supprimés ; les sauvegardes disparaissent au plus tard 6 mois après, au fil de leur rotation.</p>
      <h2>8. Ce que fournit RecipeLog</h2><p>L'accès au service, ses mises à jour, une sauvegarde chaque nuit (gardée 7 jours, 4 semaines et 6 mois), la surveillance et le support en français par « Signaler un problème » ou par e-mail, les jours ouvrés. RecipeLog vise une disponibilité de 99 % par mois hors maintenances annoncées ; c'est un objectif, pas une garantie. L'état du service est affiché sur status.${echapper(domaine)}. Les maintenances sont annoncées par bandeau et par e-mail au moins 24 heures avant, sauf urgence de sécurité.</p>
      <h2>9. Ce que fait le Client</h2><p>Il garde ses mots de passe secrets, ne donne l'accès qu'à ses équipes, n'utilise pas le service pour des contenus illégaux et ne cherche pas à en contourner la sécurité. Il reste responsable des recettes, prix et calculs qu'il saisit et de leur usage (étiquetage, allergènes, prix de vente) : RecipeLog est un outil d'aide, ses chiffres sont calculés à partir des données du Client.</p>
      <h2>10. Lecture par IA</h2><p>La lecture des factures et des mercuriales par IA propose des lignes à vérifier avant enregistrement ; elle peut se tromper. Avec l'IA fournie par RecipeLog, le fichier est envoyé à Anthropic (États-Unis) pour la seule lecture, dans la limite de lectures de l'offre.</p>
      <h2>11. Responsabilité</h2><p>Chaque partie répond des dommages directs qu'elle cause. La responsabilité de RecipeLog est limitée aux sommes payées par le Client pendant les 12 mois précédant le fait en cause, et ne couvre pas les dommages indirects (perte de chiffre d'affaires, de clientèle). Rien ici ne limite la responsabilité en cas de faute lourde ou intentionnelle.</p>
      <h2>12. Données personnelles</h2><p>Pour les données de ses équipes et de ses fournisseurs, le Client est responsable du traitement et RecipeLog son sous-traitant, selon l'<a href="/sous-traitance">accord de sous-traitance</a>, qui fait partie de ces conditions. La <a href="/confidentialite">politique de confidentialité</a> décrit le reste.</p>
      <h2>13. Référence</h2><p>Sauf refus écrit du Client, RecipeLog peut citer son nom comme référence commerciale.</p>
      <h2>14. Droit et litiges</h2><p>Ces conditions sont soumises au droit français. Avant tout procès, les parties cherchent une solution amiable pendant 30 jours. À défaut, le litige relève des tribunaux de ${ac(i.ville)}.</p>`,
    confidentialite: () => `
      <p class="petit">En vigueur au ${enVigueur}.</p>
      <h2>Qui est responsable</h2><p>${editeur}, ${ac(i.adresse)}. Pour toute question sur vos données : ${contact}.</p>
      <h2>Deux cas</h2><p>Cette page parle des données que RecipeLog traite pour lui-même (visiteurs du site, clients, support). Les données qu'un client met dans son espace (comptes de son équipe, fournisseurs, factures) sont traitées pour son compte : il en est responsable, et RecipeLog est son sous-traitant, selon l'<a href="/sous-traitance">accord de sous-traitance</a>.</p>
      <h2>Ce qui est gardé, pourquoi et combien de temps</h2>
      <table><thead><tr><th>Données</th><th>Pourquoi</th><th>Base légale</th><th>Durée</th></tr></thead><tbody>
      <tr><td>Formulaire « Nous écrire » : nom, e-mail, message</td><td>Vous répondre</td><td>Intérêt légitime</td><td>3 ans après le dernier échange</td></tr>
      <tr><td>Compte client : nom, e-mail, entreprise, adresse de facturation</td><td>Fournir le service, facturer</td><td>Contrat</td><td>Le temps du contrat, puis 10 ans pour les factures (obligation comptable)</td></tr>
      <tr><td>Connexions : adresse IP, date, appareil</td><td>Sécurité, preuve en cas d'incident</td><td>Obligation légale et intérêt légitime</td><td>12 mois</td></tr>
      <tr><td>Messages de support et pièces jointes</td><td>Traiter la demande</td><td>Contrat</td><td>3 ans après la clôture</td></tr>
      <tr><td>Nombre de lectures IA par mois</td><td>Appliquer la limite de l'offre</td><td>Contrat</td><td>24 mois</td></tr>
      <tr><td>E-mails d'annonce (maintenance, nouveautés)</td><td>Informer les clients</td><td>Contrat</td><td>Le temps du contrat</td></tr>
      </tbody></table>
      <h2>Qui reçoit ces données</h2><p>Seulement l'éditeur et les services qui l'aident :</p>${tableST}
      <p>Aucune donnée n'est vendue ni utilisée pour de la publicité. Les envois vers les États-Unis s'appuient sur le Data Privacy Framework ou sur les clauses contractuelles types de la Commission européenne.</p>
      <h2>Cookies</h2><p>Seulement les cookies nécessaires à la connexion et à la sécurité. Pas de publicité ni de suivi, donc pas de bandeau de consentement.</p>
      <h2>Sécurité</h2><p>Connexion chiffrée (HTTPS), un espace et une base séparés par client, mots de passe chiffrés, sauvegarde chaque nuit, accès d'administration réservé à l'éditeur.</p>
      <h2>Vos droits</h2><p>Vous pouvez demander à voir, corriger, effacer ou récupérer vos données, ou vous opposer à leur usage, en écrivant à ${contact}. Réponse sous un mois. Si la réponse ne vous convient pas, vous pouvez saisir la CNIL (<a href="https://www.cnil.fr" rel="noopener">cnil.fr</a>).</p>`,
    "sous-traitance": () => `
      <p class="petit">Annexe aux <a href="/cgv">conditions générales de vente</a>, en vigueur au ${enVigueur}. Elle s'applique dès que le Client utilise RecipeLog (article 28 du RGPD).</p>
      <h2>1. Rôles</h2><p>Le Client est responsable du traitement des données personnelles qu'il met dans son espace. ${editeur} (« RecipeLog ») les traite pour son compte, comme sous-traitant.</p>
      <h2>2. Ce qui est traité</h2><table><tbody>
      <tr><th>Objet</th><td>Héberger et faire fonctionner l'espace RecipeLog du Client</td></tr>
      <tr><th>Durée</th><td>Le temps de l'abonnement, plus 30 jours pour l'export, plus la rotation des sauvegardes (6 mois au plus)</td></tr>
      <tr><th>Personnes</th><td>Les utilisateurs de l'espace (équipes du Client) et les contacts de ses fournisseurs</td></tr>
      <tr><th>Données</th><td>Nom, e-mail, rôle, journal des connexions et des actions ; noms et coordonnées de fournisseurs ; factures et documents déposés</td></tr>
      <tr><th>Opérations</th><td>Stocker, afficher, sauvegarder, restaurer, exporter, supprimer ; lecture IA d'un fichier à la demande d'un utilisateur</td></tr>
      <tr><th>Données sensibles</th><td>Aucune attendue ; le Client s'engage à ne pas en mettre</td></tr></tbody></table>
      <h2>3. Engagements de RecipeLog</h2><ul>
      <li>Traiter les données seulement pour fournir le service et selon les instructions du Client (ces conditions et ses réglages).</li>
      <li>Les garder confidentielles : seul l'éditeur y a accès, et seulement si c'est nécessaire (support demandé, incident, restauration).</li>
      <li>Les protéger : HTTPS, un espace et une base séparés par client, mots de passe chiffrés, sauvegarde chaque nuit, mises à jour de sécurité.</li>
      <li>Aider le Client à répondre aux demandes des personnes (voir, corriger, effacer, exporter).</li>
      <li>Prévenir le Client dans les 48 heures après avoir découvert une fuite ou une perte de données, avec ce qu'il sait, pour que le Client puisse prévenir la CNIL dans les 72 heures si besoin.</li>
      <li>À la fin du contrat, rendre les données (export) puis les supprimer comme dit dans les CGV.</li>
      <li>Donner au Client les informations utiles pour vérifier ces engagements et répondre à ses questions par écrit.</li></ul>
      <h2>4. Sous-traitants de RecipeLog</h2><p>Le Client accepte les services suivants. RecipeLog le prévient par e-mail au moins 30 jours avant d'en ajouter un ; le Client peut alors s'y opposer et résilier sans frais.</p>${tableST}
      <p>Les envois hors de l'Union européenne s'appuient sur le Data Privacy Framework ou sur les clauses contractuelles types.</p>
      <h2>5. Engagements du Client</h2><p>Il a le droit d'utiliser les données qu'il met dans RecipeLog, informe ses équipes de leur usage et choisit lui-même qui a accès à son espace.</p>`,
  }[nom]();

  const liens = Object.entries(PAGES)
    .map(([k, t]) => (k === nom ? `<b>${echapper(t)}</b>` : `<a href="/${k}">${echapper(t)}</a>`))
    .join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${echapper(PAGES[nom])} · RecipeLog</title>${v.publie ? "" : `<meta name="robots" content="noindex">`}<link rel="stylesheet" href="${echapper(cssUrl)}"></head>
<body class="legal"><main class="page-legal"><p class="marque-statut"><a href="/">RecipeLog</a></p>
${v.publie ? "" : `<p class="bandeau-brouillon">Brouillon : ces informations ne sont pas encore définitives.</p>`}
<h1>${echapper(PAGES[nom])}</h1>${corps}
<nav class="liens-legal">${liens}</nav></main></body></html>`;
}
