// Panel admin RecipeLog : tout se passe dans cette page, qui parle à /api/… .
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const DOMAINE = document.body.dataset.domaine;
const e = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const dateFr = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
const heureFr = (iso) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

let CLIENTS = [];
let VITRINE = null;
let SANTE = null;
let SUPPORT = [];
let ANNONCES = null;
let IA = null;

// ------------------------------------------------------------ API
async function api(methode, chemin, corps) {
  const r = await fetch(`/api${chemin}`, {
    method: methode,
    headers: { "Content-Type": "application/json", "X-Panel": "1" },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  let j = {};
  try {
    j = await r.json();
  } catch {
    j = {};
  }
  if (r.status === 401) {
    location.reload();
    throw new Error("Session expirée.");
  }
  return { ok: r.ok && j.ok !== false, statut: r.status, ...j };
}

// ------------------------------------------------------------ aide « ? »
document.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-aide]");
  if (!b) return;
  const t = document.getElementById(b.dataset.aide);
  if (t) {
    t.classList.toggle("visible");
    b.setAttribute("aria-expanded", t.classList.contains("visible"));
  }
});
const aide = (id, texte) => `<button class="aide" type="button" data-aide="${id}" aria-label="Aide">?</button></label><p class="texte-aide" id="${id}">${texte}</p>`;

// ------------------------------------------------------------ fenêtre (croix seulement)
const voile = $("#voile");
let apresFermeture = null;
function ouvrir(titre, html, fermeture = null) {
  $("#fenetre-titre").textContent = titre;
  $("#fenetre-corps").innerHTML = html;
  apresFermeture = fermeture;
  voile.classList.add("ouvert");
  document.body.style.overflow = "hidden";
}
$("#croix").addEventListener("click", () => {
  voile.classList.remove("ouvert");
  document.body.style.overflow = "";
  const f = apresFermeture;
  apresFermeture = null;
  if (f) f();
});

// Action longue : attente, puis ce que l'outil a répondu.
async function executer(titre, requete) {
  ouvrir(titre, `<p class="attente"><span class="rond"></span>En cours… (une création ou une mise à jour prend 1 à 3 minutes)</p>`);
  $("#croix").disabled = true;
  let r;
  try {
    r = await requete();
  } catch (err) {
    r = { ok: false, sortie: String(err.message ?? err) };
  }
  $("#croix").disabled = false;
  const texte = r.sortie || r.message || (r.ok ? "Fait." : "Échec.");
  $("#fenetre-corps").innerHTML = `<p class="etiquette ${r.ok ? "ok" : "ko"}">${r.ok ? "Réussi" : "Échec"}</p><pre class="sortie">${e(texte)}</pre>`;
  apresFermeture = charger;
  return r;
}

// ------------------------------------------------------------ affichage
function etat(c) {
  if (c.suspendu) return `<span class="etiquette pause">En pause</span>`;
  const s = SANTE?.services?.[`client:${c.nom}`];
  if (s && !s.ok) return `<span class="etiquette ko" title="Ne répond plus depuis le ${e(heureFr(s.depuis))}">En panne</span>`;
  if (c.etat === "healthy") return `<span class="etiquette ok">En ligne</span>`;
  if (c.etat === "starting") return `<span class="etiquette prog">Démarre</span>`;
  return `<span class="etiquette ko">${e(c.etat === "unhealthy" ? "En panne" : "Arrêté")}</span>`;
}
// Jours entre aujourd'hui et la fin de l'essai (le jour de fin compte encore).
const joursRestants = (fin) => Math.round((Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86400000);
function places(c) {
  if (c.connexion !== "authentik") return "Cloudflare";
  if (!c.places) return "—";
  return `${c.places.membres} / ${c.places.max ?? "∞"}`;
}
function offre(c) {
  if (!c.essaiFin) return `Client depuis le ${dateFr(c.creeLe)}`;
  const j = joursRestants(c.essaiFin);
  return j >= 0 ? `<span class="etiquette acc">Essai : ${j} j</span>` : `<span class="etiquette pause">Essai fini</span>`;
}

// Dernière sauvegarde : plus de 36 h, ou test raté = à regarder.
const taille = (o) =>
  o >= 1073741824
    ? `${(o / 1073741824).toFixed(1).replace(".", ",")} Go`
    : o >= 1048576
      ? `${(o / 1048576).toFixed(1).replace(".", ",")} Mo`
      : `${o > 0 ? Math.max(1, Math.round(o / 1024)) : 0} Ko`;
const dateSauv = (id) => new Date(`${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}T${id.slice(9, 11)}:${id.slice(11, 13)}:${id.slice(13, 15)}Z`);
function sauvegarde(c) {
  const s = c.sauvegarde;
  if (!s?.derniere) return `<span class="etiquette pause">Aucune</span>`;
  const quand = dateSauv(s.derniere.id);
  const vieille = Date.now() - quand.getTime() > 36 * 3600 * 1000;
  const testKo = s.test && !s.test.ok;
  const texte = quand.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  if (testKo) return `<span class="etiquette ko" title="Le dernier test de restauration a échoué">Test raté</span>`;
  return vieille ? `<span class="etiquette pause" title="Plus de 36 heures">${e(texte)}</span>` : e(texte);
}

function afficher() {
  const n = CLIENTS.length;
  const enLigne = CLIENTS.filter((c) => !c.suspendu && c.etat === "healthy").length;
  const pause = CLIENTS.filter((c) => c.suspendu).length;
  const essais = CLIENTS.filter((c) => c.essaiFin && !c.suspendu).length;
  const comptes = CLIENTS.reduce((s, c) => s + (c.places?.membres ?? 0), 0);
  $("#chiffres").innerHTML = [
    [n, n > 1 ? "clients" : "client"],
    [enLigne, "en ligne"],
    [`${essais} · ${pause}`, "en essai · en pause"],
    [comptes, "comptes au total"],
  ]
    .map(([v, l]) => `<div class="chiffre"><b>${e(v)}</b><span>${e(l)}</span></div>`)
    .join("");

  const filtre = $("#recherche").value.trim().toLowerCase();
  const liste = CLIENTS.filter((c) => !filtre || c.nom.includes(filtre));
  if (!liste.length) {
    $("#clients").innerHTML = `<div class="vide">${n ? "Aucun client ne correspond." : "Pas encore de client. Crée le premier avec « Nouveau client »."}</div>`;
    return;
  }
  $("#clients").innerHTML = liste
    .map(
      (c) => `<article class="client" data-nom="${e(c.nom)}">
      <div class="nom"><b>${e(c.nom)}</b><a href="${e(c.adresse)}" target="_blank" rel="noopener">${e(c.adresse.replace("https://", ""))} ↗</a></div>
      <div class="info"><span class="lbl">État</span>${etat(c)}${dispo(`client:${c.nom}`)}</div>
      <div class="info"><span class="lbl">Places</span>${places(c)}</div>
      <div class="info"><span class="lbl">Version</span>${e(c.version ?? "—")} <small class="canal">${e(c.canal)}</small></div>
      <div class="info"><span class="lbl">Offre</span>${offre(c)}${c.mcp ? "" : ` <span class="etiquette ko" title="Accès MCP coupé">sans MCP</span>`}${c.demo ? ` <span class="etiquette prog">démo</span>` : ""}</div>
      <div class="info"><span class="lbl">Sauvegarde</span>${sauvegarde(c)}</div>
      <div class="actions">
        <a class="btn petit" href="${e(c.adresse)}" target="_blank" rel="noopener">Ouvrir</a>
        ${c.connexion === "authentik" ? `<button class="btn petit" data-act="equipe">Équipe</button>` : ""}
        <button class="btn petit" data-act="reglages">Réglages</button>
        <button class="btn petit" data-act="sauvegardes">Sauvegardes</button>
        <button class="btn petit" data-act="journaux">Journaux</button>
        ${c.demo ? `<button class="btn petit" data-act="demo">Démo</button>` : ""}
        ${c.suspendu ? `<button class="btn petit" data-act="reactiver">Réactiver</button>` : `<button class="btn petit" data-act="mettre-a-jour">Mettre à jour</button><button class="btn petit" data-act="suspendre">Pause</button>`}
        <button class="btn petit danger" data-act="supprimer">Supprimer</button>
      </div>
    </article>`,
    )
    .join("");
}

const NOMS_ACTIONS = {
  creer: "a créé",
  "mettre-a-jour": "a mis à jour",
  redemarrer: "a redémarré",
  suspendre: "a mis en pause",
  reactiver: "a réactivé",
  quota: "a changé les places de",
  options: "a changé les options de",
  essai: "a changé l'essai de",
  inviter: "a invité dans",
  renvoyer: "a renvoyé l'invitation dans",
  retirer: "a retiré de l'équipe de",
  supprimer: "a supprimé",
  "fin-essai": "a mis en pause (essai fini)",
  sauvegarder: "a sauvegardé",
  restaurer: "a restauré",
  "tester-sauvegarde": "a testé la sauvegarde de",
  telecharger: "a téléchargé une sauvegarde de",
  "sauvegardes-nuit": "a sauvegardé (nuit)",
  "test-sauvegardes": "a testé les sauvegardes (semaine)",
  "demo-figer": "a figé la démo",
  "demo-remettre": "a remis à zéro",
  "vitrine-maj": "a mis à jour la",
  "vitrine-bandeau": "a changé le bandeau de la",
  panne: "a vu une panne :",
  retour: "a vu le retour de",
  "support-repondre": "a répondu à une demande de",
  "support-fermer": "a fermé une demande de",
  "support-rouvrir": "a rouvert une demande de",
  "maintenance-prevue": "a programmé une maintenance :",
  "maintenance-finie": "a terminé la maintenance :",
  "maintenance-annulee": "a annulé la maintenance :",
  "ia-quota": "a changé les lectures par IA de",
  preavis: "a envoyé le préavis de maintenance :",
  bandeau: "a mis un bandeau :",
  message: "a écrit à",
};
let JOURNAL = [];
function afficherJournal() {
  if (!JOURNAL.length) {
    $("#journal").innerHTML = `<div class="ligne"><span>Aucune action pour l'instant.</span></div>`;
    return;
  }
  $("#journal").innerHTML = JOURNAL.slice(0, 40)
    .map((l, i) => {
      const d = l.details ?? {};
      const plus = d.texte !== undefined ? ` (${d.texte ? `« ${e(d.texte)} »` : "retiré"})` : d.sauvegarde ? ` (${e(dateSauv(d.sauvegarde).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }))})` : d.email ? ` (${e(d.email)})` : d.max !== undefined ? ` (${d.max || "pas de plafond"})` : d.jours !== undefined ? ` (${d.jours ? `${d.jours} j` : "fin"})` : d.mcp !== undefined ? ` (MCP ${d.mcp ? "permis" : "coupé"})` : "";
      return `<div class="ligne"><time>${heureFr(l.date)}</time><span class="qui">${e(l.qui)}</span>
        <span>${e(NOMS_ACTIONS[l.action] ?? l.action)} <b>${e(l.client)}</b>${plus} ${l.ok ? "" : `<span class="etiquette ko">échec</span>`}</span>
        <button type="button" data-journal="${i}">Détails</button></div>`;
    })
    .join("");
}
$("#journal").addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-journal]");
  if (!b) return;
  const l = JOURNAL[Number(b.dataset.journal)];
  ouvrir(`Détails : ${l.client}`, `<p class="sub">${e(heureFr(l.date))} · ${e(l.qui)}</p><pre class="sortie">${e(l.sortie || "(rien à afficher)")}</pre>`);
});

async function charger() {
  const [c, j, v, sa, su, an, ia] = await Promise.all([api("GET", "/clients"), api("GET", "/journal"), api("GET", "/vitrine"), api("GET", "/mesures"), api("GET", "/support"), api("GET", "/annonces"), api("GET", "/ia")]);
  IA = ia.usage ? ia : null;
  VITRINE = v.demandes ? v : null;
  afficherVitrine();
  SANTE = sa.machine ? sa : null;
  SUPPORT = su.demandes ?? null;
  afficherSupport();
  ANNONCES = an.maintenances ? an : null;
  if (c.clients) CLIENTS = c.clients.sort((a, b) => a.nom.localeCompare(b.nom));
  else $("#clients").innerHTML = `<div class="vide">Liste indisponible : ${e(c.message ?? "le moteur ne répond pas")}</div>`;
  JOURNAL = j.journal ?? [];
  if (c.clients) afficher();
  afficherAnnonces();
  afficherIA();
  afficherSante();
  afficherJournal();
}
$("#recherche").addEventListener("input", afficher);

// ------------------------------------------------------------ nouveau client
$("#nouveau").addEventListener("click", () => fenetreNouveau());
// pre : valeurs proposées (demande reçue par la vitrine) ; apres : appelé si la création réussit.
function fenetreNouveau(pre = {}, apres = null) {
  ouvrir(
    "Nouveau client",
    `<p class="sub">Crée son RecipeLog, sa base, son accès dans Authentik, puis envoie l'invitation au responsable.</p>
    <form id="f-nouveau" novalidate>
      <div class="champ"><label for="n-nom">Nom ${aide("a-nom", `Devient l'adresse du site : <b>nom.${e(DOMAINE)}</b>. Minuscules, chiffres et tirets, 2 à 32 caractères. Ne peut plus être changé ensuite.`)}
        <div class="suffixe"><input id="n-nom" type="text" required pattern="[a-z0-9][a-z0-9-]{0,30}[a-z0-9]" autocapitalize="none" spellcheck="false" placeholder="patisserie-martin" value="${e(pre.nom ?? "")}"><span>.${e(DOMAINE)}</span></div></div>
      <div class="champ"><label for="n-resp">Email du responsable ${aide("a-resp", "Il reçoit l'email « Choisis ton mot de passe » et devient administrateur de son RecipeLog à sa première connexion. Il invite ensuite lui-même son équipe. Laisser vide : tu inviteras plus tard (bouton Équipe).")}
        <input id="n-resp" type="email" autocapitalize="none" placeholder="chef@patisserie.fr" value="${e(pre.responsable ?? "")}"></div>
      <div class="champ"><label for="n-max">Nombre de comptes ${aide("a-max", "Combien de personnes de son équipe peuvent se connecter (le responsable compte). 0 = pas de limite. Toi, tu ne comptes jamais.")}
        <input id="n-max" type="number" min="0" max="10000" value="10"></div>
      <div class="champ"><label for="n-essai">Essai gratuit ${aide("a-essai", "Nombre de jours d'essai. À la fin, le site se met en pause tout seul (les données sont gardées) jusqu'à ce que tu le réactives. 0 = pas d'essai.")}
        <div class="suffixe"><input id="n-essai" type="number" min="0" max="3650" value="${e(pre.essai ?? 0)}"><span>jours</span></div></div>
      <div class="champ"><label for="n-canal">Version ${aide("a-canal", "Stable : la version des clients, testée. Bêta : suit ton site (main). Plateforme : suit le chantier en cours, pour tes essais.")}
        <select id="n-canal"><option value="stable">Stable (conseillé)</option><option value="beta">Bêta</option><option value="plateforme">Plateforme (essais)</option></select></div>
      <div class="champ"><label class="case"><input id="n-mcp" type="checkbox" checked> Accès MCP (Claude) ${aide("a-mcp", "Permet au client de brancher Claude sur son RecipeLog (Réglages → Accès MCP). Décoché : le menu disparaît chez lui et l'adresse MCP est fermée.")}</div>
      <p class="erreur" id="n-erreur"></p>
      <div class="pied"><button class="btn principal" type="submit">Créer le client</button></div>
    </form>`,
  );
  $("#f-nouveau").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const corps = {
      nom: $("#n-nom").value.trim().toLowerCase(),
      responsable: $("#n-resp").value.trim(),
      max: Number($("#n-max").value || 0),
      essai: Number($("#n-essai").value || 0),
      canal: $("#n-canal").value,
      mcp: $("#n-mcp").checked,
    };
    if (!/^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/.test(corps.nom)) return ($("#n-erreur").textContent = "Nom : 2 à 32 caractères, minuscules, chiffres et tirets.");
    if (CLIENTS.some((c) => c.nom === corps.nom)) return ($("#n-erreur").textContent = "Ce client existe déjà.");
    if (corps.responsable && !/^\S+@\S+\.\S+$/.test(corps.responsable)) return ($("#n-erreur").textContent = "Adresse du responsable invalide.");
    const r = await executer(`Création de ${corps.nom}`, () => api("POST", "/clients", corps));
    if (r.ok && apres) await apres();
  });
}

$("#tout-maj").addEventListener("click", () =>
  executer("Mise à jour de tous les clients", () => api("POST", "/tous/mettre-a-jour")),
);

// ------------------------------------------------------------ actions d'un client
$("#clients").addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-act]");
  if (!b) return;
  const c = CLIENTS.find((x) => x.nom === b.closest("[data-nom]").dataset.nom);
  const act = b.dataset.act;
  if (act === "mettre-a-jour") executer(`Mise à jour de ${c.nom}`, () => api("POST", `/clients/${c.nom}/mettre-a-jour`));
  if (act === "reactiver") executer(`Réactivation de ${c.nom}`, () => api("POST", `/clients/${c.nom}/reactiver`));
  if (act === "suspendre") fenetrePause(c);
  if (act === "supprimer") fenetreSuppression(c);
  if (act === "reglages") fenetreReglages(c);
  if (act === "equipe") fenetreEquipe(c);
  if (act === "sauvegardes") fenetreSauvegardes(c);
  if (act === "demo") fenetreDemo(c);
  if (act === "journaux") fenetreJournaux(c);
});

const ETIQUETTES = { auto: "Nuit", manuelle: "À la main", "avant-restauration": "Avant restauration" };
async function fenetreSauvegardes(c) {
  ouvrir(`Sauvegardes de ${c.nom}`, `<p class="attente"><span class="rond"></span>Chargement…</p>`, charger);
  const r = await api("GET", `/clients/${c.nom}/sauvegardes`);
  if (!r.sauvegardes) {
    $("#fenetre-corps").innerHTML = `<p class="erreur">${e(r.message ?? "Sauvegardes indisponibles.")}</p>`;
    return;
  }
  const t = r.test;
  const test = t
    ? `<p class="${t.ok ? "sub" : "erreur"}">Dernier test de restauration, le ${e(heureFr(t.date))} : ${t.ok ? `<span class="etiquette ok">réussi</span> (${e(t.recettes)} recettes relues)` : `<span class="etiquette ko">raté</span> : ${e(t.raison)}`}</p>`
    : `<p class="sub">Pas encore de test de restauration (il se fait tout seul chaque dimanche matin).</p>`;
  const lignes = r.sauvegardes.length
    ? r.sauvegardes
        .map(
          (s) => `<div class="membre" data-id="${e(s.id)}"><div><b>${e(heureFr(dateSauv(s.id).toISOString()))}</b><small>${e(ETIQUETTES[s.etiquette] ?? s.etiquette)} · base ${e(taille(s.base))} · fichiers ${e(taille(s.fichiers))}${s.version ? ` · ${e(s.version)}` : ""}</small></div>
          <a class="btn petit" href="/telecharger/${e(c.nom)}/${e(s.id)}" download>Télécharger</a><button class="btn petit danger" type="button" data-s="restaurer">Restaurer</button></div>`,
        )
        .join("")
    : `<p class="sub">Aucune sauvegarde pour l'instant. La première se fera cette nuit, ou maintenant avec le bouton ci-dessous.</p>`;
  $("#fenetre-corps").innerHTML = `<p class="sub">Chaque nuit vers 3 h, la base, les photos et les factures de ${e(c.nom)} sont sauvegardées sur la machine. On garde les 7 derniers jours, puis une par semaine pendant 4 semaines et une par mois pendant 6 mois. ${aide("sv-a", "Ces sauvegardes sont sur le disque de la VM. La copie hors de la machine, c'est ta sauvegarde Proxmox Backup Server vers OVH : elle emporte toute la VM, sauvegardes comprises.")}</p>
    ${test}
    <div class="barre serree"><button class="btn principal" type="button" id="sv-maintenant">Sauvegarder maintenant</button><button class="btn" type="button" id="sv-tester">Tester la dernière</button>
    <button class="aide" type="button" data-aide="sv-a2" aria-label="Aide">?</button></div>
    <p class="texte-aide" id="sv-a2"><b>Tester</b> recharge la dernière sauvegarde dans une base à part, compte ses recettes et vérifie les fichiers, sans toucher au site du client. <b>Télécharger</b> donne une archive avec la base et les fichiers, sans aucun mot de passe : à garder ou à remettre au client.</p>
    <div class="membres">${lignes}</div>`;
  $("#sv-maintenant").addEventListener("click", () => executer(`Sauvegarde de ${c.nom}`, () => api("POST", `/clients/${c.nom}/sauvegarder`)).then(() => (apresFermeture = () => fenetreSauvegardes(c))));
  $("#sv-tester").addEventListener("click", () => executer(`Test de la sauvegarde de ${c.nom}`, () => api("POST", `/clients/${c.nom}/tester-sauvegarde`)).then(() => (apresFermeture = () => fenetreSauvegardes(c))));
  $("#fenetre-corps").querySelectorAll("[data-s=restaurer]").forEach((b) =>
    b.addEventListener("click", () => fenetreRestaurer(c, b.closest("[data-id]").dataset.id)),
  );
}

function fenetreRestaurer(c, id) {
  const quand = heureFr(dateSauv(id).toISOString());
  ouvrir(
    `Restaurer ${c.nom} ?`,
    `<p class="sub">Les recettes, comptes, photos et factures de ${e(c.nom)} reviennent à leur état du <b>${e(quand)}</b>. Tout ce qui a été fait depuis disparaît du site. Le site est coupé environ une minute.</p>
    <p class="texte-aide visible">Juste avant, l'état actuel est sauvegardé (étiquette « Avant restauration ») : tu peux revenir en arrière avec cette sauvegarde-là.</p>
    <div class="champ"><label for="rs-nom">Tape <b>${e(c.nom)}</b> pour confirmer</label><input id="rs-nom" type="text" autocapitalize="none" spellcheck="false"></div>
    <p class="erreur" id="rs-erreur"></p>
    <div class="pied"><button class="btn danger" id="ok-restaurer" type="button">Restaurer</button></div>`,
  );
  $("#ok-restaurer").addEventListener("click", () => {
    if ($("#rs-nom").value.trim() !== c.nom) return ($("#rs-erreur").textContent = "Le nom ne correspond pas.");
    executer(`Restauration de ${c.nom}`, () => api("POST", `/clients/${c.nom}/restaurer`, { sauvegarde: id, confirmation: c.nom }));
  });
}

function fenetrePause(c) {
  ouvrir(
    `Mettre ${c.nom} en pause ?`,
    `<p class="sub">Son site affiche « Ce RecipeLog est en pause ». Rien n'est effacé : recettes, comptes et fichiers restent là, et « Réactiver » le remet en ligne en une minute.</p>
    <div class="pied"><button class="btn principal" id="ok-pause" type="button">Mettre en pause</button></div>`,
  );
  $("#ok-pause").addEventListener("click", () => executer(`Pause de ${c.nom}`, () => api("POST", `/clients/${c.nom}/suspendre`)));
}

function fenetreSuppression(c) {
  ouvrir(
    `Supprimer ${c.nom} ?`,
    `<p class="sub">Le site s'arrête, sa base et ses fichiers partent dans une archive sur la machine (<code>/srv/recipelog/archives</code>), son accès Authentik est retiré et les comptes qui ne servent plus ailleurs sont désactivés.</p>
    <div class="champ"><label for="s-nom">Tape <b>${e(c.nom)}</b> pour confirmer</label><input id="s-nom" type="text" autocapitalize="none" spellcheck="false"></div>
    <p class="erreur" id="s-erreur"></p>
    <div class="pied"><button class="btn danger" id="ok-supprimer" type="button">Supprimer définitivement</button></div>`,
  );
  $("#ok-supprimer").addEventListener("click", () => {
    if ($("#s-nom").value.trim() !== c.nom) return ($("#s-erreur").textContent = "Le nom ne correspond pas.");
    executer(`Suppression de ${c.nom}`, () => api("POST", `/clients/${c.nom}/supprimer`, { confirmation: c.nom }));
  });
}

function fenetreReglages(c) {
  const max = c.places?.max ?? 0;
  const jours = c.essaiFin ? Math.max(joursRestants(c.essaiFin), 0) : 0;
  ouvrir(
    `Réglages de ${c.nom}`,
    `<form id="f-reglages" novalidate>
      ${c.connexion === "authentik" ? `<div class="champ"><label for="r-max">Nombre de comptes ${aide("r-a-max", "Combien de personnes de son équipe peuvent se connecter. 0 = pas de limite. Baisser sous le nombre actuel ne retire personne : il ne pourra juste plus inviter.")}
        <input id="r-max" type="number" min="0" max="10000" value="${max}"></div>` : ""}
      <div class="champ"><label for="r-essai">Essai : jours restants ${aide("r-a-essai", "Change la fin de l'essai à partir d'aujourd'hui. 0 = ce n'est plus un essai (client normal, plus de pause automatique). Un client mis en pause par la fin d'essai se rouvre avec « Réactiver ».")}
        <div class="suffixe"><input id="r-essai" type="number" min="0" max="3650" value="${jours}"><span>${c.essaiFin ? `jusqu'au ${e(dateFr(c.essaiFin))}` : "pas d'essai"}</span></div></div>
      <div class="champ"><label class="case"><input id="r-mcp" type="checkbox" ${c.mcp ? "checked" : ""}> Accès MCP (Claude) ${aide("r-a-mcp", "Permet au client de brancher Claude sur son RecipeLog. Changer cette case redémarre son site (environ une minute).")}</div>
      <p class="erreur" id="r-erreur"></p>
      <div class="pied"><button class="btn principal" type="submit">Enregistrer</button></div>
    </form>`,
  );
  $("#f-reglages").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const etapes = [];
    const nMax = $("#r-max") ? Number($("#r-max").value || 0) : max;
    const nJours = Number($("#r-essai").value || 0);
    const nMcp = $("#r-mcp").checked;
    if ($("#r-max") && nMax !== max) etapes.push(["Places", () => api("POST", `/clients/${c.nom}/quota`, { max: nMax })]);
    if (nJours !== jours) etapes.push(["Essai", () => api("POST", `/clients/${c.nom}/essai`, { jours: nJours })]);
    if (nMcp !== c.mcp) etapes.push(["MCP", () => api("POST", `/clients/${c.nom}/options`, { mcp: nMcp })]);
    if (!etapes.length) return ($("#r-erreur").textContent = "Rien n'a changé.");
    await executer(`Réglages de ${c.nom}`, async () => {
      const sorties = [];
      let ok = true;
      for (const [nom, f] of etapes) {
        const r = await f();
        ok = ok && r.ok;
        sorties.push(`${nom} : ${r.sortie || r.message || (r.ok ? "fait" : "échec")}`);
      }
      return { ok, sortie: sorties.join("\n") };
    });
  });
}

async function fenetreEquipe(c) {
  ouvrir(`Équipe de ${c.nom}`, `<p class="attente"><span class="rond"></span>Chargement…</p>`, charger);
  const r = await api("GET", `/clients/${c.nom}/equipe`);
  if (!r.membres) {
    $("#fenetre-corps").innerHTML = `<p class="erreur">${e(r.message ?? "Équipe indisponible.")}</p>`;
    return;
  }
  const lignes = r.membres.length
    ? r.membres
        .map(
          (m) => `<div class="membre" data-email="${e(m.email)}"><div><b>${e(m.nom || m.email)}</b><small>${m.nom && m.nom !== m.email ? `${e(m.email)} · ` : ""}${m.derniereConnexion ? `vu le ${e(dateFr(m.derniereConnexion))}` : "jamais connecté"}${m.actif ? "" : " · désactivé"}</small></div>
          <button class="btn petit" type="button" data-m="renvoyer">Renvoyer</button><button class="btn petit danger" type="button" data-m="retirer">Retirer</button></div>`,
        )
        .join("")
    : `<p class="sub">Personne pour l'instant.</p>`;
  $("#fenetre-corps").innerHTML = `<p class="sub">${r.membres.length} / ${r.max ?? "∞"} places. Le responsable gère aussi son équipe lui-même, dans Réglages → Comptes.</p>
    <div class="membres">${lignes}</div>
    <form id="f-inviter" novalidate><div class="champ"><label for="i-email">Inviter quelqu'un ${aide("i-a", "Crée son compte et lui envoie l'email « Choisis ton mot de passe ». À sa première connexion, il demande l'accès et le responsable l'accepte dans Réglages → Comptes. Pour lui donner un rôle tout de suite, mieux vaut que le responsable l'invite depuis son RecipeLog.")}
      <div class="suffixe"><input id="i-email" type="email" autocapitalize="none" placeholder="prenom@exemple.fr"><button class="btn principal" type="submit">Inviter</button></div></div>
      <p class="erreur" id="i-erreur"></p></form>`;
  $("#f-inviter").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const email = $("#i-email").value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return ($("#i-erreur").textContent = "Adresse invalide.");
    $("#i-erreur").textContent = "Envoi…";
    const x = await api("POST", `/clients/${c.nom}/inviter`, { email });
    if (!x.ok) return ($("#i-erreur").textContent = (x.sortie || x.message || "Échec").replace(/^❌\s*/, ""));
    fenetreEquipe(c);
  });
  $("#fenetre-corps").querySelectorAll("[data-m]").forEach((b) =>
    b.addEventListener("click", async () => {
      const email = b.closest("[data-email]").dataset.email;
      if (b.dataset.m === "retirer" && b.dataset.confirme !== "1") {
        b.dataset.confirme = "1";
        b.textContent = "Confirmer";
        return;
      }
      b.disabled = true;
      const x = await api("POST", `/clients/${c.nom}/${b.dataset.m}`, { email });
      if (b.dataset.m === "renvoyer") {
        b.textContent = x.ok ? "Envoyé ✓" : "Échec";
      } else {
        fenetreEquipe(c);
      }
    }),
  );
}

charger();
setInterval(() => {
  if (!voile.classList.contains("ouvert")) charger();
}, 30000);

// ------------------------------------------------------------ démo
function fenetreDemo(c) {
  ouvrir(
    `Démo ${c.nom}`,
    `<p class="sub">Les visiteurs peuvent tout essayer sur la démo ; chaque nuit vers 4 h 30, elle revient toute seule à son état de référence.</p>
    <div class="champ"><label>Remettre à zéro maintenant ${aide("d-a1", "Recharge l'état de référence tout de suite : tout ce que les visiteurs ont changé depuis disparaît. Le site est coupé une minute.")}</div>
    <div class="pied pied-gauche"><button class="btn" id="d-remettre" type="button">Remettre à zéro</button></div>
    <div class="champ"><label>Garder l'état actuel comme référence ${aide("d-a2", "Prépare d'abord la démo comme tu veux la montrer (recettes, fournisseurs, photos), puis clique ici : c'est cet état qui reviendra chaque nuit.")}</div>
    <div class="pied pied-gauche"><button class="btn principal" id="d-figer" type="button">Figer comme référence</button></div>`,
  );
  $("#d-remettre").addEventListener("click", () => executer(`Remise à zéro de ${c.nom}`, () => api("POST", `/clients/${c.nom}/demo-remettre`)));
  $("#d-figer").addEventListener("click", () => executer(`Référence de ${c.nom}`, () => api("POST", `/clients/${c.nom}/demo-figer`)));
}

// ------------------------------------------------------------ vitrine
const TYPES_DEMANDE = { demo: "Démonstration", devis: "Devis", question: "Question" };
// Nom de client proposé à partir de l'établissement (ou du nom) : « Pâtisserie Martin » → patisserie-martin.
const nomPropose = (d) =>
  (d.etab || d.nom || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/, "");
let voirTraitees = false;

function afficherVitrine() {
  const zone = $("#vitrine");
  if (!VITRINE) {
    zone.innerHTML = `<div class="vide">Vitrine indisponible.</div>`;
    return;
  }
  const aFaire = VITRINE.demandes.filter((d) => !d.traitee);
  const faites = VITRINE.demandes.filter((d) => d.traitee);
  const liste = (voirTraitees ? VITRINE.demandes : aFaire)
    .map(
      (d) => `<article class="demande${d.traitee ? " traitee" : ""}" data-cle="${e(d.cle)}">
      <div><span class="etiquette ${d.type === "question" ? "acc" : "prog"}">${e(TYPES_DEMANDE[d.type] ?? d.type)}</span> <b>${e(d.nom)}</b>${d.etab ? ` · ${e(d.etab)}` : ""}
        <small>${e(d.date.slice(8, 10))}/${e(d.date.slice(5, 7))} ${e(d.date.slice(11, 16))} · <a href="mailto:${e(d.email)}">${e(d.email)}</a>${d.tel ? ` · ${e(d.tel)}` : ""}</small>
        ${d.msg ? `<p>${e(d.msg.length > 400 ? `${d.msg.slice(0, 400)}…` : d.msg)}</p>` : ""}</div>
      ${d.traitee ? `<span class="etiquette ok">Traitée</span>` : `<div class="actions"><button class="btn petit principal" type="button" data-v="creer">Créer le client</button><button class="btn petit" type="button" data-v="traitee">Traitée</button></div>`}
    </article>`,
    )
    .join("");
  zone.innerHTML = `<div class="carte-vitrine">
      <div class="ligne-vitrine"><div><b>${e(DOMAINE)}</b><small>${VITRINE.version ? `Version ${e(VITRINE.version)}` : "Pas encore téléchargée"}</small></div>
        <a class="btn petit" href="https://${e(DOMAINE)}" target="_blank" rel="noopener">Ouvrir</a>
        <button class="btn petit" type="button" id="v-maj">Mettre à jour la vitrine</button>
        <button class="aide" type="button" data-aide="v-a-maj" aria-label="Aide">?</button></div>
      <p class="texte-aide" id="v-a-maj">Télécharge la dernière version du site vitrine (branche site-vitrine) et la met en ligne en quelques secondes. Tes réglages (adresse de la démo, bandeau) sont gardés.</p>
      <form id="f-bandeau" class="champ" novalidate><label for="v-bandeau">Bandeau en haut du site ${aide("v-a-band", "Une phrase affichée tout en haut de la vitrine, par exemple « Offre de lancement : 1 mois d'essai gratuit ». Laisser vide puis Enregistrer pour l'enlever. 300 caractères au plus.")}
        <div class="suffixe"><input id="v-bandeau" type="text" maxlength="300" value="${e(VITRINE.bandeau)}" placeholder="Aucun bandeau"><button class="btn" type="submit">Enregistrer</button></div>
        <p class="erreur" id="v-erreur"></p></form>
    </div>
    <h3 class="titre-demandes">Demandes reçues <span class="etiquette ${aFaire.length ? "prog" : "ok"}">${aFaire.length} à traiter</span>
      ${faites.length ? `<button class="lien" type="button" id="v-toutes">${voirTraitees ? "Cacher les traitées" : `Voir aussi les ${faites.length} traitées`}</button>` : ""}
      <button class="aide" type="button" data-aide="v-a-dem" aria-label="Aide">?</button></h3>
    <p class="texte-aide" id="v-a-dem">Les messages du formulaire « Nous écrire » de la vitrine (ils arrivent aussi par email). « Créer le client » ouvre la création avec son adresse en responsable et 14 jours d'essai : tu vérifies, puis tu valides. La demande passe alors en « Traitée ».</p>
    <div class="demandes">${liste || `<div class="vide">${VITRINE.demandes.length ? "Toutes les demandes sont traitées." : "Aucune demande pour l'instant."}</div>`}</div>`;
  $("#v-maj").addEventListener("click", () => executer("Mise à jour de la vitrine", () => api("POST", "/vitrine/maj")));
  $("#v-toutes")?.addEventListener("click", () => {
    voirTraitees = !voirTraitees;
    afficherVitrine();
  });
  $("#f-bandeau").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const texte = $("#v-bandeau").value.trim();
    $("#v-erreur").textContent = "Enregistrement…";
    const r = await api("POST", "/vitrine/bandeau", { texte });
    $("#v-erreur").textContent = r.ok ? "" : (r.message || r.sortie || "Échec").replace(/^❌\s*/, "");
    if (r.ok) charger();
  });
  zone.querySelectorAll("[data-v]").forEach((b) =>
    b.addEventListener("click", async () => {
      const cle = b.closest("[data-cle]").dataset.cle;
      const d = VITRINE.demandes.find((x) => x.cle === cle);
      const traiter = () => api("POST", "/vitrine/traitee", { cle });
      if (b.dataset.v === "traitee") {
        b.disabled = true;
        await traiter();
        charger();
      } else {
        fenetreNouveau({ nom: nomPropose(d), responsable: d.email, essai: 14 }, traiter);
      }
    }),
  );
}

// ------------------------------------------------------------ santé (lot 5)
const pct = (v) => `${v.toFixed(v >= 99.95 || v < 10 ? 1 : 2).replace(".", ",")} %`;
// Disponibilité sur 30 jours (petite ligne sous l'état). Aucune panne notée = 100 %.
function dispo(cible) {
  if (!SANTE) return "";
  const v = SANTE.disponibilite?.[cible] ?? 100;
  return `<small class="dispo${v < 99 ? " bas" : ""}" title="Temps en ligne sur les 30 derniers jours">${e(pct(v))} sur 30 j</small>`;
}
const jauge = (part, texte) => {
  const p = Math.max(0, Math.min(100, Math.round(part)));
  return `<div class="jauge ${p >= 90 ? "ko" : p >= 75 ? "pause" : "ok"}"><span class="j${Math.round(p / 5) * 5}"></span></div><small>${texte}</small>`;
};
const depuisFr = (iso) => {
  if (!iso) return "jamais";
  const j = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  return j <= 0 ? "aujourd'hui" : j === 1 ? "hier" : `il y a ${j} j`;
};

function afficherSante() {
  const zone = $("#sante");
  if (!SANTE) {
    zone.innerHTML = `<div class="vide">Mesures indisponibles (le moteur ne répond pas).</div>`;
    return;
  }
  const m = SANTE.machine;
  const memUtil = m.memoire.total - m.memoire.libre;
  const charge = (m.charge[0] / m.coeurs) * 100;
  const services = [
    ["service:connexion", "Connexion"],
    ["service:passerelle", "Passerelle"],
    ["service:vitrine", "Vitrine"],
  ]
    .map(([id, nom]) => {
      const s = SANTE.services[id];
      const ok = !s || s.ok;
      return `<span class="etiquette ${ok ? "ok" : "ko"}" title="${ok ? "Répond" : `Ne répond plus depuis le ${e(heureFr(s.depuis))}`}">${e(nom)}</span>`;
    })
    .join(" ");
  const canaux = Object.entries({ telegram: "Telegram", discord: "Discord", email: "Email" })
    .map(([k, n]) => `<span class="etiquette ${SANTE.alertes[k] ? "ok" : "pause"}">${n} ${SANTE.alertes[k] ? "réglé" : "pas réglé"}</span>`)
    .join(" ");
  const lignes = CLIENTS.map((c) => {
    const s = SANTE.clients[c.nom] ?? {};
    const u = s.usage;
    return `<tr><th scope="row">${e(c.nom)}${dispo(`client:${c.nom}`)}</th>
      <td data-l="Processeur">${s.cpu == null ? "—" : `${e(s.cpu.toFixed(1).replace(".", ","))} %`}</td>
      <td data-l="Mémoire">${s.memoire == null ? "—" : e(taille(s.memoire))}</td>
      <td data-l="Base">${u ? e(taille(u.base)) : "—"}</td>
      <td data-l="Fichiers">${s.fichiers == null ? "—" : e(taille(s.fichiers))}</td>
      <td data-l="Sauvegardes">${s.sauvegardes == null ? "—" : e(taille(s.sauvegardes))}</td>
      <td data-l="Recettes">${u ? `${e(u.recettes)} <small>${e(u.recettes30)} modif. 30 j</small>` : "—"}</td>
      <td data-l="Comptes">${u ? e(u.comptes) : "—"}</td>
      <td data-l="Dernière activité">${u ? e(depuisFr(u.derniereActivite)) : "—"}</td></tr>`;
  }).join("");
  zone.innerHTML = `<div class="cartes-sante">
      <div class="carte-sante"><span class="lbl">Processeur ${aide("sa-cpu", "Charge moyenne sur la dernière minute, rapportée au nombre de cœurs de la VM. Au-dessus de 100 %, des tâches attendent leur tour : la machine est trop petite ou un client tourne en boucle.")}</span>
        ${jauge(charge, `${e(m.charge[0].toFixed(2).replace(".", ","))} pour ${e(m.coeurs)} cœurs`)}</div>
      <div class="carte-sante"><span class="lbl">Mémoire ${aide("sa-mem", "Mémoire vraiment utilisée (le cache que Linux rend tout seul n'est pas compté). Chaque client prend environ 150 à 250 Mo.")}</span>
        ${jauge((memUtil / m.memoire.total) * 100, `${e(taille(memUtil))} sur ${e(taille(m.memoire.total))}`)}</div>
      <div class="carte-sante"><span class="lbl">Disque ${aide("sa-disque", "Place prise sur le disque des données (/srv/recipelog : bases, photos, factures, sauvegardes). Une alerte part à 90 %.")}</span>
        ${m.disque ? jauge(m.disque.pourcent, `${e(taille(m.disque.libre))} libres sur ${e(taille(m.disque.total))}`) : "<small>—</small>"}</div>
      <div class="carte-sante"><span class="lbl">Services ${aide("sa-serv", "Vérifiés chaque minute, comme les sites des clients. Rouge = ne répond plus depuis au moins 2 minutes ; tu as reçu une alerte.")}</span>
        <div class="etiquettes">${services}</div><small>${m.demarre ? `VM démarrée ${e(depuisFr(m.demarre))}` : ""}</small></div>
    </div>
    <div class="carte-vitrine alertes"><div class="ligne-vitrine"><div><b>Alertes</b><small>Chaque minute, chaque site est vérifié. S'il ne répond plus 2 minutes de suite, tu es prévenu, puis encore quand il revient. Aussi : disque presque plein, nouvelle demande de support.</small></div>
      <button class="btn petit" type="button" id="sa-essai">Tester les alertes</button>
      <button class="aide" type="button" data-aide="sa-a-al" aria-label="Aide">?</button></div>
      <p class="texte-aide" id="sa-a-al">L'email part vers les adresses super-admin (ADMIN_EMAILS). Pour recevoir aussi les alertes sur ton téléphone par Telegram ou Discord, suis l'étape F de A-FAIRE.md (2 minutes). « Tester » envoie un message d'essai sur tous les canaux réglés.</p>
      <div class="etiquettes">${canaux}</div><p class="erreur" id="sa-erreur"></p></div>
    <div class="tableau-sante"><table><thead><tr><th>Client</th><th>Processeur</th><th>Mémoire</th><th>Base</th><th>Fichiers</th><th>Sauvegardes</th><th>Recettes</th><th>Comptes</th><th>Dernière activité</th></tr></thead>
      <tbody>${lignes || `<tr><td colspan="9">Pas encore de client.</td></tr>`}</tbody></table></div>
    <p class="texte-aide visible discret">Mesuré le ${e(heureFr(SANTE.date))} (rafraîchi chaque minute). Comptes = comptes actifs dans son RecipeLog ; dernière activité = dernière visite d'un de ses comptes.</p>`;
  $("#sa-essai").addEventListener("click", async (ev) => {
    ev.target.disabled = true;
    $("#sa-erreur").textContent = "Envoi…";
    const r = await api("POST", "/alertes/essai");
    ev.target.disabled = false;
    $("#sa-erreur").textContent = r.ok ? "" : r.sortie || r.message || "Échec.";
    if (r.ok) ev.target.textContent = "Envoyée ✓";
  });
}

// ------------------------------------------------------------ journaux d'un client
function fenetreJournaux(c) {
  let suivre = true;
  let jeton = {};
  const moi = jeton;
  ouvrir(
    `Journaux de ${c.nom}`,
    `<p class="sub">Les 300 dernières lignes écrites par son RecipeLog (démarrage, erreurs, connexions). Rafraîchi toutes les 3 secondes. ${aide("jx-a", "Utile quand un client signale un problème : cherche les lignes « Error » au moment où il a eu le souci. Les heures sont en UTC (une heure de moins qu'en France l'hiver, deux l'été).")}</p>
    <div class="barre serree"><label class="case"><input type="checkbox" id="jx-suivre" checked> Suivre en direct</label></div>
    <pre class="sortie journaux" id="jx-sortie">Chargement…</pre>`,
    () => (jeton = null),
  );
  $("#jx-suivre").addEventListener("change", (ev) => (suivre = ev.target.checked));
  const tour = async () => {
    if (jeton !== moi) return;
    if (suivre) {
      const r = await api("GET", `/clients/${c.nom}/journaux`).catch(() => ({ lignes: "Le moteur ne répond pas." }));
      if (jeton !== moi) return;
      const pre = $("#jx-sortie");
      if (!pre) return;
      const enBas = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 30;
      pre.textContent = (r.lignes || "(aucune ligne)").replace(/^(\d{4}-\d\d-\d\d)T(\d\d:\d\d:\d\d)\.\d+Z /gm, "$1 $2 ");
      if (enBas) pre.scrollTop = pre.scrollHeight;
    }
    setTimeout(tour, 3000);
  };
  tour();
}

// ------------------------------------------------------------ support (lot 5)
const TYPES_TICKET = { bug: ["Problème", "ko"], question: ["Question", "acc"], idee: ["Idée", "prog"] };
const STATUTS = { ouvert: ["À répondre", "prog"], repondu: ["Répondu", "ok"], ferme: ["Fermé", "pause"] };
let voirFermes = false;

function afficherSupport() {
  const zone = $("#support");
  if (!SUPPORT) {
    zone.innerHTML = `<div class="vide">Support indisponible.</div>`;
    return;
  }
  const ouverts = SUPPORT.filter((t) => t.statut !== "ferme");
  const aRepondre = SUPPORT.filter((t) => t.statut === "ouvert").length;
  const liste = (voirFermes ? SUPPORT : ouverts)
    .map((t) => {
      const [ty, cl] = TYPES_TICKET[t.type] ?? [t.type, "acc"];
      const [st, sc] = STATUTS[t.statut] ?? [t.statut, "acc"];
      const dernier = t.messages.at(-1);
      return `<article class="demande ticket${t.statut === "ferme" ? " traitee" : ""}${t.luSupport ? "" : " non-lu"}" data-ticket="${e(t.client)}/${e(t.id)}">
        <div><span class="etiquette ${cl}">${e(ty)}</span> <b>${e(t.client)}</b> · ${e(t.email)}
          <small>${e(heureFr(t.maj))} · ${t.messages.length} message${t.messages.length > 1 ? "s" : ""}${t.luSupport ? "" : " · <b>nouveau</b>"}</small>
          <p>${dernier.de === "support" ? "<i>Toi :</i> " : ""}${e(dernier.texte.length > 240 ? `${dernier.texte.slice(0, 240)}…` : dernier.texte)}</p></div>
        <div class="actions"><span class="etiquette ${sc}">${e(st)}</span><button class="btn petit principal" type="button">Ouvrir</button></div>
      </article>`;
    })
    .join("");
  const fermes = SUPPORT.length - ouverts.length;
  zone.innerHTML = `<h3 class="titre-demandes">Demandes des clients <span class="etiquette ${aRepondre ? "prog" : "ok"}">${aRepondre} à répondre</span>
      ${fermes ? `<button class="lien" type="button" id="su-fermes">${voirFermes ? "Cacher les fermées" : `Voir aussi les ${fermes} fermées`}</button>` : ""}
      <button class="aide" type="button" data-aide="su-a" aria-label="Aide">?</button></h3>
    <p class="texte-aide" id="su-a">Envoyées par les équipes de tes clients depuis leur RecipeLog (Réglages → Signaler un problème), avec la page où ils étaient, leur navigateur et leur version. Tu es prévenu à chaque nouvelle demande. Ta réponse part par email et s'affiche dans leur RecipeLog ; ils peuvent y répondre à leur tour.</p>
    <div class="demandes">${liste || `<div class="vide">${SUPPORT.length ? "Aucune demande ouverte." : "Aucune demande pour l'instant."}</div>`}</div>`;
  $("#su-fermes")?.addEventListener("click", () => {
    voirFermes = !voirFermes;
    afficherSupport();
  });
  zone.querySelectorAll("[data-ticket]").forEach((a) =>
    a.querySelector("button").addEventListener("click", () => {
      const [client, id] = a.dataset.ticket.split("/");
      fenetreTicket(client, id);
    }),
  );
}

async function actionSupport(t, act, corps = {}) {
  const r = await api("POST", `/support/${t.client}/${t.id}/${act}`, corps);
  if (r.demande) SUPPORT = SUPPORT.map((x) => (x.id === t.id && x.client === t.client ? r.demande : x));
  return r;
}

async function fenetreTicket(client, id) {
  let t = SUPPORT.find((x) => x.client === client && x.id === id);
  if (!t) return;
  if (!t.luSupport) {
    await actionSupport(t, "lu");
    t = SUPPORT.find((x) => x.client === client && x.id === id);
  }
  const [ty] = TYPES_TICKET[t.type] ?? [t.type];
  const [st, sc] = STATUTS[t.statut] ?? [t.statut, "acc"];
  const ctx = t.contexte ?? {};
  const fils = t.messages
    .map((m) => `<div class="bulle ${m.de === "support" ? "moi" : ""}"><small>${m.de === "support" ? "Toi" : e(m.qui)} · ${e(heureFr(m.date))}</small><p>${e(m.texte)}</p></div>`)
    .join("");
  ouvrir(
    `${ty} de ${t.client}`,
    `<p class="sub"><span class="etiquette ${sc}">${e(st)}</span> ${e(t.email)} · ouverte le ${e(heureFr(t.date))}</p>
    <details class="contexte"><summary>Où et avec quoi ${aide("tk-a-ctx", "Envoyé tout seul avec la demande : la page où était la personne, son navigateur, la taille de son écran, la version de RecipeLog et son rôle. Pratique pour reproduire le problème.")}</summary>
      <dl><dt>Page</dt><dd>${ctx.page ? `<a href="https://${e(t.client)}.${e(DOMAINE)}${e(ctx.page)}" target="_blank" rel="noopener">${e(ctx.page)}</a>` : "—"}</dd><dt>Version</dt><dd>${e(ctx.version || "—")}</dd><dt>Rôle</dt><dd>${e(ctx.role || "—")}</dd><dt>Écran</dt><dd>${e(ctx.ecran || "—")}</dd><dt>Navigateur</dt><dd>${e(ctx.navigateur || "—")}</dd></dl></details>
    <div class="fil">${fils}</div>
    <form id="f-repondre" novalidate>
      <div class="champ"><label for="tk-texte">Ta réponse ${aide("tk-a-rep", "Envoyée par email à la personne et affichée dans son RecipeLog (Réglages → Signaler un problème). Elle peut te répondre de là : tu seras prévenu.")}
        <textarea id="tk-texte" rows="5" maxlength="5000" placeholder="Bonjour, …"></textarea></div>
      <div class="champ"><label class="case"><input type="checkbox" id="tk-fermer"> Fermer la demande après l'envoi ${aide("tk-a-ferm", "À cocher quand le problème est réglé. Si la personne répond quand même, la demande se rouvre toute seule.")}</div>
      <p class="erreur" id="tk-erreur"></p>
      <div class="pied">${t.statut === "ferme" ? `<button class="btn" type="button" id="tk-rouvrir">Rouvrir</button>` : `<button class="btn" type="button" id="tk-clore">Fermer sans répondre</button>`}<button class="btn principal" type="submit">Envoyer la réponse</button></div>
    </form>
    <div class="champ note"><label for="tk-note">Note pour toi ${aide("tk-a-note", "Jamais montrée au client. Par exemple : « corrigé dans la PR 160, à dire quand c'est en ligne ».")}
      <div class="suffixe"><input id="tk-note" type="text" maxlength="2000" value="${e(t.notes ?? "")}" placeholder="Rien"><button class="btn" type="button" id="tk-note-ok">Garder</button></div></div>`,
    afficherSupport,
  );
  $("#f-repondre").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const texte = $("#tk-texte").value.trim();
    if (!texte) return ($("#tk-erreur").textContent = "Écris ta réponse d'abord.");
    $("#tk-erreur").textContent = "Envoi…";
    const r = await actionSupport(t, "repondre", { texte, fermer: $("#tk-fermer").checked });
    if (!r.ok) return ($("#tk-erreur").textContent = r.message || "Échec.");
    fenetreTicket(client, id);
    if (r.email === "echec") $("#tk-erreur").textContent = "Réponse gardée, mais l'email n'est pas parti (réglages SMTP). La personne la verra dans son RecipeLog.";
    else if (r.email === null) $("#tk-erreur").textContent = "Réponse gardée. Emails pas réglés : la personne la verra dans son RecipeLog.";
  });
  $("#tk-clore")?.addEventListener("click", async () => {
    await actionSupport(t, "fermer");
    fenetreTicket(client, id);
  });
  $("#tk-rouvrir")?.addEventListener("click", async () => {
    await actionSupport(t, "rouvrir");
    fenetreTicket(client, id);
  });
  $("#tk-note-ok").addEventListener("click", async (ev) => {
    const r = await actionSupport(t, "note", { texte: $("#tk-note").value });
    ev.target.textContent = r.ok ? "Gardée ✓" : "Échec";
  });
}

// ------------------------------------------------------------ maintenance et messages (lot 6)
const quandFr = (iso) => new Date(iso).toLocaleString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const nomsCibles = (c) => (c.includes("*") ? `Tous les clients${c.includes("vitrine") ? " + vitrine" : ""}` : c.map((x) => (x === "vitrine" ? "vitrine" : x)).join(", "));
const ETATS_MAINT = { "en-cours": ["En cours", "ko"], prevue: ["Prévue", "prog"], finie: ["Finie", "ok"] };

// Choix des cibles : « Tous les clients » ou une liste, plus la vitrine si permise.
function champCibles(id, vitrine) {
  const cases = CLIENTS.map((c) => `<label class="case"><input type="checkbox" name="${id}" value="${e(c.nom)}"> ${e(c.nom)}</label>`).join("");
  return `<div class="champ"><label>Pour qui ${aide(`${id}-a`, vitrine ? "« Tous les clients » vise aussi ceux créés plus tard. Le site vitrine se coche à part (recipelog.cc). Toi (équipe RecipeLog), tu entres toujours, même en maintenance." : "« Tous les clients » vise aussi ceux créés plus tard. L'email part à chaque compte actif de leur équipe, un par un (personne ne voit les autres adresses).")}
    <div class="cibles"><label class="case"><input type="checkbox" name="${id}" value="*" checked> <b>Tous les clients</b></label>${vitrine ? `<label class="case"><input type="checkbox" name="${id}" value="vitrine"> Site vitrine</label>` : ""}${cases}</div></div>`;
}
const lireCibles = (id) => [...document.querySelectorAll(`input[name="${id}"]:checked`)].map((i) => i.value);
// Date de <input type="datetime-local"> (heure de ton navigateur) → ISO ; vide → null.
const isoLocal = (v) => (v ? new Date(v).toISOString() : null);
const pourChamp = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function afficherAnnonces() {
  const zone = $("#annonces");
  if (!ANNONCES) {
    zone.innerHTML = `<div class="vide">Indisponible (le moteur ne répond pas).</div>`;
    return;
  }
  const maint = ANNONCES.maintenances
    .sort((a, b) => a.debut.localeCompare(b.debut))
    .map((m) => {
      const [et, cl] = ETATS_MAINT[m.etat] ?? [m.etat, "acc"];
      return `<article class="demande${m.etat === "finie" ? " traitee" : ""}" data-maint="${e(m.id)}"><div><span class="etiquette ${cl}">${e(et)}</span> <b>${e(nomsCibles(m.cibles))}</b>
        <small>${e(quandFr(m.debut))} → ${m.fin ? e(quandFr(m.fin)) : "jusqu'à « Terminer »"}${m.etat === "prevue" ? ` · préavis ${m.preavisHeures} h avant${m.emailPreavis ? (m.preavisEnvoye ? " · email envoyé" : " · email prévu") : " · sans email"}` : ""}</small><p>${e(m.message)}</p></div>
        ${m.etat === "finie" ? "" : `<div class="actions">${m.etat === "en-cours" ? `<button class="btn petit principal" type="button" data-m="terminer">Terminer</button>` : `<button class="btn petit danger" type="button" data-m="annuler">Annuler</button>`}</div>`}</article>`;
    })
    .join("");
  const band = ANNONCES.bandeaux
    .map(
      (b) => `<article class="demande" data-band="${e(b.id)}"><div><span class="etiquette ${b.niveau === "alerte" ? "ko" : "acc"}">${b.niveau === "alerte" ? "Important" : "Info"}</span> <b>${e(nomsCibles(b.cibles))}</b>
        <small>${b.jusqua ? `jusqu'au ${e(quandFr(b.jusqua))}` : "sans fin"}</small><p>${e(b.texte)}</p></div>
        <div class="actions"><button class="btn petit" type="button" data-b="retirer">Retirer</button></div></article>`,
    )
    .join("");
  const env = ANNONCES.envois
    .slice(0, 8)
    .map(
      (l) => `<div class="ligne"><time>${heureFr(l.date)}</time><span class="qui">${e(l.qui)}</span><span>${l.raison === "preavis" ? "Préavis de maintenance" : `« ${e(l.sujet)} »`} → <b>${e(nomsCibles(l.cibles))}</b> : ${l.envoyes} envoyé${l.envoyes > 1 ? "s" : ""}${l.echecs ? ` <span class="etiquette ko">${l.echecs} échec${l.echecs > 1 ? "s" : ""}</span>` : ""}</span><span></span></div>`,
    )
    .join("");
  zone.innerHTML = `<div class="barre serree">
      <button class="btn principal" type="button" id="an-maint">Programmer une maintenance</button>
      <button class="btn" type="button" id="an-message">Écrire aux clients</button>
      <button class="btn" type="button" id="an-bandeau">Nouveau bandeau</button>
      <button class="aide" type="button" data-aide="an-a" aria-label="Aide">?</button></div>
    <p class="texte-aide" id="an-a"><b>Maintenance</b> : pendant la plage choisie, les RecipeLog visés (ou la vitrine) affichent « Petite pause technique » ; toi, tu entres quand même. Avant, un bandeau prévient dans l'appli et un email part aux équipes (préavis). À la fin, tout se rouvre tout seul. <b>Écrire aux clients</b> : un email à chaque compte des clients choisis, avec des modèles (incident, maintenance), et si tu veux le même texte en bandeau dans l'appli. <b>Bandeau</b> : un message en haut de leur RecipeLog, que chacun peut fermer.</p>
    <h3 class="titre-demandes">Maintenances</h3>
    <div class="demandes">${maint || `<div class="vide">Aucune maintenance prévue.</div>`}</div>
    <h3 class="titre-demandes">Bandeaux dans l'appli</h3>
    <div class="demandes">${band || `<div class="vide">Aucun bandeau.</div>`}</div>
    <h3 class="titre-demandes">Derniers envois d'emails ${ANNONCES.email ? "" : `<span class="etiquette pause">emails pas réglés</span>`}</h3>
    <section class="journal">${env || `<div class="ligne"><span>Aucun envoi pour l'instant.</span></div>`}</section>`;
  $("#an-maint").addEventListener("click", fenetreMaintenance);
  $("#an-message").addEventListener("click", () => fenetreMessage());
  $("#an-bandeau").addEventListener("click", fenetreBandeau);
  zone.querySelectorAll("[data-m]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (b.dataset.m === "annuler" && b.dataset.confirme !== "1") {
        b.dataset.confirme = "1";
        b.textContent = "Confirmer";
        return;
      }
      b.disabled = true;
      await api("POST", `/annonces/${b.dataset.m}/${b.closest("[data-maint]").dataset.maint}`);
      charger();
    }),
  );
  zone.querySelectorAll("[data-b]").forEach((b) =>
    b.addEventListener("click", async () => {
      b.disabled = true;
      await api("POST", `/annonces/retirer-bandeau/${b.closest("[data-band]").dataset.band}`);
      charger();
    }),
  );
}

function fenetreMaintenance() {
  const demain = new Date(Date.now() + 86400000);
  demain.setHours(22, 0, 0, 0);
  const fin = new Date(demain.getTime() + 3600000);
  ouvrir(
    "Programmer une maintenance",
    `<form id="f-maint" novalidate>
      ${champCibles("mt-c", true)}
      <div class="champ"><label class="case"><input type="checkbox" id="mt-now"> Tout de suite ${aide("mt-a-now", "Bascule maintenant, sans préavis. Pratique pour une intervention urgente : tu cliqueras sur « Terminer » quand c'est fini.")}</div>
      <div class="deux" id="mt-dates">
        <div class="champ"><label for="mt-debut">Début ${aide("mt-a-deb", "Heure de ton navigateur (France). À cette heure, la page d'attente s'affiche toute seule.")}<input id="mt-debut" type="datetime-local" value="${pourChamp(demain)}"></div>
        <div class="champ"><label for="mt-fin">Fin ${aide("mt-a-fin", "À cette heure, les sites se rouvrent tout seuls. Laisser vide : ouvert jusqu'à ce que tu cliques « Terminer ».")}<input id="mt-fin" type="datetime-local" value="${pourChamp(fin)}"></div>
      </div>
      <div class="champ"><label for="mt-msg">Message affiché ${aide("mt-a-msg", "Sur la page d'attente, dans le bandeau de préavis et dans l'email. Phrase simple, sans détail technique.")}
        <textarea id="mt-msg" rows="3" maxlength="1000">Nous installons une mise à jour de RecipeLog. Le site revient très vite, avec toutes tes recettes.</textarea></div>
      <div class="deux" id="mt-pre">
        <div class="champ"><label for="mt-h">Préavis ${aide("mt-a-h", "Combien d'heures avant le début le bandeau apparaît dans l'appli et l'email part. 24 h, c'est bien.")}<div class="suffixe"><input id="mt-h" type="number" min="1" max="168" value="24"><span>heures avant</span></div></div>
        <div class="champ"><label class="case"><input type="checkbox" id="mt-email" checked> Prévenir aussi par email ${aide("mt-a-em", "Un email à chaque compte actif des clients visés, au moment du préavis.")}</div>
      </div>
      <p class="erreur" id="mt-erreur"></p>
      <div class="pied"><button class="btn principal" type="submit">Programmer</button></div>
    </form>`,
    charger,
  );
  $("#mt-now").addEventListener("change", (ev) => {
    $("#mt-debut").disabled = ev.target.checked;
    $("#mt-pre").classList.toggle("cache", ev.target.checked);
    if (ev.target.checked) $("#mt-fin").value = "";
  });
  $("#f-maint").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const maintenant = $("#mt-now").checked;
    const corps = {
      cibles: lireCibles("mt-c"),
      debut: maintenant ? null : isoLocal($("#mt-debut").value),
      fin: isoLocal($("#mt-fin").value),
      message: $("#mt-msg").value,
      preavisHeures: Number($("#mt-h").value || 24),
      emailPreavis: !maintenant && $("#mt-email").checked,
    };
    if (!corps.cibles.length) return ($("#mt-erreur").textContent = "Choisis au moins une cible.");
    if (!maintenant && !corps.debut) return ($("#mt-erreur").textContent = "Choisis le début, ou coche « Tout de suite ».");
    $("#mt-erreur").textContent = "Enregistrement…";
    const r = await api("POST", "/annonces/maintenance", corps);
    if (!r.ok) return ($("#mt-erreur").textContent = r.message || "Échec.");
    $("#fenetre-corps").innerHTML = `<p class="etiquette ok">Programmée</p><p class="sub">${maintenant ? "Les sites visés affichent maintenant la page d'attente (dans 30 secondes au plus). Toi, tu entres toujours." : "Le bandeau et l'email de préavis partiront tout seuls, puis la bascule et la réouverture se feront à l'heure dite."}</p>`;
  });
}

const MODELES = {
  incident: ["RecipeLog : incident en cours", "Bonjour,\n\nRecipeLog rencontre en ce moment un problème : certaines pages peuvent être lentes ou ne pas s'ouvrir. Nous sommes dessus et te tenons au courant.\n\nToutes tes recettes et tes données sont en sécurité.", "Incident en cours : RecipeLog peut être lent ou indisponible. Nous sommes dessus.", "alerte"],
  resolu: ["RecipeLog : incident résolu", "Bonjour,\n\nLe problème de tout à l'heure est réglé : RecipeLog marche de nouveau normalement. Merci de ta patience.\n\nSi quelque chose te semble encore bizarre, écris-nous depuis Réglages → Signaler un problème.", "Incident résolu : RecipeLog marche de nouveau normalement.", "info"],
  nouveaute: ["RecipeLog : du nouveau", "Bonjour,\n\nRecipeLog vient d'être mis à jour. Voici ce qui change :\n\n- \n\nTu retrouves le détail dans Réglages → Version et nouveautés.", "Mise à jour de RecipeLog : découvre les nouveautés dans Réglages → Version et nouveautés.", "info"],
  libre: ["", "Bonjour,\n\n", "", "info"],
};
function fenetreMessage(modele = "incident") {
  ouvrir(
    "Écrire aux clients",
    `<form id="f-msg" novalidate>
      ${champCibles("ms-c", false)}
      <div class="champ"><label for="ms-mod">Modèle ${aide("ms-a-mod", "Remplit le sujet et le texte : tu peux tout changer ensuite.")}
        <select id="ms-mod"><option value="incident">Incident en cours</option><option value="resolu">Incident résolu</option><option value="nouveaute">Nouveautés</option><option value="libre">Message libre</option></select></div>
      <div class="champ"><label for="ms-sujet">Sujet</label><input id="ms-sujet" type="text" maxlength="200"></div>
      <div class="champ"><label for="ms-texte">Message ${aide("ms-a-txt", "Texte simple. La signature « L'équipe RecipeLog » et l'adresse du RecipeLog du client sont ajoutées en bas.")}<textarea id="ms-texte" rows="7" maxlength="10000"></textarea></div>
      <div class="champ"><label class="case"><input type="checkbox" id="ms-band"> Aussi en bandeau dans l'appli ${aide("ms-a-band", "Le texte court ci-dessous s'affiche en haut de leur RecipeLog pendant le nombre de jours choisi.")}</div>
      <div class="cache" id="ms-bandeau">
        <div class="champ"><label for="ms-btexte">Texte du bandeau</label><input id="ms-btexte" type="text" maxlength="300"></div>
        <div class="champ"><label for="ms-jours">Pendant</label><div class="suffixe"><input id="ms-jours" type="number" min="1" max="90" value="3"><span>jours</span></div></div>
      </div>
      <p class="erreur" id="ms-erreur"></p>
      <div class="pied"><button class="btn principal" type="submit">Envoyer</button></div>
    </form>`,
    charger,
  );
  const remplir = (m) => {
    const [s, t, b] = MODELES[m];
    $("#ms-sujet").value = s;
    $("#ms-texte").value = t;
    $("#ms-btexte").value = b;
  };
  $("#ms-mod").value = modele;
  remplir(modele);
  $("#ms-mod").addEventListener("change", (ev) => remplir(ev.target.value));
  $("#ms-band").addEventListener("change", (ev) => $("#ms-bandeau").classList.toggle("cache", !ev.target.checked));
  $("#f-msg").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const corps = {
      cibles: lireCibles("ms-c"),
      sujet: $("#ms-sujet").value,
      texte: $("#ms-texte").value,
      bandeau: $("#ms-band").checked,
      texteBandeau: $("#ms-btexte").value,
      jours: Number($("#ms-jours").value || 3),
      niveau: MODELES[$("#ms-mod").value][3],
    };
    if (!corps.cibles.length) return ($("#ms-erreur").textContent = "Choisis au moins un client.");
    if (corps.sujet.trim().length < 3 || corps.texte.trim().length < 3) return ($("#ms-erreur").textContent = "Écris un sujet et un message.");
    if (corps.bandeau && corps.texteBandeau.trim().length < 3) return ($("#ms-erreur").textContent = "Écris le texte du bandeau.");
    const qui = corps.cibles.includes("*") ? "tous tes clients" : corps.cibles.join(", ");
    const b = ev.submitter;
    if (b.dataset.confirme !== "1") {
      b.dataset.confirme = "1";
      b.textContent = `Confirmer l'envoi à ${qui}`;
      return;
    }
    b.disabled = true;
    const r = await api("POST", "/annonces/message", corps);
    if (!r.ok) {
      b.disabled = false;
      return ($("#ms-erreur").textContent = r.message || "Échec.");
    }
    $("#fenetre-corps").innerHTML = `<p class="etiquette ok">Envoi lancé</p><p class="sub">${e(r.sortie)}</p>`;
  });
}

function fenetreBandeau() {
  ouvrir(
    "Nouveau bandeau",
    `<form id="f-band" novalidate>
      ${champCibles("bd-c", false)}
      <div class="champ"><label for="bd-texte">Texte ${aide("bd-a-txt", "Une phrase courte, affichée en haut de chaque page de leur RecipeLog. Chacun peut la fermer avec la croix (elle ne revient pas sur cet appareil).")}<input id="bd-texte" type="text" maxlength="300" placeholder="Nouveau : les fiches de vente arrivent la semaine prochaine !"></div>
      <div class="deux">
        <div class="champ"><label for="bd-niveau">Couleur</label><select id="bd-niveau"><option value="info">Information</option><option value="alerte">Important (rouge)</option></select></div>
        <div class="champ"><label for="bd-jours">Pendant ${aide("bd-a-j", "Le bandeau disparaît tout seul après ce nombre de jours. Tu peux aussi le retirer avant.")}<div class="suffixe"><input id="bd-jours" type="number" min="1" max="90" value="7"><span>jours</span></div></div>
      </div>
      <p class="erreur" id="bd-erreur"></p>
      <div class="pied"><button class="btn principal" type="submit">Afficher</button></div>
    </form>`,
    charger,
  );
  $("#f-band").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const corps = { cibles: lireCibles("bd-c"), texte: $("#bd-texte").value, niveau: $("#bd-niveau").value, jours: Number($("#bd-jours").value || 7) };
    if (!corps.cibles.length) return ($("#bd-erreur").textContent = "Choisis au moins un client.");
    if (corps.texte.trim().length < 3) return ($("#bd-erreur").textContent = "Écris le texte.");
    const r = await api("POST", "/annonces/bandeau", corps);
    if (!r.ok) return ($("#bd-erreur").textContent = r.message || "Échec.");
    $("#fenetre-corps").innerHTML = `<p class="etiquette ok">Affiché</p><p class="sub">Le bandeau apparaît dans leur RecipeLog d'ici 30 secondes.</p>`;
  });
}

// « Tous les clients » coché : les autres cases ne servent à rien.
document.addEventListener("change", (ev) => {
  const i = ev.target;
  if (!(i instanceof HTMLInputElement) || i.type !== "checkbox" || !i.closest(".cibles")) return;
  const toutes = [...document.querySelectorAll(`input[name="${i.name}"]`)];
  if (i.value === "*" && i.checked) toutes.forEach((x) => x.value !== "*" && x.value !== "vitrine" && (x.checked = false));
  else if (i.value !== "*" && i.value !== "vitrine" && i.checked) toutes.forEach((x) => x.value === "*" && (x.checked = false));
});


// ------------------------------------------------------------ lecture des factures par IA (lot 7)
const nombreFr = (n) => Number(n || 0).toLocaleString("fr-FR");
const dollars = (n) => `${Number(n || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;

function afficherIA() {
  const zone = $("#ia");
  if (!IA) {
    zone.innerHTML = `<div class="vide">Indisponible (le moteur ne répond pas).</div>`;
    return;
  }
  const defaut = IA.defaut ?? 30;
  const noms = [...new Set([...CLIENTS.map((c) => c.nom), ...Object.keys(IA.usage)])].sort();
  let total = { lectures: 0, cout: 0 };
  const lignes = noms
    .map((nom) => {
      const u = IA.usage[nom] ?? { mois: { lectures: 0, entree: 0, sortie: 0, cout: 0 }, precedent: { lectures: 0, cout: 0 } };
      const propre = typeof IA.clients[nom] === "number";
      const limite = propre ? IA.clients[nom] : defaut;
      total = { lectures: total.lectures + u.mois.lectures, cout: total.cout + u.mois.cout };
      const pct = limite > 0 ? Math.min(100, Math.round((u.mois.lectures / limite) * 100)) : 0;
      const plein = limite > 0 && u.mois.lectures >= limite;
      return `<tr><td><b>${e(nom)}</b></td>
        <td>${limite === 0 ? `<span class="etiquette pause">coupée</span>` : `${nombreFr(u.mois.lectures)} / ${nombreFr(limite)} ${plein ? `<span class="etiquette ko">plein</span>` : ""}<div class="jauge"><span class="j${pct > 0 ? Math.max(5, Math.round(pct / 5) * 5) : 0}"></span></div>`}</td>
        <td>${propre ? "à part" : "défaut"}</td>
        <td>${nombreFr(u.mois.entree)} / ${nombreFr(u.mois.sortie)}</td>
        <td>${dollars(u.mois.cout)}</td>
        <td>${nombreFr(u.precedent.lectures)} · ${dollars(u.precedent.cout)}</td>
        <td><button class="btn petit" type="button" data-ia="${e(nom)}">Régler</button></td></tr>`;
    })
    .join("");
  zone.innerHTML = `<div class="barre serree">
      <span class="etiquette ${IA.cle ? "ok" : "pause"}">${IA.cle ? "Clé Claude de la plateforme réglée" : "Pas de clé Claude : les clients doivent mettre la leur"}</span>
      <span class="sub">Par défaut : <b>${nombreFr(defaut)}</b> lectures par mois et par client</span>
      <button class="btn" type="button" id="ia-defaut">Changer le défaut</button>
      <button class="aide" type="button" data-aide="ia-a" aria-label="Aide">?</button></div>
    <p class="texte-aide" id="ia-a">Dans leur RecipeLog, tes clients prennent une facture en photo ou en PDF et l'IA la recopie en lignes de prix à vérifier. Avec ta clé (IA_ANTHROPIC_CLE, voir A-FAIRE.md étape G), chaque lecture compte dans leur quota du mois, remis à zéro le 1er. 0 = lecture par IA coupée pour ce client (il peut toujours mettre sa propre clé Claude, ChatGPT ou Gemini dans ses réglages : elle ne passe pas par toi et ne compte pas ici). Le coût est une estimation au prix de Claude Opus 5.5 (4 $ par million de jetons lus, 20 $ par million écrits).</p>
    <div class="tableau-sante"><table><thead><tr><th>Client</th><th>Lectures ce mois-ci (${e(IA.mois)})</th><th>Quota</th><th>Jetons lus / écrits</th><th>Coût estimé</th><th>Mois dernier</th><th></th></tr></thead>
    <tbody>${lignes || `<tr><td colspan="7">Aucun client.</td></tr>`}</tbody>
    <tfoot><tr><td>Total</td><td>${nombreFr(total.lectures)}</td><td></td><td></td><td>${dollars(total.cout)}</td><td></td><td></td></tr></tfoot></table></div>`;
  $("#ia-defaut").addEventListener("click", () => fenetreQuotaIA("*", defaut));
  zone.querySelectorAll("[data-ia]").forEach((b) =>
    b.addEventListener("click", () => fenetreQuotaIA(b.dataset.ia, typeof IA.clients[b.dataset.ia] === "number" ? IA.clients[b.dataset.ia] : null)),
  );
}

function fenetreQuotaIA(client, actuel) {
  const tous = client === "*";
  ouvrir(
    tous ? "Lectures par IA : défaut" : `Lectures par IA : ${client}`,
    `<form id="f-ia" novalidate>
      <div class="champ"><label for="ia-limite">Lectures par mois ${aide("ia-a-l", tous ? "Ce que reçoit chaque client qui n'a pas de réglage à part. Une lecture = une facture ou une mercuriale lue par l'IA. 0 = coupée pour tous." : "Une lecture = une facture ou une mercuriale lue par l'IA. 0 = coupée pour ce client. « Revenir au défaut » : il suit le nombre par défaut.")}
        <div class="suffixe"><input id="ia-limite" type="number" min="0" max="100000" step="1" value="${actuel ?? ""}" placeholder="${tous ? "30" : `défaut (${IA.defaut ?? 30})`}"><span>par mois</span></div></div>
      <p class="erreur" id="ia-erreur"></p>
      <div class="pied">${tous ? "" : `<button class="btn" type="button" id="ia-reset">Revenir au défaut</button>`}<button class="btn principal" type="submit">Enregistrer</button></div>
    </form>`,
    charger,
  );
  const envoyer = async (limite) => {
    const r = await api("POST", "/ia/quota", { client, limite });
    if (!r.usage) return ($("#ia-erreur").textContent = r.message || "Échec.");
    IA = r;
    $("#fenetre-corps").innerHTML = `<p class="etiquette ok">Enregistré</p><p class="sub">Pris en compte tout de suite pour ${tous ? "tous les clients sans réglage à part" : e(client)}.</p>`;
  };
  $("#f-ia").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const v = $("#ia-limite").value.trim();
    if (!/^\d+$/.test(v)) return ($("#ia-erreur").textContent = "Écris un nombre entier (0 pour couper).");
    envoyer(Number(v));
  });
  if (!tous) $("#ia-reset").addEventListener("click", () => envoyer(null));
}
