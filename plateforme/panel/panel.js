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
let VENTE = null;
let PLATEFORME = null; // version installée, nouveautés sur GitHub, dernière mise à jour (plateforme.mjs)
let MAJ = null; // nouvelles versions pour les clients (par canal) et la vitrine (nouveautes.mjs)
let CANAL = "instance"; // version donnée par défaut aux nouveaux clients (dit par le moteur)
// Versions de l'appli (canaux) proposées dans le panel. « plateforme » : l'ancien canal,
// montré seulement pour les clients qui y sont encore.
const NOMS_CANAUX = { instance: "Standard", "beta-instance": "Bêta", plateforme: "Ancienne (plateforme)", beta: "Bêta des sites LXC", stable: "Stable des sites LXC" };
const nomCanal = (k) => NOMS_CANAUX[k] ?? k ?? "—";
const AIDE_CANAL = "Réglé ici seulement : le client ne voit pas ce choix et ne peut pas le changer. <b>Standard</b> (branche instance) : la version de tous tes clients. <b>Bêta</b> (branche beta-instance) : la version en cours de développement, à mettre sur ta propre instance pour l'essayer. Quand la bêta te plaît, elle passe en Standard, puis tu mets à jour chaque client avec son bouton.";

// ------------------------------------------------------------ API
async function appel(methode, chemin, corps) {
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
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
// Où en est l'action longue affichée dans la fenêtre (rempli par executer).
let suivi = null;
// Les actions qui modifient un client ne font pas attendre la page : le moteur rend un
// numéro de tâche, et on lui redemande où elle en est jusqu'à la fin. L'action continue
// même si la page est fermée (le résultat est alors dans le journal).
async function api(methode, chemin, corps) {
  const r = await appel(methode, chemin, corps);
  if (r.statut !== 202 || !r.tache) return r;
  let rates = 0;
  for (let i = 0; ; i += 1) {
    await pause(i < 3 ? 600 : i < 10 ? 1500 : 3000);
    let t;
    try {
      t = await appel("GET", `/taches/${r.tache}`);
    } catch (err) {
      // Coupure de réseau passagère : on réessaie quelques fois avant d'abandonner.
      rates += 1;
      if (rates > 10) return { ok: false, sortie: "Le panel ne répond plus. L'action continue peut-être : regarde le journal dans quelques minutes." };
      continue;
    }
    if (t.statut === 404) return { ok: false, sortie: t.message || "Action introuvable : regarde le journal." };
    if (t.statut >= 500 && !t.etat) {
      rates += 1;
      if (rates > 10) return { ok: false, sortie: "Le moteur ne répond plus. L'action continue peut-être : regarde le journal dans quelques minutes." };
      continue;
    }
    rates = 0;
    if (t.etat === "fini") return { ...t, ok: t.ok === true, statut: t.ok ? 200 : 500 };
    if (suivi) suivi(t.etat === "attente" ? `En attente : une autre action est en cours${t.attend ? ` (${t.attend})` : ""}. La tienne démarre juste après.` : t.etape || "");
  }
}

// ------------------------------------------------------------ aide « ? »
// Chaque « ? » ouvre une petite fenêtre avec son texte (le texte reste caché dans la page,
// à côté du bouton). Elle passe par-dessus une fenêtre déjà ouverte et ne se ferme que par sa croix.
const voileAide = $("#voile-aide");
function titreAide(b) {
  const src = b.closest("label, h1, h2, h3, h4, .tete-page, .aide-ligne, .tete-boite");
  const t = (src?.textContent ?? "").replace(/\?/g, "").replace(/\s+/g, " ").trim();
  if (t && t.length <= 60) return t;
  const lbl = (b.getAttribute("aria-label") || "").replace(/^Aide( sur| :)?\s*/i, "").trim();
  return lbl ? lbl.charAt(0).toUpperCase() + lbl.slice(1) : "Aide";
}
document.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-aide]");
  if (!b) return;
  ev.preventDefault();
  const t = document.getElementById(b.dataset.aide);
  if (!t) return;
  $("#aide-titre").textContent = titreAide(b);
  $("#aide-corps").innerHTML = t.innerHTML;
  voileAide.classList.add("ouvert");
  document.body.style.overflow = "hidden";
  $("#aide-croix").focus();
});
$("#aide-croix").addEventListener("click", () => {
  voileAide.classList.remove("ouvert");
  if (!voile.classList.contains("ouvert")) document.body.style.overflow = "";
});
const aide = (id, texte) => `<button class="aide" type="button" data-aide="${id}" aria-label="Aide">?</button></label><p class="texte-aide" id="${id}">${texte}</p>`;

// ------------------------------------------------------------ fenêtre (croix seulement)
const voile = $("#voile");
let apresFermeture = null;
function ouvrir(titre, html, fermeture = null) {
  $("#fenetre-titre").textContent = titre;
  $("#fenetre-corps").innerHTML = html;
  $("#fenetre-corps").onclick = null;
  apresFermeture = fermeture;
  voile.classList.add("ouvert");
  document.body.classList.add("couche-ouverte");
  document.body.style.overflow = "hidden";
}
$("#croix").addEventListener("click", () => {
  voile.classList.remove("ouvert");
  document.body.classList.remove("couche-ouverte");
  document.body.style.overflow = "";
  const f = apresFermeture;
  apresFermeture = null;
  if (f) f();
});

// Action longue : attente, puis ce que l'outil a répondu.
async function executer(titre, requete) {
  ouvrir(titre, `<p class="attente"><span class="rond"></span>En cours… (une création ou une mise à jour prend 1 à 3 minutes)</p><p class="sub" id="ex-etape"></p>
    <p class="texte-aide visible discret">Tu peux laisser cette fenêtre ouverte. Si tu fermes la page, l'action continue quand même : son résultat sera dans le journal, en bas du panel.</p>`);
  $("#croix").disabled = true;
  suivi = (texte) => {
    const z = $("#ex-etape");
    if (z) z.textContent = texte;
  };
  let r;
  try {
    r = await requete();
  } catch (err) {
    r = { ok: false, sortie: String(err.message ?? err) };
  }
  suivi = null;
  $("#croix").disabled = false;
  const texte = r.sortie || r.message || (r.ok ? "Fait." : "Échec.");
  $("#fenetre-corps").innerHTML = `<p class="etiquette ${r.ok ? "ok" : "ko"}">${r.ok ? "Réussi" : "Échec"}</p><pre class="sortie">${e(texte)}</pre>`;
  apresFermeture = charger;
  return r;
}

// ------------------------------------------------------------ affichage
function etat(c) {
  if (c.suspendu) return `<span class="etiquette pause">En pause</span>`;
  if (c.occupe && c.etat !== "healthy") return `<span class="etiquette prog" title="Une action est en cours ou vient de finir sur ce client">Redémarre</span>`;
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

const ic = (nom, cl = "s18") => `<svg class="ic ${cl}" aria-hidden="true"><use href="/icones.svg#i-${nom}"/></svg>`;
// Bouton « ? » et son texte (le texte se place juste après, hors d'un <label>).
const aideB = (id, texte) => [`<button class="aide" type="button" data-aide="${id}" aria-label="Aide">?</button>`, `<p class="texte-aide" id="${id}">${texte}</p>`];

// ------------------------------------------------------------ liste des clients
// Sauvegarde à regarder : aucune, plus de 36 h, ou test de restauration raté.
function sauvegardeKo(c) {
  const s = c.sauvegarde;
  if (c.demo) return null;
  if (!s?.derniere) return "aucune";
  if (s.test && !s.test.ok) return "test";
  if (Date.now() - dateSauv(s.derniere.id).getTime() > 36 * 3600 * 1000) return "vieille";
  return null;
}
function enPanne(c) {
  if (c.suspendu || c.occupe) return false;
  const s = SANTE?.services?.[`client:${c.nom}`];
  return (s && !s.ok) || (c.etat !== "healthy" && c.etat !== "starting");
}
// Nombre de changements que le client n'a pas encore (0 = à jour, null = on ne sait pas).
// Un client en pause prendra la nouvelle version à sa réactivation : pas compté.
const majDispo = (c) => (c.suspendu ? 0 : c.maj?.enRetard ?? null);
const etiquetteMaj = (c) => (majDispo(c) > 0 ? ` <span class="etiquette acc" title="${e(`${c.maj.enRetard} changement${c.maj.enRetard > 1 ? "s" : ""} pas encore installé${c.maj.enRetard > 1 ? "s" : ""}`)}">nouvelle version</span>` : "");
const aRegarder = (c) => enPanne(c) || Boolean(sauvegardeKo(c)) || c.versionBloquee || (c.essaiFin && !c.suspendu && joursRestants(c.essaiFin) <= 7);

const FILTRES = [
  ["tous", "Tous", () => true],
  ["essai", "En essai", (c) => Boolean(c.essaiFin) && !c.suspendu],
  ["pause", "En pause", (c) => c.suspendu],
  ["regarder", "À regarder", aRegarder],
  ["maj", "À mettre à jour", (c) => majDispo(c) > 0],
];
let filtreClients = "tous";
$("#filtres").addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-filtre]");
  if (!b) return;
  filtreClients = b.dataset.filtre;
  afficher();
});

function afficher() {
  const n = CLIENTS.length;
  const enLigne = CLIENTS.filter((c) => !c.suspendu && c.etat === "healthy").length;
  const pause = CLIENTS.filter((c) => c.suspendu).length;
  const essais = CLIENTS.filter((c) => c.essaiFin && !c.suspendu).length;
  const comptes = CLIENTS.reduce((s, c) => s + (c.places?.membres ?? 0), 0);
  $("#chiffres").innerHTML = [
    [n, n > 1 ? "clients" : "client", `${comptes} compte${comptes > 1 ? "s" : ""} au total`, "#clients"],
    [enLigne, "en ligne", n - enLigne - pause > 0 ? `${n - enLigne - pause} hors ligne` : "tous ceux qui doivent l'être", "#clients"],
    [essais, "en essai", `${pause} en pause`, "#clients"],
    [SANTE?.machine?.disque ? `${Math.round(SANTE.machine.disque.pourcent)} %` : "—", "disque utilisé", SANTE?.machine?.disque ? `${taille(SANTE.machine.disque.libre)} libres` : "mesure indisponible", "#sante"],
  ]
    .map(([v, l, s, h]) => `<a class="chiffre" href="${h}"><b>${e(v)}</b><span>${e(l)}</span><small>${e(s)}</small></a>`)
    .join("");

  $("#filtres").innerHTML = FILTRES.map(([k, t, f]) => {
    const nb = CLIENTS.filter(f).length;
    return `<button class="puce${filtreClients === k ? " on" : ""}" type="button" data-filtre="${k}" aria-pressed="${filtreClients === k}">${e(t)} <span class="canal">${nb}</span></button>`;
  }).join("");

  const filtre = $("#recherche").value.trim().toLowerCase();
  const test = FILTRES.find(([k]) => k === filtreClients)[2];
  const liste = CLIENTS.filter((c) => (!filtre || c.nom.includes(filtre)) && test(c));
  if (!liste.length) {
    $("#clients").innerHTML = `<div class="vide">${n ? "Aucun client ne correspond." : "Pas encore de client. Crée le premier avec « Nouveau client »."}</div>`;
    return;
  }
  $("#clients").innerHTML =
    `<div class="lc tete"><span>Client</span><span>État</span><span>Places</span><span>Version</span><span>Offre</span><span>Sauvegarde</span><span></span></div>` +
    liste
      .map(
        (c) => `<div class="lc" data-fiche="${e(c.nom)}">
      <div class="nom"><a href="#client/${e(c.nom)}">${e(c.nom)}</a><small>${e(c.adresse.replace("https://", ""))}</small></div>
      <div class="etat">${etat(c)}</div>
      <div class="cell"><span class="lbl">Places</span>${places(c)}</div>
      <div class="cell"><span class="lbl">Version</span>${e(c.version ?? "—")} <small class="canal">${e(nomCanal(c.canal))}</small>${c.versionBloquee ? ` <span class="etiquette pause">version gardée</span>` : etiquetteMaj(c)}</div>
      <div class="cell"><span class="lbl">Offre</span>${offre(c)}${c.mcp ? "" : ` <span class="etiquette ko" title="Accès MCP coupé">sans MCP</span>`}${c.demo ? ` <span class="etiquette prog">démo</span>` : ""}</div>
      <div class="cell"><span class="lbl">Sauvegarde</span>${sauvegarde(c)}</div>
      <div class="fin"><a class="btn petit" href="${e(c.adresse)}" target="_blank" rel="noopener">Ouvrir ${ic("external", "s16")}</a></div>
    </div>`,
      )
      .join("");
}
// Toute la ligne ouvre la fiche (sauf le bouton « Ouvrir », qui ouvre son site).
$("#clients").addEventListener("click", (ev) => {
  const l = ev.target.closest("[data-fiche]");
  if (!l || ev.target.closest("a")) return;
  location.hash = `#client/${l.dataset.fiche}`;
});

// ------------------------------------------------------------ à faire (accueil)
const depuis = (iso) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 60 ? `depuis ${m} min` : m < 1440 ? `depuis ${Math.round(m / 60)} h` : `depuis ${Math.round(m / 1440)} j`;
};
// Une ligne : niveau (ko, pause, acc), icône, titre, détail, client concerné, bouton.
function calculerAFaire() {
  const l = [];
  for (const t of SUPPORT ?? []) {
    if (t.statut !== "ouvert") continue;
    const dernier = t.messages.at(-1);
    l.push({ niveau: "ko", icone: "chat", client: t.client, titre: `${t.client} attend une réponse`, texte: `${depuis(t.maj)} · « ${dernier.texte.length > 90 ? `${dernier.texte.slice(0, 90)}…` : dernier.texte} »`, bouton: ["Répondre", () => fenetreTicket(t.client, t.id)], principal: true });
  }
  for (const c of CLIENTS) {
    if (enPanne(c)) l.push({ niveau: "ko", icone: "alert", client: c.nom, titre: `${c.nom} ne répond plus`, texte: "Son site est en panne. Regarde ses journaux.", bouton: ["Voir les journaux", `#client/${c.nom}/journaux`] });
    const sv = sauvegardeKo(c);
    if (sv === "test") l.push({ niveau: "ko", icone: "download", client: c.nom, titre: `Le test de sauvegarde de ${c.nom} a raté`, texte: c.sauvegarde.test.raison || "La dernière sauvegarde ne se relit pas.", bouton: ["Voir les sauvegardes", `#client/${c.nom}/sauvegardes`] });
    if (sv === "aucune" && !c.suspendu) l.push({ niveau: "pause", icone: "download", client: c.nom, titre: `${c.nom} n'a encore aucune sauvegarde`, texte: `Client créé le ${dateFr(c.creeLe)}. La sauvegarde de la nuit se fait vers 3 h.`, bouton: ["Sauvegarder", () => action(c, "sauvegarder")] });
    if (sv === "vieille" && !c.suspendu) l.push({ niveau: "pause", icone: "download", client: c.nom, titre: `Dernière sauvegarde de ${c.nom} trop vieille`, texte: `Plus de 36 heures : la sauvegarde de la nuit n'a pas marché.`, bouton: ["Voir les sauvegardes", `#client/${c.nom}/sauvegardes`] });
    if (c.versionBloquee) l.push({ niveau: "pause", icone: "refresh", client: c.nom, titre: `La mise à jour de ${c.nom} a échoué`, texte: "Il a été remis sur sa version d'avant et la garde. « Mettre à jour » réessaie.", bouton: ["Voir le client", `#client/${c.nom}`] });
    if (c.essaiFin && c.suspendu && c.essaiFini) l.push({ niveau: "pause", icone: "hourglass", client: c.nom, titre: `Essai fini : ${c.nom} est en pause`, texte: `Depuis le ${dateFr(c.essaiFin)}. Réactive-le en client, ou prolonge l'essai.`, bouton: ["Réactiver", () => fenetreReactiver(c)] });
    else if (c.essaiFin && !c.suspendu) {
      const j = joursRestants(c.essaiFin);
      if (j <= 7) l.push({ niveau: "acc", icone: "hourglass", client: c.nom, titre: j <= 0 ? `L'essai de ${c.nom} finit aujourd'hui` : `Fin d'essai dans ${j} jour${j > 1 ? "s" : ""} : ${c.nom}`, texte: `${c.places?.membres ?? 0} compte${(c.places?.membres ?? 0) > 1 ? "s" : ""} utilisé${(c.places?.membres ?? 0) > 1 ? "s" : ""}. À la fin, son site se met en pause tout seul.`, bouton: ["Voir le client", `#client/${c.nom}`] });
    }
  }
  const demandes = (VITRINE?.demandes ?? []).filter((d) => !d.traitee);
  if (demandes.length) l.push({ niveau: "acc", icone: "mail", titre: `${demandes.length} demande${demandes.length > 1 ? "s" : ""} reçue${demandes.length > 1 ? "s" : ""} sur la vitrine`, texte: demandes.slice(0, 3).map((d) => d.etab || d.nom).join(", "), bouton: ["Voir", "#vitrine"] });
  for (const m of ANNONCES?.maintenances ?? []) if (m.etat === "en-cours") l.push({ niveau: "pause", icone: "wrench", titre: "Maintenance en cours", texte: `${nomsCibles(m.cibles)} · ${m.fin ? `jusqu'au ${quandFr(m.fin)}` : "jusqu'à ce que tu cliques « Terminer »"}`, bouton: ["Voir", "#maintenance"] });
  if (SANTE) {
    const d = SANTE.machine.disque;
    if (d && d.pourcent >= 85) l.push({ niveau: d.pourcent >= 90 ? "ko" : "pause", icone: "alert", titre: `Disque rempli à ${Math.round(d.pourcent)} %`, texte: `Il reste ${taille(d.libre)}. Les sauvegardes de la nuit prennent de la place.`, bouton: ["Voir la santé", "#sante"] });
    for (const [id, nom] of [["service:connexion", "La connexion"], ["service:passerelle", "La passerelle"], ["service:vitrine", "La vitrine"]]) {
      const s = SANTE.services[id];
      if (s && !s.ok) l.push({ niveau: "ko", icone: "alert", titre: `${nom} ne répond plus`, texte: `Depuis le ${heureFr(s.depuis)}.`, bouton: ["Voir la santé", "#sante"] });
    }
  }
  if (IA) {
    for (const c of CLIENTS) {
      const lim = typeof IA.clients[c.nom] === "number" ? IA.clients[c.nom] : IA.defaut ?? 30;
      const u = IA.usage[c.nom]?.mois?.lectures ?? 0;
      if (lim > 0 && u >= lim) l.push({ niveau: "acc", icone: "sparkle", client: c.nom, titre: `${c.nom} a utilisé toutes ses lectures IA du mois`, texte: `${u} sur ${lim}. Elles reviennent le 1er du mois.`, bouton: ["Régler", "#ia"] });
    }
  }
  for (const [canal, k] of Object.entries(MAJ?.canaux ?? {})) {
    const n = k.aMettreAJour.length;
    if (n) l.push({ niveau: "acc", icone: "refresh", titre: `Nouvelle version ${nomCanal(canal)} : ${n} client${n > 1 ? "s" : ""} à mettre à jour`, texte: `${k.aMettreAJour.slice(0, 4).join(", ")}${n > 4 ? "…" : ""} · ${k.changements[0]?.titre ?? ""}`, bouton: ["Voir", () => fenetreMajCanal(canal)] });
  }
  if (MAJ?.vitrine?.enRetard > 0) l.push({ niveau: "acc", icone: "refresh", titre: "Nouvelle version de la vitrine", texte: `${MAJ.vitrine.enRetard} changement${MAJ.vitrine.enRetard > 1 ? "s" : ""} : ${MAJ.vitrine.changements[0]?.titre ?? ""}`, bouton: ["Voir", fenetreMajVitrine] });
  if (PLATEFORME) {
    const m = PLATEFORME.maj;
    const n = PLATEFORME.nouveautes?.enRetard ?? 0;
    if (m?.etat === "en-cours") l.push({ niveau: "pause", icone: "refresh", titre: "Mise à jour de la plateforme en cours", texte: `Lancée ${depuis(m.debut)}. Le panel peut se couper quelques minutes.`, bouton: ["Suivre", suivrePlateforme] });
    else if (m?.etat === "fini" && !m.ok && Date.now() - Date.parse(m.fin ?? m.debut) < 3 * 86400000) l.push({ niveau: "ko", icone: "alert", titre: "La mise à jour de la plateforme a échoué", texte: m.interrompue ? "Elle ne s'est jamais terminée (machine redémarrée ?). Relance-la." : `Le ${heureFr(m.fin)}. Le journal dit pourquoi.`, bouton: ["Voir", fenetreMajPlateforme] });
    else if (n > 0) l.push({ niveau: "acc", icone: "refresh", titre: `Mise à jour de la plateforme disponible`, texte: `${n} changement${n > 1 ? "s" : ""} : ${PLATEFORME.nouveautes.changements[0]?.titre ?? ""}`, bouton: ["Voir", fenetreMajPlateforme] });
  }
  const rang = { ko: 0, pause: 1, acc: 2 };
  return l.sort((a, b) => rang[a.niveau] - rang[b.niveau]);
}

function ligneAFaire(x, i) {
  const [texte, cible] = x.bouton;
  const bouton = typeof cible === "string" ? `<a class="btn petit${x.principal ? " principal" : ""}" href="${e(cible)}">${e(texte)}</a>` : `<button class="btn petit${x.principal ? " principal" : ""}" type="button" data-afaire="${i}">${e(texte)}</button>`;
  return `<div class="af ${x.niveau}"><span class="pastille">${ic(x.icone)}</span><div class="t"><b>${e(x.titre)}</b><span>${e(x.texte)}</span></div>${bouton}</div>`;
}
let AFAIRE = [];
document.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-afaire]");
  if (b) AFAIRE[Number(b.dataset.afaire)]?.bouton[1]();
});

const evts = (lignes) =>
  lignes.length
    ? lignes.map(([l, i]) => `<div class="evt"><time>${heureFr(l.date)}</time><span>${e(NOMS_ACTIONS[l.action] ?? l.action)} <b>${e(l.client)}</b>${l.ok ? "" : ` <span class="etiquette ko">échec</span>`}<small class="canal"> · ${e(l.qui)}</small></span><button type="button" data-journal="${i}">Détails</button></div>`).join("")
    : `<p class="sub">Rien pour l'instant.</p>`;

function afficherAccueil() {
  AFAIRE = calculerAFaire();
  $("#afaire").innerHTML = AFAIRE.length
    ? AFAIRE.map(ligneAFaire).join("")
    : `<div class="tout-va-bien">${ic("check", "s22")}Rien à faire : tout va bien.</div>`;
  $("#accueil-journal").innerHTML = evts(JOURNAL.slice(0, 7).map((l, i) => [l, i]));
  afficherPlateforme();
  if (!SANTE) {
    $("#accueil-machine").innerHTML = `<p class="sub">Mesures indisponibles (le moteur ne répond pas).</p>`;
    return;
  }
  const m = SANTE.machine;
  const memUtil = m.memoire.total - m.memoire.libre;
  const mesure = (nom, part, texte) => `<div class="mesure"><div><span>${nom}</span><span>${texte}</span></div>${jauge(part, "").replace("<small></small>", "")}</div>`;
  $("#accueil-machine").innerHTML =
    mesure("Processeur", (m.charge[0] / m.coeurs) * 100, `${e(Math.round((m.charge[0] / m.coeurs) * 100))} %`) +
    mesure("Mémoire", (memUtil / m.memoire.total) * 100, `${e(taille(memUtil))} / ${e(taille(m.memoire.total))}`) +
    (m.disque ? mesure("Disque", m.disque.pourcent, `${e(taille(m.disque.libre))} libres`) : "") +
    `<a href="#sante">Détail par client</a>`;
}

// ------------------------------------------------------------ mise à jour de la plateforme
// Le panel, la connexion, la passerelle et les outils (pas les sites des clients) : install.sh
// relancé sur la machine. Le panel et le moteur redémarrent pendant ce temps.
function afficherPlateforme() {
  const z = $("#accueil-plateforme");
  if (!PLATEFORME) {
    z.innerHTML = `<p class="sub">État indisponible (le moteur ne répond pas).</p>`;
    return;
  }
  const { version: v, maj: m, nouveautes: n } = PLATEFORME;
  let quoi;
  if (m?.etat === "en-cours") quoi = `<span class="etiquette prog">Mise à jour en cours</span>`;
  else if (n && n.enRetard > 0) quoi = `<span class="etiquette acc">${n.enRetard} nouveauté${n.enRetard > 1 ? "s" : ""}</span>`;
  else if (n) quoi = `<span class="etiquette ok">À jour</span>`;
  else quoi = `<span class="etiquette pause">Inconnu</span>`;
  const echec = m?.etat === "fini" && !m.ok ? `<p class="discret">La dernière mise à jour de la plateforme a échoué${m.fin ? ` (${e(heureFr(m.fin))})` : ""}.</p>` : "";
  const [bAide, tAide] = aideB(
    "pf-a",
    "Met à jour le panel, la connexion (Authentik), la passerelle, le service PDF et les outils, depuis GitHub. Le panel se coupe 5 à 10 minutes pendant ce temps, puis revient tout seul. Les sites des clients restent en ligne et ne changent pas de version : pour eux, ce sont les lignes Standard et Bêta juste en dessous.",
  );
  const lignes = [
    `<div class="maj-ligne"><div><b>Plateforme</b><small>${v ? `${e(v.court)} · ${e(dateFr(v.date))}` : "version inconnue (visible après la prochaine mise à jour)"}</small></div>${quoi}<button class="btn petit${n?.enRetard > 0 ? " principal" : ""}" type="button" id="pf-voir">${m?.etat === "en-cours" ? "Suivre" : "Voir"}</button>${bAide}</div>${tAide}${echec}`,
  ];
  // Clients, canal par canal (Standard, Bêta…), puis la vitrine.
  const canaux = Object.entries(MAJ?.canaux ?? {}).sort(([a], [b]) => (a === "instance" ? -1 : b === "instance" ? 1 : a.localeCompare(b)));
  for (const [canal, k] of canaux) {
    const actifs = k.clients.filter((c) => !c.suspendu);
    const nb = k.aMettreAJour.length;
    const inconnus = actifs.filter((c) => c.enRetard === null).length;
    const etiquette = !k.disponible
      ? `<span class="etiquette pause">Inconnu</span>`
      : nb
        ? `<span class="etiquette acc">${nb} à mettre à jour</span>`
        : inconnus === actifs.length && actifs.length
          ? `<span class="etiquette pause">Inconnu</span>`
          : `<span class="etiquette ok">À jour</span>`;
    const detail = k.disponible ? `dernière version du ${e(dateFr(k.disponible.date))} · ${actifs.length} client${actifs.length > 1 ? "s" : ""}` : "pas encore vérifié";
    lignes.push(`<div class="maj-ligne"><div><b>Clients ${e(nomCanal(canal))}</b><small>${detail}</small></div>${etiquette}<button class="btn petit${nb ? " principal" : ""}" type="button" data-maj-canal="${e(canal)}">Voir</button></div>`);
  }
  const vi = MAJ?.vitrine;
  if (vi) {
    const et = vi.enRetard > 0 ? `<span class="etiquette acc">${vi.enRetard} nouveauté${vi.enRetard > 1 ? "s" : ""}</span>` : vi.enRetard === 0 ? `<span class="etiquette ok">À jour</span>` : `<span class="etiquette pause">Inconnu</span>`;
    const detail = vi.installe ? `installée : ${e(vi.installe.slice(0, 7))}` : vi.installeLe ? `téléchargée le ${e(dateFr(vi.installeLe))}` : "version installée inconnue : mets-la à jour une fois";
    lignes.push(`<div class="maj-ligne"><div><b>Site vitrine</b><small>${detail}</small></div>${et}<button class="btn petit${vi.enRetard > 0 ? " principal" : ""}" type="button" id="maj-vitrine">Voir</button></div>`);
  }
  const [vAide, vTexte] = aideB(
    "maj-a",
    `Toutes les heures, le panel demande à GitHub s'il y a une nouvelle version : pour les clients (<b>Standard</b> = branche instance, <b>Bêta</b> = branche beta-instance, seulement une fois son image Docker prête), pour la plateforme (branche plateforme) et pour la vitrine (branche site-vitrine). <b>Rien n'est jamais installé tout seul</b> : c'est toi qui cliques. Tes clients ne voient rien de tout ça. « Inconnu » : GitHub n'a pas répondu, ou la version installée n'est pas lisible (une mise à jour la rend lisible).`,
  );
  const [aAide, aTexte] = aideB(
    "maj-a-alerte",
    "Quand une nouvelle version sort, un message part une seule fois par les mêmes canaux que les alertes de panne (Telegram, Discord et/ou email, réglés dans le fichier .env de la machine). Décoché : seulement les badges dans le panel.",
  );
  const quand = !MAJ?.date ? "Pas encore vérifié" : Date.now() - Date.parse(MAJ.date) < 60000 ? "Vérifié à l'instant" : `Vérifié ${depuis(MAJ.date).replace("depuis", "il y a")}`;
  z.innerHTML =
    `<div class="maj-lignes">${lignes.join("")}</div>` +
    (MAJ?.erreur ? `<p class="discret">${e(MAJ.erreur)}</p>` : "") +
    `<div class="pf-bas"><span class="discret">${e(quand)}</span><button class="btn petit" type="button" id="maj-verifier">Vérifier maintenant</button>${vAide}</div>${vTexte}` +
    (MAJ ? `<label class="case maj-alerte"><input type="checkbox" id="maj-alerte"${MAJ.alerte ? " checked" : ""}> Me prévenir par message ${aAide}</label>${aTexte}` : "");
  $("#pf-voir").onclick = () => (m?.etat === "en-cours" ? suivrePlateforme() : fenetreMajPlateforme());
  z.querySelectorAll("[data-maj-canal]").forEach((b) => (b.onclick = () => fenetreMajCanal(b.dataset.majCanal)));
  const bv = $("#maj-vitrine");
  if (bv) bv.onclick = fenetreMajVitrine;
  $("#maj-verifier").onclick = async () => {
    const b = $("#maj-verifier");
    b.disabled = true;
    b.textContent = "Vérification…";
    const r = await appel("POST", "/nouveautes/verifier").catch(() => ({ ok: false }));
    await charger();
    if (!r.ok) alerteDiscrete("La vérification n'a pas pu se faire. Réessaie dans un moment.");
  };
  const ca = $("#maj-alerte");
  if (ca)
    ca.onchange = async () => {
      ca.disabled = true;
      const r = await appel("POST", "/nouveautes/reglages", { alerte: ca.checked }).catch(() => ({ ok: false }));
      if (r.ok) MAJ.alerte = r.alerte;
      else ca.checked = !ca.checked;
      ca.disabled = false;
    };
}

// Petit message sous la carte des mises à jour (pas de fenêtre qui s'ouvre toute seule).
function alerteDiscrete(texte) {
  const z = $("#accueil-plateforme");
  if (z) z.insertAdjacentHTML("beforeend", `<p class="erreur">${e(texte)}</p>`);
}

const listeChangements = (n, total) =>
  n.length
    ? `<p class="sub">Ce qui a changé${total > n.length ? ` (les ${n.length} derniers sur ${total})` : ""} :</p><ul class="pf-liste">${n.map((c) => `<li><span>${e(c.titre)}</span>${c.date ? `<time>${e(dateFr(c.date))}</time>` : ""}</li>`).join("")}</ul>`
    : "";

// Nouvelle version d'un canal (Standard, Bêta…) : ce qui a changé, et les clients à mettre à jour.
function fenetreMajCanal(canal) {
  const k = MAJ?.canaux?.[canal];
  if (!k) return;
  const parNom = Object.fromEntries(CLIENTS.map((c) => [c.nom, c]));
  const lignes = k.clients
    .map((x) => {
      const c = parNom[x.nom];
      const et = x.suspendu ? `<span class="etiquette pause">en pause</span>` : x.enRetard > 0 ? `<span class="etiquette acc">${x.enRetard} changement${x.enRetard > 1 ? "s" : ""} en retard</span>` : x.enRetard === 0 ? `<span class="etiquette ok">à jour</span>` : `<span class="etiquette pause">inconnu</span>`;
      const bouton = c && !x.suspendu && x.enRetard !== 0 ? `<button class="btn petit${x.enRetard > 0 ? " principal" : ""}" type="button" data-maj-client="${e(x.nom)}">Mettre à jour</button>` : "";
      return `<div class="maj-ligne"><div><b>${e(x.nom)}</b><small>${e(c?.version ?? "—")}${x.installe ? ` · ${e(x.installe.slice(0, 7))}` : ""}</small></div>${et}${bouton}</div>`;
    })
    .join("");
  const n = k.aMettreAJour.length;
  ouvrir(
    `Clients ${nomCanal(canal)}`,
    `<p class="sub">${k.disponible ? `Dernière version prête : <span class="mono">${e(k.disponible.commit.slice(0, 7))}</span> du ${e(dateFr(k.disponible.date))}.` : "GitHub n'a pas encore été interrogé pour ce canal."}</p>
    ${listeChangements(k.changements, k.enRetard)}
    <div class="maj-lignes">${lignes || `<p class="sub">Aucun client sur ce canal.</p>`}</div>
    <p class="texte-aide visible">Chaque mise à jour fait une sauvegarde, puis redémarre le site du client (coupé environ une minute). Si la nouvelle version ne démarre pas, il revient tout seul sur sa version d'avant. Les clients en pause prendront la nouvelle version à leur réactivation.</p>
    ${n > 1 ? `<div class="pied"><button class="btn" id="maj-tous" type="button">Mettre à jour tous les clients (tous canaux)</button></div>` : ""}`,
  );
  $("#fenetre-corps").onclick = (ev) => {
    const b = ev.target.closest("[data-maj-client]");
    const c = b && parNom[b.dataset.majClient];
    if (c) action(c, "mettre-a-jour");
  };
  const t = $("#maj-tous");
  if (t) t.onclick = () => executer("Mise à jour de tous les clients", () => api("POST", "/tous/mettre-a-jour"));
}

function fenetreMajVitrine() {
  const vi = MAJ?.vitrine;
  if (!vi) return;
  const texte =
    vi.enRetard > 0
      ? listeChangements(vi.changements, vi.enRetard)
      : vi.enRetard === 0
        ? `<p class="sub">La vitrine est déjà à jour.</p>`
        : `<p class="sub">${vi.installe ? "GitHub n'a pas répondu : impossible de dire ce qui a changé." : "La version installée est inconnue (vitrine téléchargée avant cette vérification). Une mise à jour la rend lisible."}</p>`;
  ouvrir(
    "Mettre à jour la vitrine ?",
    `${texte}<p class="texte-aide visible">Télécharge la dernière version de la branche site-vitrine et la met en ligne en quelques secondes. Tes réglages (bandeau, adresse de la démo) sont gardés.</p>
    <div class="pied"><button class="btn principal" id="ok-maj-vitrine" type="button">Mettre à jour la vitrine</button></div>`,
  );
  $("#ok-maj-vitrine").onclick = () => executer("Mise à jour de la vitrine", () => api("POST", "/vitrine/maj"));
}

function fenetreMajPlateforme() {
  const p = PLATEFORME ?? {};
  const n = p.nouveautes;
  const liste = n?.changements?.length
    ? `<p class="sub">Ce qui a changé depuis ta version${n.enRetard > n.changements.length ? ` (les ${n.changements.length} derniers sur ${n.enRetard})` : ""} :</p><ul class="pf-liste">${n.changements.map((c) => `<li><span>${e(c.titre)}</span>${c.date ? `<time>${e(dateFr(c.date))}</time>` : ""}</li>`).join("")}</ul>`
    : n
      ? `<p class="sub">Aucune nouveauté sur GitHub : ta plateforme est déjà à jour. Tu peux quand même relancer l'installation (pour réparer, par exemple).</p>`
      : `<p class="sub">Impossible de demander à GitHub ce qui a changé. La mise à jour prendra quand même la dernière version.</p>`;
  const derniere = p.maj?.etat === "fini" ? `<p class="discret">Dernière mise à jour : ${p.maj.ok ? "réussie" : "échouée"}${p.maj.fin ? ` le ${e(heureFr(p.maj.fin))}` : ""}.${p.journal ? ` <button class="lien" type="button" id="pf-journal">Voir son journal</button>` : ""}</p><pre class="sortie journaux cache" id="pf-ancien">${e(p.journal ?? "")}</pre>` : "";
  ouvrir(
    "Mettre à jour la plateforme ?",
    `${liste}
    <p class="texte-aide visible">Le panel, la connexion et les outils redémarrent : le panel est coupé <b>5 à 10 minutes</b>, et l'écran de connexion des clients aussi pendant une ou deux minutes. Les sites des clients restent en ligne et gardent leur version (pour eux : Clients → Tout mettre à jour). La mise à jour continue même si tu fermes cette page.</p>
    ${derniere}
    <div class="pied"><button class="btn principal" id="ok-pf" type="button">Mettre à jour la plateforme</button></div>`,
  );
  const j = $("#pf-journal");
  if (j) j.onclick = () => $("#pf-ancien").classList.toggle("cache");
  $("#ok-pf").onclick = async () => {
    const avant = PLATEFORME?.maj?.debut ?? null;
    $("#ok-pf").disabled = true;
    const r = await appel("POST", "/plateforme/maj").catch((err) => ({ ok: false, sortie: String(err.message ?? err) }));
    if (!r.ok) {
      $("#fenetre-corps").innerHTML = `<p class="etiquette ko">Échec</p><pre class="sortie">${e(r.sortie || r.message || "Le moteur n'a pas pu lancer la mise à jour.")}</pre>`;
      return;
    }
    suivrePlateforme(avant);
  };
}

// Suit la mise à jour : le panel et le moteur redémarrent en route, donc on tolère que
// les appels échouent un moment. avant = date de début de la mise à jour précédente.
let suiviPf = 0;
async function suivrePlateforme(avant) {
  const jeton = (suiviPf += 1);
  if (avant === undefined) avant = PLATEFORME?.maj?.etat === "en-cours" ? null : PLATEFORME?.maj?.debut ?? null;
  ouvrir(
    "Mise à jour de la plateforme",
    `<p class="attente" id="pf-etat"><span class="rond"></span>Lancement…</p>
    <p class="texte-aide visible discret" id="pf-explication">Compte 5 à 10 minutes. Le panel va se couper puis revenir : cette fenêtre attend et reprend toute seule. Tu peux aussi la fermer, la mise à jour continue.</p>
    <pre class="sortie journaux" id="pf-log"></pre>`,
    () => {
      suiviPf += 1;
      charger();
    },
  );
  const debut = Date.now();
  let coupe = false;
  while (jeton === suiviPf) {
    await pause(4000);
    if (jeton !== suiviPf) return;
    let p = null;
    try {
      const r = await fetch("/api/plateforme", { headers: { "X-Panel": "1" } });
      if (r.ok) p = await r.json();
    } catch {
      p = null;
    }
    const zEtat = $("#pf-etat");
    if (!zEtat) return;
    if (!p) {
      coupe = true;
      zEtat.innerHTML = `<span class="rond"></span>Le panel redémarre, il revient dans un instant…`;
      continue;
    }
    PLATEFORME = p;
    const m = p.maj;
    const log = $("#pf-log");
    if (log && p.journal) {
      const enBas = log.scrollTop + log.clientHeight >= log.scrollHeight - 20;
      log.textContent = p.journal;
      if (enBas) log.scrollTop = log.scrollHeight;
    }
    const nouvelle = m && m.debut !== avant;
    if (nouvelle && m.etat === "fini") {
      zEtat.outerHTML = m.ok
        ? `<p class="etiquette ok">Réussi</p><p class="sub">La plateforme est à jour${p.version ? ` (version ${e(p.version.court)})` : ""}. Recharge la page pour avoir le nouveau panel.</p><div class="pied pied-gauche"><button class="btn principal" type="button" id="pf-recharger">Recharger la page</button></div>`
        : `<p class="etiquette ko">Échec</p><p class="sub">${m.interrompue ? "La mise à jour ne s'est jamais terminée (machine redémarrée en route ?)." : `L'installation s'est arrêtée (code ${e(m.code)}).`} Le journal ci-dessous dit pourquoi. Les sites des clients ne sont pas touchés.</p>`;
      $("#pf-explication")?.remove();
      const b = $("#pf-recharger");
      if (b) b.onclick = () => location.reload();
      return;
    }
    if (!nouvelle && Date.now() - debut > 60000) {
      zEtat.innerHTML = `<span class="rond"></span>La mise à jour n'a pas encore démarré. Si rien ne bouge, regarde le journal du panel.`;
      continue;
    }
    zEtat.innerHTML = `<span class="rond"></span>${nouvelle ? `En cours ${e(depuis(m.debut))}${coupe ? " (le panel a redémarré)" : ""}…` : "Lancement…"}`;
  }
}

// Pastilles du menu : à faire (urgent), support à répondre, demandes de la vitrine.
function afficherBadges() {
  const urgent = AFAIRE.filter((x) => x.niveau !== "acc").length;
  const support = (SUPPORT ?? []).filter((t) => t.statut === "ouvert").length;
  const vitrine = (VITRINE?.demandes ?? []).filter((d) => !d.traitee).length;
  const clients = CLIENTS.filter((c) => majDispo(c) > 0).length;
  const valeurs = { accueil: urgent, afaire: AFAIRE.length, support, vitrine, plus: vitrine, clients };
  document.querySelectorAll("[data-badge]").forEach((b) => {
    const v = valeurs[b.dataset.badge] ?? 0;
    b.textContent = v ? String(v) : "";
    b.dataset.v = String(v);
  });
}

// ------------------------------------------------------------ fiche d'un client (#client/<nom>/<onglet>)
let jetonVue = 0;
// Chaque nouvel affichage d'un onglet reçoit un numéro : une réponse arrivée trop tard
// (ou les journaux qui se rafraîchissent) ne remplit pas un onglet qu'on a quitté.
const vue = () => ++jetonVue;
const ONGLETS = [
  ["resume", "Résumé"],
  ["equipe", "Équipe"],
  ["sauvegardes", "Sauvegardes"],
  ["journaux", "Journaux"],
  ["reglages", "Réglages"],
  ["demo", "Démo"],
];

function ficheClient(nom, onglet, auto) {
  const z = $("#fiche");
  const c = CLIENTS.find((x) => x.nom === nom);
  if (!c) {
    vue();
    z.innerHTML = `<p class="fil-ariane"><a href="#clients">Clients</a> › ${e(nom)}</p><div class="vide">${CHARGE ? `Le client « ${e(nom)} » n'existe pas (ou plus).` : "Chargement…"} <a href="#clients">Retour aux clients</a></div>`;
    return;
  }
  const onglets = ONGLETS.filter(([k]) => (k !== "equipe" || c.connexion === "authentik") && (k !== "demo" || c.demo));
  if (!onglets.some(([k]) => k === onglet)) onglet = "resume";
  const tete = `<p class="fil-ariane"><a href="#clients">Clients</a> › ${e(c.nom)}</p>
    <div class="tete-page"><h1>${e(c.nom)}</h1>${etat(c)}
      <div class="droite"><a class="btn" href="${e(c.adresse)}" target="_blank" rel="noopener">Ouvrir son site ${ic("external", "s16")}</a>
      ${c.suspendu ? `<button class="btn principal" type="button" data-fiche-act="reactiver">Réactiver</button>` : `<button class="btn" type="button" data-fiche-act="mettre-a-jour">${ic("refresh", "s16")}Mettre à jour</button>`}
      <button class="aide" type="button" data-aide="f-a-maj" aria-label="Aide">?</button></div></div>
    <p class="texte-aide" id="f-a-maj"><b>Mettre à jour</b> : sauvegarde, puis dernière version ; si elle ne démarre pas, retour tout seul à la version et à la base d'avant. Son site est coupé environ une minute. <b>Réactiver</b> remet en ligne un client en pause.</p>
    <nav class="onglets" aria-label="Onglets du client">${onglets.map(([k, t]) => `<a href="#client/${e(c.nom)}/${k}" class="${k === onglet ? "on" : ""}"${k === onglet ? ' aria-current="page"' : ""}>${e(t)}${k === "equipe" && c.places ? ` <span class="n">${c.places.membres}</span>` : ""}</a>`).join("")}</nav>
    <div id="fiche-corps"></div>`;
  // Rafraîchissement automatique : on ne redessine pas un onglet en cours d'utilisation
  // (saisie, liste chargée, journaux qui défilent) ; seul le résumé suit les nouvelles données.
  const corps = $("#fiche-corps");
  const memeOnglet = z.dataset.vue === `${nom}/${onglet}` && corps;
  const saisie = document.activeElement && z.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  if (auto && memeOnglet && (onglet !== "resume" || saisie)) return;
  z.dataset.vue = `${nom}/${onglet}`;
  z.innerHTML = tete;
  const zc = $("#fiche-corps");
  if (onglet === "resume") ongletResume(c, zc);
  if (onglet === "equipe") ongletEquipe(c, zc);
  if (onglet === "sauvegardes") ongletSauvegardes(c, zc);
  if (onglet === "journaux") ongletJournaux(c, zc);
  if (onglet === "reglages") ongletReglages(c, zc);
  if (onglet === "demo") ongletDemo(c, zc);
}
$("#fiche").addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-fiche-act]");
  if (!b) return;
  const c = CLIENTS.find((x) => x.nom === location.hash.split("/")[1]);
  if (c) action(c, b.dataset.ficheAct, b.dataset.canal);
});

function ongletResume(c, z) {
  vue();
  const s = c.sauvegarde?.derniere;
  const sv = sauvegardeKo(c);
  const u = IA?.usage?.[c.nom]?.mois?.lectures ?? 0;
  const lim = IA ? (typeof IA.clients[c.nom] === "number" ? IA.clients[c.nom] : IA.defaut ?? 30) : null;
  const plein = c.places?.max && c.places.membres >= c.places.max;
  const tuiles = [
    ["Places", places(c), c.connexion !== "authentik" ? "connexion par Cloudflare" : plein ? "complet" : c.places?.max ? `${c.places.max - c.places.membres} de libre${c.places.max - c.places.membres > 1 ? "s" : ""}` : "pas de limite"],
    ["Version", `${e(c.version ?? "—")} <span class="canal">${e(nomCanal(c.canal))}</span>`, c.versionBloquee ? "dernière mise à jour ratée" : majDispo(c) > 0 ? `nouvelle version : ${c.maj.enRetard} changement${c.maj.enRetard > 1 ? "s" : ""}` : majDispo(c) === 0 && !c.suspendu ? "à jour" : "version installée"],
    ["Sauvegarde", s ? e(dateSauv(s.id).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })) : "aucune", sv === "test" ? "test de restauration raté" : c.sauvegarde?.test ? `testée le ${dateFr(c.sauvegarde.test.date)}` : "pas encore testée"],
    ["Offre", c.essaiFin ? (joursRestants(c.essaiFin) >= 0 ? `Essai : ${joursRestants(c.essaiFin)} j` : "Essai fini") : "Client", c.essaiFin ? `jusqu'au ${dateFr(c.essaiFin)}` : `depuis le ${dateFr(c.creeLe)}`],
    ["Lectures IA", lim === null ? "—" : lim === 0 ? "coupées" : `${u} / ${lim}`, "ce mois-ci"],
    ["Accès MCP", c.mcp ? "permis" : "coupé", c.mcp ? (c.mcpCle === false ? "connexion par compte seulement" : "compte ou clé secrète") : "réglable dans Réglages"],
    ["Disponibilité", SANTE ? pct(SANTE.disponibilite?.[`client:${c.nom}`] ?? 100) : "—", "sur 30 jours"],
    ["Comptes actifs", SANTE?.clients?.[c.nom]?.usage ? e(SANTE.clients[c.nom].usage.comptes) : "—", SANTE?.clients?.[c.nom]?.usage ? `dernière visite ${depuisFr(SANTE.clients[c.nom].usage.derniereActivite)}` : ""],
  ];
  // Les demandes de support ont leur propre liste juste en dessous.
  const aFaire = AFAIRE.map((x, i) => [x, i]).filter(([x]) => x.client === c.nom && x.icone !== "chat");
  const tickets = (SUPPORT ?? []).filter((t) => t.client === c.nom && t.statut !== "ferme");
  const journal = JOURNAL.map((l, i) => [l, i]).filter(([l]) => l.client === c.nom).slice(0, 8);
  const [cnAide, cnTexte] = aideB("f-a-canal", AIDE_CANAL);
  const [zsAide, zsTexte] = aideB("f-a-zs", "Rien ne part sans confirmation. <b>Pause</b> : son site affiche « en pause », rien n'est effacé, « Réactiver » le remet en ligne. <b>Supprimer</b> : son site s'arrête et ses données partent dans une archive sur la machine (/srv/recipelog/archives) ; il faut taper son nom pour confirmer.");
  z.innerHTML = `<div class="kv">${tuiles.map(([l, v, s]) => `<div><span class="lbl-mono">${e(l)}</span><b>${v}</b><small>${e(s)}</small></div>`).join("")}</div>
    ${aFaire.length ? `<h2>À regarder</h2><div class="afaire">${aFaire.map(([x, i]) => ligneAFaire(x, i)).join("")}</div>` : ""}
    ${tickets.length ? `<h2>Demandes de support</h2><div class="demandes">${tickets.map((t) => `<article class="demande"><div><span class="etiquette ${(STATUTS[t.statut] ?? [, "acc"])[1]}">${e((STATUTS[t.statut] ?? [t.statut])[0])}</span> ${e(t.email)}<small>${e(heureFr(t.maj))}</small><p>${e(t.messages.at(-1).texte.slice(0, 200))}</p></div><div class="actions"><button class="btn petit principal" type="button" data-ticket-ouvrir="${e(t.id)}">Ouvrir</button></div></article>`).join("")}</div>` : ""}
    <h2>Dernières actions</h2><div class="boite"><div class="evts">${evts(journal)}</div></div>
    <h2>Version de l'appli ${cnAide}</h2>${cnTexte}
    <div class="ligne-zs"><div><b>${e(nomCanal(c.canal))}</b><small>${c.canal === "beta-instance" ? "Reçoit la bêta : les nouveautés pas encore données aux autres clients." : c.canal === "instance" ? "La version de tous les clients." : "Ancienne version : passe-le en standard ou en bêta."}</small></div>
      <div class="actions">${c.canal !== "beta-instance" ? `<button class="btn" type="button" data-fiche-act="canal" data-canal="beta-instance">Passer en bêta</button>` : ""}${c.canal !== "instance" ? `<button class="btn" type="button" data-fiche-act="canal" data-canal="instance">${c.canal === "beta-instance" ? "Repasser en standard" : "Passer en standard"}</button>` : ""}</div></div>
    <section class="zone-sensible"><h2 class="sec-t">Zone sensible ${zsAide}</h2>${zsTexte}
      <div class="ligne-zs"><div><b>${c.suspendu ? "Réactiver" : "Mettre en pause"}</b><small>${c.suspendu ? "Remet son site en ligne en une minute." : "Son site affiche « en pause ». Rien n'est effacé."}</small></div>
        <button class="btn" type="button" data-fiche-act="${c.suspendu ? "reactiver" : "suspendre"}">${c.suspendu ? "Réactiver" : "Mettre en pause"}</button></div>
      <div class="ligne-zs"><div><b>Supprimer ce client</b><small>Arrête son site, archive ses données et retire ses accès.</small></div>
        <button class="btn danger" type="button" data-fiche-act="supprimer">${ic("trash", "s16")}Supprimer…</button></div>
    </section>`;
  z.querySelectorAll("[data-ticket-ouvrir]").forEach((b) => b.addEventListener("click", () => fenetreTicket(c.nom, b.dataset.ticketOuvrir)));
}

// ------------------------------------------------------------ navigation (adresse après #)
const TITRES = { accueil: "Accueil", clients: "Clients", client: "Client", support: "Support", maintenance: "Maintenance et messages", vitrine: "Site vitrine", vente: "Tarifs et textes légaux", ia: "Factures par IA", sante: "Santé de la machine", journal: "Journal" };
let CHARGE = false;
let pageAvant = "";
function rendre(auto = false) {
  const [p0, nom, onglet] = decodeURIComponent(location.hash.slice(1)).split("/");
  const page = Object.hasOwn(TITRES, p0) ? p0 : "accueil";
  document.querySelectorAll(".page").forEach((s) => s.classList.toggle("on", s.dataset.page === page));
  const actif = page === "client" ? "clients" : page;
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const on = a.dataset.nav === actif || (a.dataset.nav === "plus" && !["accueil", "clients", "support"].includes(actif));
    a.classList.toggle("on", on);
    if (a.tagName === "A") a.toggleAttribute("aria-current", on);
  });
  document.title = `${page === "client" && nom ? nom : TITRES[page]} · Panel RecipeLog`;
  if (CHARGE) {
    afficherAccueil();
    afficherBadges();
  }
  if (page === "client") ficheClient(nom ?? "", onglet ?? "resume", auto);
  const cle = `${page}/${nom ?? ""}/${onglet ?? ""}`;
  if (cle !== pageAvant && !auto) window.scrollTo(0, 0);
  pageAvant = cle;
}
window.addEventListener("hashchange", () => rendre());

// ------------------------------------------------------------ « Plus » (téléphone) et apparence
$("#bouton-plus").addEventListener("click", () => {
  const n = (VITRINE?.demandes ?? []).filter((d) => !d.traitee).length;
  ouvrir(
    "Plus",
    `<div class="plus-tuiles">
      <a href="#maintenance">${ic("wrench", "s22")}Maintenance et messages</a>
      <a href="#vitrine">${ic("compass", "s22")}Site vitrine${n ? `<span class="n">${n}</span>` : ""}</a>
      <a href="#vente">${ic("ticket", "s22")}Tarifs et textes légaux</a>
      <a href="#ia">${ic("sparkle", "s22")}Factures par IA</a>
      <a href="#sante">${ic("signal", "s22")}Santé de la machine</a>
      <a href="#journal">${ic("list", "s22")}Journal</a>
      <a href="https://status.${e(DOMAINE)}" target="_blank" rel="noopener">${ic("external", "s22")}Page de statut</a>
      <button type="button" data-apparence>${ic("palette", "s22")}Apparence</button>
      <a href="/auth/deconnexion">${ic("logout", "s22")}Se déconnecter</a>
    </div>`,
  );
  // Choisir une page ferme la feuille (c'est la seule exception à « la croix seulement » : on part ailleurs).
  $("#fenetre-corps").querySelectorAll("a[href^='#']").forEach((a) => a.addEventListener("click", () => $("#croix").click()));
});

const ACCENTS = [["lavande", "Lavande"], ["or", "Or"], ["ambre", "Ambre"], ["corail", "Corail"], ["menthe", "Menthe"]];
function lirePrefs() {
  try {
    return JSON.parse(localStorage.getItem("encre-apparence") || "{}");
  } catch {
    return {};
  }
}
function appliquerPrefs(p) {
  const h = document.documentElement;
  if (p.accent) h.dataset.accent = p.accent;
  else delete h.dataset.accent;
  if (p.theme === "sombre") h.dataset.theme = "dark";
  else if (p.theme === "clair") h.dataset.theme = "light";
  else delete h.dataset.theme;
  try {
    localStorage.setItem("encre-apparence", JSON.stringify(p));
  } catch {
    /* navigation privée : le choix vaut pour cette visite */
  }
}
function fenetreApparence() {
  const dessiner = () => {
    const q = lirePrefs();
    $("#fenetre-corps").innerHTML = `<p class="sub">Gardé sur cet appareil seulement.</p>
      <div class="champ"><label>Thème</label><div class="seg" role="group" aria-label="Thème">${[["auto", "Automatique"], ["clair", "Clair"], ["sombre", "Sombre"]].map(([k, t]) => `<button type="button" data-theme-choix="${k}" class="${(q.theme ?? "auto") === k ? "on" : ""}" aria-pressed="${(q.theme ?? "auto") === k}">${t}</button>`).join("")}</div></div>
      <div class="champ"><label>Couleur d'accent</label><div class="pastilles">${ACCENTS.map(([k, t]) => `<button type="button" class="past${(q.accent ?? "lavande") === k ? " on" : ""}" data-v="${k}" aria-pressed="${(q.accent ?? "lavande") === k}"><i></i>${t}</button>`).join("")}</div></div>`;
  };
  ouvrir("Apparence", "");
  dessiner();
  $("#fenetre-corps").onclick = (ev) => {
    const t = ev.target.closest("[data-theme-choix]");
    const a = ev.target.closest(".past");
    if (!t && !a) return;
    const q = { ...lirePrefs() };
    if (t) q.theme = t.dataset.themeChoix === "auto" ? undefined : t.dataset.themeChoix;
    if (a) q.accent = a.dataset.v === "lavande" ? undefined : a.dataset.v;
    appliquerPrefs(q);
    dessiner();
  };
}
document.addEventListener("click", (ev) => {
  if (ev.target.closest("[data-apparence]")) fenetreApparence();
});

const NOMS_ACTIONS = {
  "plateforme-maj": "a lancé la mise à jour de la",
  "nouveautes-alerte": "a changé les messages « nouvelle version » de la",
  creer: "a créé",
  "mettre-a-jour": "a mis à jour",
  canal: "a changé la version de",
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
  "sauvegardes-controle": "a vérifié les sauvegardes :",
  "alerte-essai": "a essayé les alertes",
  annulation: "a prévenu de l'annulation :",
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
  "ia-factures": "a changé les factures en photo de",
  "ia-cle": "a changé la clé Claude de la",
  "ia-cle-retiree": "a retiré la clé Claude de la",
  vente: "a changé les tarifs et textes légaux de la",
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
      const plus = d.fin !== undefined ? ` (…${e(d.fin)})` : d.texte !== undefined ? ` (${d.texte ? `« ${e(d.texte)} »` : "retiré"})` : d.sauvegarde ? ` (${e(dateSauv(d.sauvegarde).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }))})` : d.email ? ` (${e(d.email)})` : d.max !== undefined ? ` (${d.max || "pas de plafond"})` : d.jours !== undefined ? ` (${d.jours ? `${d.jours} j` : "fin"})` : d.mcp !== undefined || d.mcpCle !== undefined ? ` (${[d.mcp !== undefined ? `MCP ${d.mcp ? "permis" : "coupé"}` : "", d.mcpCle !== undefined ? `clé secrète ${d.mcpCle ? "permise" : "coupée"}` : ""].filter(Boolean).join(", ")})` : "";
      return `<div class="ligne"><time>${heureFr(l.date)}</time><span class="qui">${e(l.qui)}</span>
        <span>${e(NOMS_ACTIONS[l.action] ?? l.action)} <b>${e(l.client)}</b>${plus} ${l.ok ? "" : `<span class="etiquette ko">échec</span>`}</span>
        <button type="button" data-journal="${i}">Détails</button></div>`;
    })
    .join("");
}
document.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-journal]");
  if (!b) return;
  const l = JOURNAL[Number(b.dataset.journal)];
  ouvrir(`Détails : ${l.client}`, `<p class="sub">${e(heureFr(l.date))} · ${e(l.qui)}</p><pre class="sortie">${e(l.sortie || "(rien à afficher)")}</pre>`);
});

async function charger(options = {}) {
  const [c, j, v, sa, su, an, ia, ve, pf, nv] = await Promise.all([api("GET", "/clients"), api("GET", "/journal"), api("GET", "/vitrine"), api("GET", "/mesures"), api("GET", "/support"), api("GET", "/annonces"), api("GET", "/ia"), api("GET", "/vente"), api("GET", "/plateforme"), api("GET", "/nouveautes")]);
  IA = ia.usage ? ia : null;
  VENTE = ve.offres ? ve : null;
  PLATEFORME = "maj" in pf ? pf : null;
  MAJ = nv.canaux ? nv : null;
  VITRINE = v.demandes ? v : null;
  afficherVitrine();
  SANTE = sa.machine ? sa : null;
  SUPPORT = su.demandes ?? null;
  afficherSupport();
  ANNONCES = an.maintenances ? an : null;
  if (c.canal) CANAL = c.canal;
  if (c.clients) CLIENTS = c.clients.sort((a, b) => a.nom.localeCompare(b.nom));
  else $("#clients").innerHTML = `<div class="vide">Liste indisponible : ${e(c.message ?? "le moteur ne répond pas")}</div>`;
  JOURNAL = j.journal ?? [];
  if (c.clients) afficher();
  afficherAnnonces();
  afficherIA();
  afficherVente();
  afficherSante();
  afficherJournal();
  CHARGE = true;
  rendre(Boolean(options.auto));
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
      <div class="champ"><label for="n-canal">Version ${aide("a-canal", AIDE_CANAL)}
        <select id="n-canal">${["instance", "beta-instance"].map((v) => `<option value="${v}"${v === CANAL ? " selected" : ""}>${nomCanal(v)}${v === CANAL ? " (conseillé)" : ""}</option>`).join("")}</select></div>
      <div class="champ"><label class="case"><input id="n-mcp" type="checkbox" checked> Accès MCP (Claude) ${aide("a-mcp", "Permet au client de brancher Claude sur son RecipeLog (Réglages → Accès MCP). Décoché : le menu disparaît chez lui et l'adresse MCP est fermée.")}</div>
      <div class="champ"><label class="case"><input id="n-mcp-cle" type="checkbox"> Clé secrète MCP ${aide("a-mcp-cle", "Ancienne façon de brancher Claude : une clé à copier dans claude.ai (utile pour Claude Code). Décoché : la section Clé secrète disparaît chez le client et une ancienne clé ne marche plus ; Claude se branche seulement avec un compte du client (« Se connecter » dans claude.ai). Conseillé : décoché.")}</div>
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
      mcpCle: $("#n-mcp-cle").checked,
    };
    if (!/^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/.test(corps.nom)) return ($("#n-erreur").textContent = "Nom : 2 à 32 caractères, minuscules, chiffres et tirets.");
    if (CLIENTS.some((c) => c.nom === corps.nom)) return ($("#n-erreur").textContent = "Ce client existe déjà.");
    if (corps.responsable && !/^\S+@\S+\.\S+$/.test(corps.responsable)) return ($("#n-erreur").textContent = "Adresse du responsable invalide.");
    const r = await executer(`Création de ${corps.nom}`, () => api("POST", "/clients", corps));
    if (r.ok && apres) await apres();
  });
}

$("#tout-maj").addEventListener("click", () => {
  ouvrir(
    "Mettre à jour tous les clients ?",
    `<p class="sub">Chaque client est mis à jour l'un après l'autre : sauvegarde, nouvelle version, redémarrage (son site est coupé environ une minute). Compte 2 à 3 minutes par client.</p>
    <p class="texte-aide visible">Si la nouvelle version ne démarre pas chez un client, il est remis tout seul sur sa version et sa base d'avant, et la mise à jour s'arrête là : les clients suivants gardent leur version. Les clients en pause prendront la nouvelle version à leur réactivation.</p>
    <div class="pied"><button class="btn principal" id="ok-tout-maj" type="button">Tout mettre à jour</button></div>`,
  );
  $("#ok-tout-maj").addEventListener("click", () => executer("Mise à jour de tous les clients", () => api("POST", "/tous/mettre-a-jour")));
});

// ------------------------------------------------------------ actions d'un client
// Elles partent de sa fiche (#client/<nom>) ou de l'accueil.
function action(c, act, canal) {
  if (act === "mettre-a-jour") executer(`Mise à jour de ${c.nom}`, () => api("POST", `/clients/${c.nom}/mettre-a-jour`));
  if (act === "reactiver") {
    if (c.essaiFini) fenetreReactiver(c);
    else executer(`Réactivation de ${c.nom}`, () => api("POST", `/clients/${c.nom}/reactiver`));
  }
  if (act === "suspendre") fenetrePause(c);
  if (act === "supprimer") fenetreSuppression(c);
  if (act === "canal") fenetreCanal(c, canal);
  if (act === "sauvegarder") executer(`Sauvegarde de ${c.nom}`, () => api("POST", `/clients/${c.nom}/sauvegarder`));
}

// Changer la version (canal) d'un client : sauvegarde, nouvelle version, retour arrière si ça rate.
function fenetreCanal(c, canal) {
  if (!NOMS_CANAUX[canal]) return;
  ouvrir(
    canal === "beta-instance" ? `Passer ${c.nom} en bêta ?` : `Passer ${c.nom} en standard ?`,
    `<p class="sub">${canal === "beta-instance" ? `${e(c.nom)} recevra la bêta : les nouveautés en cours, avant les autres clients.` : `${e(c.nom)} reprend la version standard, celle de tous les clients.`}</p>
    <p class="texte-aide visible">Son site est sauvegardé, puis redémarre sur cette version (environ une minute). Si elle ne démarre pas, il revient tout seul sur sa version d'avant.</p>
    <div class="pied"><button class="btn principal" id="ok-canal" type="button">${canal === "beta-instance" ? "Passer en bêta" : "Passer en standard"}</button></div>`,
  );
  $("#ok-canal").addEventListener("click", () => executer(`${c.nom} passe en ${nomCanal(canal).toLowerCase()}`, () => api("POST", `/clients/${c.nom}/canal`, { canal })));
}

const ETIQUETTES = { auto: "Nuit", manuelle: "À la main", "avant-restauration": "Avant restauration" };
async function ongletSauvegardes(c, z) {
  const moi = vue();
  z.innerHTML = `<p class="attente"><span class="rond"></span>Chargement…</p>`;
  const r = await api("GET", `/clients/${c.nom}/sauvegardes`);
  if (moi !== jetonVue) return;
  if (!r.sauvegardes) {
    z.innerHTML = `<p class="erreur">${e(r.message ?? "Sauvegardes indisponibles.")}</p>`;
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
  z.innerHTML = `<p class="sub">Chaque nuit vers 3 h, la base, les photos et les factures de ${e(c.nom)} sont sauvegardées sur la machine. On garde les 7 derniers jours, puis une par semaine pendant 4 semaines et une par mois pendant 6 mois. ${aide("sv-a", "Ces sauvegardes sont sur le disque de la VM. La copie hors de la machine, c'est ta sauvegarde Proxmox Backup Server vers OVH : elle emporte toute la VM, sauvegardes comprises.")}</p>
    ${test}
    <div class="barre serree"><button class="btn principal" type="button" id="sv-maintenant">Sauvegarder maintenant</button><button class="btn" type="button" id="sv-tester">Tester la dernière</button>
    <button class="aide" type="button" data-aide="sv-a2" aria-label="Aide">?</button></div>
    <p class="texte-aide" id="sv-a2"><b>Tester</b> recharge la dernière sauvegarde dans une base à part, compte ses recettes et vérifie les fichiers, sans toucher au site du client. <b>Télécharger</b> donne une archive avec la base et les fichiers, sans aucun mot de passe : à garder ou à remettre au client.</p>
    <div class="membres">${lignes}</div>`;
  $("#sv-maintenant").addEventListener("click", () => executer(`Sauvegarde de ${c.nom}`, () => api("POST", `/clients/${c.nom}/sauvegarder`)));
  $("#sv-tester").addEventListener("click", () => executer(`Test de la sauvegarde de ${c.nom}`, () => api("POST", `/clients/${c.nom}/tester-sauvegarde`)));
  z.querySelectorAll("[data-s=restaurer]").forEach((b) =>
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

// Essai terminé : réactiver sans rien choisir le remettrait en pause dans l'heure.
function fenetreReactiver(c) {
  ouvrir(
    `Réactiver ${c.nom}`,
    `<p class="sub">L'essai de ${e(c.nom)} est terminé depuis le ${e(dateFr(c.essaiFin))}. Choisis la suite :</p>
    <div class="champ"><label for="ra-jours">Prolonger l'essai ${aide("ra-a", "Le site rouvre et l'essai repart pour ce nombre de jours à partir d'aujourd'hui. À la fin, il se remettra en pause tout seul.")}
      <div class="suffixe"><input id="ra-jours" type="number" min="1" max="3650" value="14"><span>jours</span></div></div>
    <div class="pied pied-gauche"><button class="btn" id="ra-prolonger" type="button">Réactiver et prolonger l'essai</button></div>
    <div class="champ"><label>Ou en faire un client normal ${aide("ra-a2", "Le site rouvre et ce n'est plus un essai : plus de pause automatique.")}</div>
    <div class="pied pied-gauche"><button class="btn principal" id="ra-client" type="button">Réactiver comme client</button></div>
    <p class="erreur" id="ra-erreur"></p>`,
  );
  $("#ra-prolonger").addEventListener("click", () => {
    const jours = Number($("#ra-jours").value);
    if (!Number.isInteger(jours) || jours < 1 || jours > 3650) return ($("#ra-erreur").textContent = "Nombre de jours invalide.");
    executer(`Réactivation de ${c.nom}`, () => api("POST", `/clients/${c.nom}/reactiver`, { essai: jours }));
  });
  $("#ra-client").addEventListener("click", () => executer(`Réactivation de ${c.nom}`, () => api("POST", `/clients/${c.nom}/reactiver`, {})));
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

function ongletReglages(c, z) {
  vue();
  const max = c.places?.max ?? 0;
  const jours = c.essaiFin ? Math.max(joursRestants(c.essaiFin), 0) : 0;
  z.innerHTML = `<form id="f-reglages" class="formulaire" novalidate>
      ${c.connexion === "authentik" ? `<div class="champ"><label for="r-max">Nombre de comptes ${aide("r-a-max", "Combien de personnes de son équipe peuvent se connecter. 0 = pas de limite. Baisser sous le nombre actuel ne retire personne : il ne pourra juste plus inviter.")}
        <input id="r-max" type="number" min="0" max="10000" value="${max}"></div>` : ""}
      <div class="champ"><label for="r-essai">Essai : jours restants ${aide("r-a-essai", "Change la fin de l'essai à partir d'aujourd'hui. 0 = ce n'est plus un essai (client normal, plus de pause automatique). Un client mis en pause par la fin d'essai se rouvre avec « Réactiver ».")}
        <div class="suffixe"><input id="r-essai" type="number" min="0" max="3650" value="${jours}"><span>${c.essaiFin ? `jusqu'au ${e(dateFr(c.essaiFin))}` : "pas d'essai"}</span></div></div>
      <div class="champ"><label class="case"><input id="r-mcp" type="checkbox" ${c.mcp ? "checked" : ""}> Accès MCP (Claude) ${aide("r-a-mcp", "Permet au client de brancher Claude sur son RecipeLog. Changer cette case redémarre son site (environ une minute).")}</div>
      <div class="champ"><label class="case"><input id="r-mcp-cle" type="checkbox" ${c.mcpCle !== false ? "checked" : ""}> Clé secrète MCP ${aide("r-a-mcp-cle", "Ancienne façon de brancher Claude : une clé à copier dans claude.ai (utile pour Claude Code). Décoché : la section Clé secrète disparaît chez le client et une ancienne clé ne marche plus ; Claude se branche seulement avec un compte du client (« Se connecter » dans claude.ai). Changer cette case redémarre son site (environ une minute).")}</div>
      <p class="erreur" id="r-erreur"></p>
      <div class="pied"><button class="btn principal" type="submit">Enregistrer</button></div>
    </form>`;
  $("#f-reglages").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const etapes = [];
    const nMax = $("#r-max") ? Number($("#r-max").value || 0) : max;
    const nJours = Number($("#r-essai").value || 0);
    const nMcp = $("#r-mcp").checked;
    const nMcpCle = $("#r-mcp-cle").checked;
    if ($("#r-max") && nMax !== max) etapes.push(["Places", () => api("POST", `/clients/${c.nom}/quota`, { max: nMax })]);
    // Essai déjà fini (0 jour restant) : mettre 0 le retire pour de bon, c'est bien un changement.
    if (nJours !== jours || (c.essaiFin && nJours === 0)) etapes.push(["Essai", () => api("POST", `/clients/${c.nom}/essai`, { jours: nJours })]);
    const mcpCle = c.mcpCle !== false;
    if (nMcp !== c.mcp || nMcpCle !== mcpCle) {
      const corps = {};
      if (nMcp !== c.mcp) corps.mcp = nMcp;
      if (nMcpCle !== mcpCle) corps.mcpCle = nMcpCle;
      etapes.push(["MCP", () => api("POST", `/clients/${c.nom}/options`, corps)]);
    }
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

async function ongletEquipe(c, z) {
  const moi = vue();
  if (!z.firstElementChild) z.innerHTML = `<p class="attente"><span class="rond"></span>Chargement…</p>`;
  const r = await api("GET", `/clients/${c.nom}/equipe`);
  if (moi !== jetonVue) return;
  if (!r.membres) {
    z.innerHTML = `<p class="erreur">${e(r.message ?? "Équipe indisponible.")}</p>`;
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
  z.innerHTML = `<p class="sub">${r.membres.length} / ${r.max ?? "∞"} places. Le responsable gère aussi son équipe lui-même, dans Réglages → Comptes.</p>
    <div class="membres">${lignes}</div>
    <form id="f-inviter" class="formulaire" novalidate><div class="champ"><label for="i-email">Inviter quelqu'un ${aide("i-a", "Crée son compte et lui envoie l'email « Choisis ton mot de passe ». À sa première connexion, il demande l'accès et le responsable l'accepte dans Réglages → Comptes. Pour lui donner un rôle tout de suite, mieux vaut que le responsable l'invite depuis son RecipeLog.")}
      <div class="suffixe"><input id="i-email" type="email" autocapitalize="none" placeholder="prenom@exemple.fr"><button class="btn principal" type="submit">Inviter</button></div></div>
      <p class="erreur" id="i-erreur"></p></form>`;
  $("#f-inviter").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const email = $("#i-email").value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return ($("#i-erreur").textContent = "Adresse invalide.");
    $("#i-erreur").textContent = "Envoi…";
    const x = await api("POST", `/clients/${c.nom}/inviter`, { email });
    if (!x.ok) return ($("#i-erreur").textContent = (x.sortie || x.message || "Échec").replace(/^❌\s*/, ""));
    ongletEquipe(c, z);
  });
  z.querySelectorAll("[data-m]").forEach((b) =>
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
        ongletEquipe(c, z);
      }
    }),
  );
}

charger();
setInterval(() => {
  if (!voile.classList.contains("ouvert") && !document.hidden) charger({ auto: true });
}, 30000);

// ------------------------------------------------------------ démo
function ongletDemo(c, z) {
  vue();
  z.innerHTML = `<div class="formulaire"><p class="sub">Les visiteurs peuvent tout essayer sur la démo ; chaque nuit vers 4 h 30, elle revient toute seule à son état de référence.</p>
    <div class="champ"><label>Remettre à zéro maintenant ${aide("d-a1", "Recharge l'état de référence tout de suite : tout ce que les visiteurs ont changé depuis disparaît. Le site est coupé une minute.")}</div>
    <div class="pied pied-gauche"><button class="btn" id="d-remettre" type="button">Remettre à zéro</button></div>
    <div class="champ"><label>Garder l'état actuel comme référence ${aide("d-a2", "Prépare d'abord la démo comme tu veux la montrer (recettes, fournisseurs, photos), puis clique ici : c'est cet état qui reviendra chaque nuit.")}</div>
    <div class="pied pied-gauche"><button class="btn principal" id="d-figer" type="button">Figer comme référence</button></div></div>`;
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
  // Pas de réaffichage pendant qu'on écrit le bandeau (le rafraîchissement effaçait la saisie).
  if (document.activeElement?.id === "v-bandeau") return;
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
      <div class="ligne-vitrine"><div><b>${e(DOMAINE)}</b><small>${VITRINE.version ? `Version ${e(VITRINE.commit ? VITRINE.commit.slice(0, 7) : VITRINE.version)}` : "Pas encore téléchargée"}${MAJ?.vitrine?.enRetard > 0 ? ` <span class="etiquette acc">nouvelle version : ${MAJ.vitrine.enRetard} changement${MAJ.vitrine.enRetard > 1 ? "s" : ""}</span>` : ""}</small></div>
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
  $("#v-maj").addEventListener("click", () => (MAJ?.vitrine ? fenetreMajVitrine() : executer("Mise à jour de la vitrine", () => api("POST", "/vitrine/maj"))));
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
    if (r.ok) {
      $("#v-bandeau").blur();
      charger();
    }
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
    // Résultat canal par canal (Telegram, Discord, email) : on voit lequel ne marche pas.
    $("#sa-erreur").textContent = r.sortie || r.message || (r.ok ? "" : "Échec.");
    $("#sa-erreur").style.whiteSpace = "pre-line";
    if (r.ok) ev.target.textContent = "Envoyée ✓";
  });
}

// ------------------------------------------------------------ journaux d'un client
function ongletJournaux(c, z) {
  let suivre = true;
  const moi = vue();
  z.innerHTML = `<p class="sub">Les 300 dernières lignes écrites par son RecipeLog (démarrage, erreurs, connexions). Rafraîchi toutes les 3 secondes. ${aide("jx-a", "Utile quand un client signale un problème : cherche les lignes « Error » au moment où il a eu le souci. Les heures sont en UTC (une heure de moins qu'en France l'hiver, deux l'été).")}</p>
    <div class="barre serree"><label class="case"><input type="checkbox" id="jx-suivre" checked> Suivre en direct</label></div>
    <pre class="sortie journaux" id="jx-sortie">Chargement…</pre>`;
  $("#jx-suivre").addEventListener("change", (ev) => (suivre = ev.target.checked));
  const tour = async () => {
    if (jetonVue !== moi) return;
    if (suivre) {
      const r = await api("GET", `/clients/${c.nom}/journaux`).catch(() => ({ lignes: "Le moteur ne répond pas." }));
      if (jetonVue !== moi) return;
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
  const fDef = { attente: IA.factures?.defaut?.attente ?? 30, pages: IA.factures?.defaut?.pages ?? 10 };
  const fClient = (nom) => {
    const c = IA.factures?.clients?.[nom] ?? {};
    return { attente: c.attente ?? fDef.attente, pages: c.pages ?? fDef.pages, propre: c.attente != null || c.pages != null };
  };
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
        <td>${(() => { const f = fClient(nom); return f.attente === 0 ? `<span class="etiquette pause">coupées</span>` : `${nombreFr(f.attente)} · ${nombreFr(f.pages)} p.${f.propre ? " (à part)" : ""}`; })()}</td>
        <td>${nombreFr(u.mois.entree)} / ${nombreFr(u.mois.sortie)}</td>
        <td>${dollars(u.mois.cout)}</td>
        <td>${nombreFr(u.precedent.lectures)} · ${dollars(u.precedent.cout)}</td>
        <td><button class="btn petit" type="button" data-ia="${e(nom)}">Régler</button></td></tr>`;
    })
    .join("");
  zone.innerHTML = `<div class="barre serree">
      <span class="etiquette ${IA.cle ? "ok" : "pause"}">${IA.cle ? `Clé Claude de la plateforme réglée${IA.cleInfo?.fin ? ` (${e(IA.cleInfo.fin)})` : IA.cleInfo?.source === "installation" ? " (à l'installation)" : ""}` : "Pas de clé Claude : les clients doivent mettre la leur"}</span>
      <button class="btn${IA.cle ? "" : " principal"}" type="button" id="ia-cle">${IA.cle ? "Changer la clé" : "Mettre une clé Claude"}</button>
      <span class="sub">Par défaut : <b>${nombreFr(defaut)}</b> lectures par mois, <b>${nombreFr(fDef.attente)}</b> factures en attente de <b>${nombreFr(fDef.pages)}</b> pages au plus</span>
      <button class="btn" type="button" id="ia-defaut">Changer le défaut</button>
      <button class="aide" type="button" data-aide="ia-a" aria-label="Aide">?</button></div>
    <p class="texte-aide" id="ia-a">Dans leur RecipeLog, tes clients prennent une facture en photo ou en PDF et l'IA la recopie en lignes de prix à vérifier. Avec ta clé Claude (bouton « Mettre une clé Claude » ou « Changer la clé »), chaque lecture compte dans leur quota du mois, remis à zéro le 1er. 0 = lecture par IA coupée pour ce client (il peut toujours mettre sa propre clé Claude, ChatGPT ou Gemini dans ses réglages : elle ne passe pas par toi et ne compte pas ici). Le coût est une estimation au prix de Claude Opus 5.5 (4 $ par million de jetons lus, 20 $ par million écrits). Colonne « Factures en photo » : avec « Nouvelle facture », le client prend une facture en photo depuis son téléphone et peut la garder « à traiter » pour plus tard ; le premier nombre dit combien peuvent attendre en même temps (0 = fonction coupée), le second combien de pages (photos) par facture. Ces photos prennent de la place sur la machine jusqu'à ce qu'elles soient lues.</p>
    <div class="tableau-sante"><table><thead><tr><th>Client</th><th>Lectures ce mois-ci (${e(IA.mois)})</th><th>Quota</th><th>Factures en photo</th><th>Jetons lus / écrits</th><th>Coût estimé</th><th>Mois dernier</th><th></th></tr></thead>
    <tbody>${lignes || `<tr><td colspan="8">Aucun client.</td></tr>`}</tbody>
    <tfoot><tr><td>Total</td><td>${nombreFr(total.lectures)}</td><td></td><td></td><td></td><td>${dollars(total.cout)}</td><td></td><td></td></tr></tfoot></table></div>`;
  $("#ia-defaut").addEventListener("click", () => fenetreQuotaIA("*", defaut, fDef));
  $("#ia-cle").addEventListener("click", fenetreCleIA);
  zone.querySelectorAll("[data-ia]").forEach((b) =>
    b.addEventListener("click", () =>
      fenetreQuotaIA(b.dataset.ia, typeof IA.clients[b.dataset.ia] === "number" ? IA.clients[b.dataset.ia] : null, IA.factures?.clients?.[b.dataset.ia] ?? {}),
    ),
  );
}

// Clé Claude de la plateforme : on la tape, le moteur l'essaie chez Anthropic puis la garde.
// Elle ne revient jamais dans le navigateur (seulement ses 4 derniers caractères).
function fenetreCleIA() {
  const info = IA.cleInfo ?? { source: null };
  const depuis = info.depuis ? new Date(info.depuis).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : null;
  const actuelle =
    info.source === "panel"
      ? `<p class="sub">Clé actuelle : <b>${e(info.fin)}</b>${depuis ? `, mise le ${e(depuis)}` : ""}.${info.installationAussi ? " Si tu la retires, la clé mise à l'installation reprend." : ""}</p>`
      : info.source === "installation"
        ? `<p class="sub">Clé actuelle : celle mise à l'installation (IA_ANTHROPIC_CLE). Une clé mise ici passe avant elle.</p>`
        : `<p class="sub">Aucune clé pour l'instant : seuls les clients qui ont mis leur propre clé peuvent lire leurs factures par IA.</p>`;
  ouvrir(
    "Clé Claude de la plateforme",
    `<form id="f-cle" novalidate autocomplete="off">
      ${actuelle}
      <div class="champ"><label for="ia-cle-champ">Nouvelle clé ${aide("ia-a-cle", "La clé d'API Claude qui sert à lire les factures de tous tes clients (ceux qui n'ont pas mis leur propre clé). Tu la crées sur console.anthropic.com → API Keys ; elle commence par « sk-ant- ». Les lectures sont payées sur ton compte Anthropic : garde un œil sur le crédit là-bas. Avant de la garder, le panel l'essaie chez Anthropic (gratuit). Elle est rangée sur le serveur, lisible par la passerelle seule, et ne s'affiche plus jamais en entier : seulement ses 4 derniers caractères. Seul Claude marche ici, car l'appli de tes clients parle à Claude ; ChatGPT et Gemini restent possibles avec la propre clé d'un client, dans ses réglages.")}
        <input id="ia-cle-champ" type="password" spellcheck="false" autocapitalize="off" autocomplete="new-password" placeholder="sk-ant-…"></div>
      <p class="erreur" id="ia-cle-erreur"></p>
      <div class="pied">${info.source === "panel" ? `<button class="btn danger" type="button" id="ia-cle-retirer">Retirer la clé</button>` : ""}<button class="btn principal" type="submit" id="ia-cle-ok">Essayer et enregistrer</button></div>
    </form>`,
    charger,
  );
  const fini = (r, texte) => {
    IA = r;
    $("#fenetre-corps").innerHTML = `<p class="etiquette ok">${e(texte)}</p>${r.avertissement ? `<p class="sub">${e(r.avertissement)}</p>` : ""}<p class="sub">Pris en compte tout de suite, sans redémarrer.</p>`;
  };
  $("#f-cle").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const cle = $("#ia-cle-champ").value.trim();
    if (!cle.startsWith("sk-ant-")) return ($("#ia-cle-erreur").textContent = "Une clé Claude commence par « sk-ant- ».");
    $("#ia-cle-ok").disabled = true;
    $("#ia-cle-erreur").textContent = "Essai de la clé chez Anthropic…";
    let r;
    try {
      r = await api("POST", "/ia/cle", { cle });
    } catch {
      r = { message: "Le panel ne répond pas. Réessaie." };
    }
    $("#ia-cle-ok").disabled = false;
    if (!r.usage) return ($("#ia-cle-erreur").textContent = r.message || "Échec.");
    fini(r, "Clé enregistrée");
  });
  const retirer = $("#ia-cle-retirer");
  if (retirer)
    retirer.addEventListener("click", async () => {
      if (retirer.dataset.sur !== "1") {
        retirer.dataset.sur = "1";
        retirer.textContent = "Sûr ? Cliquer encore pour retirer";
        return;
      }
      const r = await api("POST", "/ia/cle", { cle: null });
      if (!r.usage) return ($("#ia-cle-erreur").textContent = r.message || "Échec.");
      fini(r, "Clé retirée");
    });
}

function fenetreQuotaIA(client, actuel, factures = {}) {
  const tous = client === "*";
  const fDef = { attente: IA.factures?.defaut?.attente ?? 30, pages: IA.factures?.defaut?.pages ?? 10 };
  ouvrir(
    tous ? "Factures et IA : défaut" : `Factures et IA : ${client}`,
    `<form id="f-ia" novalidate>
      <div class="champ"><label for="ia-limite">Lectures par mois ${aide("ia-a-l", tous ? "Ce que reçoit chaque client qui n'a pas de réglage à part. Une lecture = une facture ou une mercuriale lue par l'IA. 0 = coupée pour tous." : "Une lecture = une facture ou une mercuriale lue par l'IA. 0 = coupée pour ce client. Vide : il suit le nombre par défaut.")}
        <div class="suffixe"><input id="ia-limite" type="number" min="0" max="100000" step="1" value="${actuel ?? ""}" placeholder="${tous ? "30" : `défaut (${IA.defaut ?? 30})`}"><span>par mois</span></div></div>
      <div class="champ"><label for="ia-attente">Factures en attente ${aide("ia-a-at", "Factures prises en photo (« Nouvelle facture ») et gardées « à traiter » en même temps, en attendant d'être lues par l'IA ou remplies par Claude. Une fois la liste pleine, le client doit en analyser ou en supprimer avant d'en ajouter. 0 = bouton « Nouvelle facture » coupé." + (tous ? "" : " Vide : il suit le défaut."))}
        <div class="suffixe"><input id="ia-attente" type="number" min="0" max="10000" step="1" value="${tous ? fDef.attente : (factures.attente ?? "")}" placeholder="${tous ? "30" : `défaut (${fDef.attente})`}"><span>factures</span></div></div>
      <div class="champ"><label for="ia-pages">Pages par facture ${aide("ia-a-pg", "Nombre de photos qu'on peut prendre pour une seule facture (une par page), de 1 à 20. Elles sont réduites dans le téléphone avant l'envoi (300 à 700 Ko chacune) et réunies en un PDF une fois la facture enregistrée." + (tous ? "" : " Vide : il suit le défaut."))}
        <div class="suffixe"><input id="ia-pages" type="number" min="1" max="20" step="1" value="${tous ? fDef.pages : (factures.pages ?? "")}" placeholder="${tous ? "10" : `défaut (${fDef.pages})`}"><span>pages</span></div></div>
      <p class="erreur" id="ia-erreur"></p>
      <div class="pied">${tous ? "" : `<button class="btn" type="button" id="ia-reset">Tout remettre au défaut</button>`}<button class="btn principal" type="submit">Enregistrer</button></div>
    </form>`,
    charger,
  );
  const envoyer = async (limite, attente, pages) => {
    let r = await api("POST", "/ia/quota", tous && limite === null ? { client, limite: IA.defaut ?? 30 } : { client, limite });
    if (!r.usage) return ($("#ia-erreur").textContent = r.message || "Échec.");
    r = await api("POST", "/ia/factures", { client, attente, pages });
    if (!r.usage) return ($("#ia-erreur").textContent = r.message || "Échec.");
    IA = r;
    $("#fenetre-corps").innerHTML = `<p class="etiquette ok">Enregistré</p><p class="sub">Pris en compte tout de suite pour ${tous ? "tous les clients sans réglage à part" : e(client)}.</p>`;
  };
  const nombre = (id) => {
    const v = $(id).value.trim();
    if (v === "") return null;
    return /^\d+$/.test(v) ? Number(v) : NaN;
  };
  $("#f-ia").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const limite = nombre("#ia-limite");
    const attente = nombre("#ia-attente");
    const pages = nombre("#ia-pages");
    if ([limite, attente, pages].some((n) => Number.isNaN(n))) return ($("#ia-erreur").textContent = "Écris des nombres entiers (0 pour couper).");
    if (tous && (limite === null || attente === null || pages === null)) return ($("#ia-erreur").textContent = "Remplis les trois nombres par défaut.");
    if (pages !== null && (pages < 1 || pages > 20)) return ($("#ia-erreur").textContent = "Pages par facture : de 1 à 20.");
    envoyer(limite, attente, pages);
  });
  if (!tous) $("#ia-reset").addEventListener("click", () => envoyer(null, null, null));
}

// ------------------------------------------------------------ vente (lot 8)
const PAGES_VENTE = { tarifs: "Tarifs", "mentions-legales": "Mentions légales", cgv: "CGV", confidentialite: "Confidentialité", "sous-traitance": "Sous-traitance (RGPD)" };
const euros = (n) => (n == null ? "sur devis" : `${Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} € / mois`);

function afficherVente() {
  const zone = $("#vente");
  if (!VENTE) {
    zone.innerHTML = `<div class="vide">Indisponible (le moteur ne répond pas).</div>`;
    return;
  }
  const v = VENTE;
  const liens = Object.entries(PAGES_VENTE)
    .map(([k, t]) => `<a href="https://${e(DOMAINE)}/${k}" target="_blank" rel="noopener">${e(t)} ↗</a>`)
    .join("");
  const offres = v.offres.map((o) => `<li><b>${e(o.nom)}</b> · ${e(euros(o.prix))}${o.utilisateurs ? ` · ${o.utilisateurs} utilisateurs` : ""}${o.lectures ? ` · ${o.lectures} lectures IA` : ""}${o.mcp ? " · MCP" : ""}</li>`).join("");
  zone.innerHTML = `<div class="carte-vente">
    <div class="barre serree">
      <span class="etiquette ${v.publie ? "ok" : "pause"}">${v.publie ? "Publié" : "Brouillon (pages marquées « brouillon », non indexées)"}</span>
      <button class="btn principal" type="button" id="vente-modifier">Modifier</button>
      <button class="aide" type="button" data-aide="vente-a" aria-label="Aide">?</button></div>
    <p class="texte-aide" id="vente-a">Ces réglages remplissent la page Tarifs et les textes légaux du site vitrine (mentions légales, CGV, confidentialité, sous-traitance). Tout est facultatif : un champ vide s'affiche « à compléter ». Les prix de départ sont des exemples. Le dossier juridique (ce que la loi demande, et pourquoi) est dans A-FAIRE.md, étape H. Fais relire les textes avant le premier client payant.</p>
    ${v.manques.length ? `<p class="sub">Il manque encore : ${e(v.manques.join(", "))}.</p>` : `<p class="sub">Toutes les informations obligatoires sont remplies.</p>`}
    <ul class="liste-offres">${offres || "<li>Aucune offre.</li>"}</ul>
    <p class="liens-vente">${liens}</p></div>`;
  $("#vente-modifier").addEventListener("click", fenetreVente);
}

const CHAMPS_VENTE = [
  ["nom", "Nom ou raison sociale", "Ton nom et prénom (entreprise individuelle) ou le nom de ta société, tel qu'il est inscrit au registre. Ex. : Noé Martin, ou RecipeLog SAS.", "text"],
  ["statut", "Statut", "Ex. : entrepreneur individuel (micro-entreprise), SASU au capital de 1 000 €. Écrit dans les mentions légales.", "text"],
  ["siren", "SIREN", "Les 9 chiffres de ton entreprise (sur l'avis de situation INSEE ou l'extrait du registre). Obligatoire dans les mentions légales.", "text"],
  ["rcs", "RCS ou RNE (facultatif)", "Ex. : RCS Nîmes 123 456 789. Laisse vide si tu n'es pas inscrit au registre du commerce.", "text"],
  ["adresse", "Adresse", "L'adresse du siège. Si tu ne veux pas montrer ton adresse personnelle, une domiciliation d'entreprise marche.", "text"],
  ["email", "E-mail de contact", "Affiché dans les mentions légales et la politique de confidentialité, pour les clients et les demandes sur les données.", "email"],
  ["telephone", "Téléphone", "La loi demande le téléphone de l'hébergeur. Le serveur est chez toi, donc c'est le tien (un numéro pro suffit).", "text"],
  ["directeur", "Directeur de la publication", "La personne responsable du contenu du site. En principe toi. Vide : ton nom ci-dessus.", "text"],
  ["ville", "Ville du tribunal", "En cas de litige avec un client pro, le tribunal de cette ville (en principe celle de ton siège).", "text"],
  ["emailsService", "Service d'envoi d'e-mails", "Le service qui envoie les e-mails (Brevo, Gmail…). Il apparaît dans la liste des sous-traitants.", "text"],
  ["sauvegardesExternes", "Sauvegardes externes (facultatif)", "Si tu copies les sauvegardes hors de chez toi : le nom et l'adresse du service (ex. OVH SAS, 2 rue Kellermann, 59100 Roubaix). Vide = pas de copie externe.", "text"],
];

function ligneOffre(o, i) {
  return `<fieldset class="offre-champ" data-offre="${i}"><legend>Offre ${i + 1}</legend>
    <div class="deux">
      <div class="champ"><label>Nom</label><input type="text" data-k="nom" maxlength="40" value="${e(o.nom)}"></div>
      <div class="champ"><label>Prix par mois ${aide(`vo-p${i}`, "En euros. Vide = « Sur devis ».")}<div class="suffixe"><input type="number" data-k="prix" min="0" step="0.01" value="${o.prix ?? ""}" placeholder="sur devis"><span>€</span></div></div>
      <div class="champ"><label>Utilisateurs ${aide(`vo-u${i}`, "Nombre de comptes compris. 0 = selon le besoin.")}<input type="number" data-k="utilisateurs" min="0" value="${o.utilisateurs ?? 0}"></div>
      <div class="champ"><label>Lectures IA par mois ${aide(`vo-l${i}`, "Lectures de factures par IA comprises avec ta clé. 0 = le client met sa propre clé. Ce chiffre est affiché ; le vrai quota se règle dans « Lecture des factures par IA ».")}<input type="number" data-k="lectures" min="0" value="${o.lectures ?? 0}"></div>
    </div>
    <div class="champ"><label>Description</label><input type="text" data-k="texte" maxlength="200" value="${e(o.texte ?? "")}"></div>
    <div class="champ"><label class="case"><input type="checkbox" data-k="mcp" ${o.mcp ? "checked" : ""}> Accès MCP (Claude) compris</label></div>
    <button class="btn petit" type="button" data-retirer="${i}">Retirer cette offre</button></fieldset>`;
}

function fenetreVente() {
  const v = VENTE;
  let offres = v.offres.map((o) => ({ ...o }));
  const champs = CHAMPS_VENTE.map(([k, t, a, type]) => `<div class="champ"><label for="ve-${k}">${e(t)} ${aide(`va-${k}`, e(a))}<input id="ve-${k}" type="${type}" value="${e(v.identite[k])}" autocomplete="off"></div>`).join("");
  ouvrir(
    "Tarifs et textes légaux",
    `<form id="f-vente" novalidate>
      <p class="sub">Tout est facultatif et modifiable plus tard. Un champ vide s'affiche « à compléter » sur les pages.</p>
      <h4>Ton entreprise</h4>${champs}
      <div class="champ"><label for="ve-tva">TVA ${aide("va-tva", "Franchise en base : tu ne factures pas la TVA tant que ton chiffre d'affaires reste sous le seuil (37 500 € par an pour les services en 2026). Les pages affichent alors « TVA non applicable, article 293 B du CGI ».")}
        <select id="ve-tva"><option value="franchise" ${v.tva === "franchise" ? "selected" : ""}>Franchise en base (pas de TVA)</option><option value="assujetti" ${v.tva === "assujetti" ? "selected" : ""}>Je facture la TVA</option></select></div>
      <div class="champ" id="ve-numtva-champ"><label for="ve-numeroTva">Numéro de TVA ${aide("va-ntva", "Ton numéro de TVA intracommunautaire (FR + 11 chiffres).")}<input id="ve-numeroTva" type="text" value="${e(v.identite.numeroTva)}"></div>
      <h4>Offres</h4>
      <div class="deux">
        <div class="champ"><label for="ve-essai">Essai gratuit ${aide("va-essai", "Affiché sur la page Tarifs et dans les CGV. 0 = pas d'essai. Le vrai essai se règle quand tu crées un client.")}<div class="suffixe"><input id="ve-essai" type="number" min="0" max="365" value="${v.essai}"><span>jours</span></div></div>
        <div class="champ"><label for="ve-annuel">Mois offerts à l'année ${aide("va-annuel", "Ex. 2 : payer à l'année revient à 10 mois. 0 = pas d'offre annuelle affichée.")}<input id="ve-annuel" type="number" min="0" max="6" value="${v.annuel}"></div>
      </div>
      <div id="ve-offres"></div>
      <button class="btn" type="button" id="ve-ajouter">+ Ajouter une offre</button>
      <h4>Publication</h4>
      <div class="champ"><label for="ve-date">En vigueur au ${aide("va-date", "La date écrite en haut des CGV et de la politique de confidentialité. Change-la quand tu modifies les textes.")}<input id="ve-date" type="date" value="${e(v.enVigueur)}"></div>
      <div class="champ"><label class="case"><input id="ve-publie" type="checkbox" ${v.publie ? "checked" : ""}> Publier (retire le bandeau « brouillon ») ${aide("va-pub", "Coche quand tes informations sont complètes et que les textes ont été relus. Avant, les pages restent visibles mais marquées « brouillon » et cachées des moteurs de recherche.")}</div>
      <p class="erreur" id="ve-erreur"></p>
      <div class="pied"><button class="btn principal" type="submit">Enregistrer</button></div>
    </form>`,
    charger,
  );
  const lireOffres = () =>
    [...document.querySelectorAll("[data-offre]")].map((f) => {
      const val = (k) => f.querySelector(`[data-k="${k}"]`);
      return { nom: val("nom").value.trim(), prix: val("prix").value === "" ? null : Number(val("prix").value), utilisateurs: Number(val("utilisateurs").value || 0), lectures: Number(val("lectures").value || 0), texte: val("texte").value.trim(), mcp: val("mcp").checked };
    });
  const dessiner = () => {
    $("#ve-offres").innerHTML = offres.map(ligneOffre).join("");
    $("#ve-ajouter").disabled = offres.length >= 6;
  };
  dessiner();
  const tva = () => ($("#ve-numtva-champ").hidden = $("#ve-tva").value !== "assujetti");
  tva();
  $("#ve-tva").addEventListener("change", tva);
  $("#ve-ajouter").addEventListener("click", () => {
    offres = [...lireOffres(), { nom: "", prix: null, utilisateurs: 0, lectures: 0, mcp: false, texte: "" }];
    dessiner();
  });
  $("#ve-offres").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-retirer]");
    if (!b) return;
    offres = lireOffres().filter((_, i) => i !== Number(b.dataset.retirer));
    dessiner();
  });
  $("#f-vente").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const corps = {
      identite: Object.fromEntries([...CHAMPS_VENTE.map(([k]) => [k, $(`#ve-${k}`).value.trim()]), ["numeroTva", $("#ve-numeroTva").value.trim()]]),
      tva: $("#ve-tva").value,
      essai: Number($("#ve-essai").value || 0),
      annuel: Number($("#ve-annuel").value || 0),
      offres: lireOffres(),
      enVigueur: $("#ve-date").value,
      publie: $("#ve-publie").checked,
    };
    const r = await api("POST", "/vente", corps);
    if (!r.offres) return ($("#ve-erreur").textContent = r.message || "Échec.");
    VENTE = r;
    $("#fenetre-corps").innerHTML = `<p class="etiquette ok">Enregistré</p><p class="sub">Les pages du site sont à jour (une minute au plus).${r.manques.length ? ` Il manque encore : ${e(r.manques.join(", "))}.` : ""}</p>`;
  });
}
