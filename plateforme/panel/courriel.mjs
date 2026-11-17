// Envoi d'un email par SMTP, sans dépendance : même compte que la plateforme
// (SMTP_* dans /srv/recipelog/.env, Brevo en général). STARTTLS sur 587, TLS
// direct sur 465, en clair seulement si SMTP_TLS=false (essais locaux).
import net from "node:net";
import tls from "node:tls";
import { randomBytes } from "node:crypto";

const conf = () => ({
  hote: process.env.SMTP_HOTE || "",
  port: Number(process.env.SMTP_PORT || 587),
  utilisateur: process.env.SMTP_UTILISATEUR || "",
  motDePasse: process.env.SMTP_MOT_DE_PASSE || "",
  tls: (process.env.SMTP_TLS || "true") !== "false",
  expediteur: process.env.SMTP_EXPEDITEUR || "RecipeLog <noreply@recipelog.cc>",
});

export const courrielRegle = () => Boolean(conf().hote);
const DELAI_GLOBAL_MS = Number(process.env.SMTP_DELAI_MS || 45000);

const adresse = (v) => (v.match(/<([^>]+)>/)?.[1] ?? v).trim();
const entete = (v) => (/^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`);
const propre = (v) => String(v).replace(/[\r\n]+/g, " ").trim();
const expediteurEntete = (v) => {
  const m = v.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? `${entete(m[1].replace(/"/g, ""))} <${m[2]}>` : v;
};

// Dialogue SMTP : une commande, une réponse (codes 2xx/3xx attendus).
function session(socket) {
  let tampon = "";
  let attente = null;
  const lignes = [];
  const pousser = (d) => {
    tampon += d.toString("utf8");
    let i;
    while ((i = tampon.indexOf("\r\n")) >= 0) {
      lignes.push(tampon.slice(0, i));
      tampon = tampon.slice(i + 2);
    }
    // Réponse complète : dernière ligne « 250 texte » (pas « 250-texte »).
    const fin = lignes.findIndex((l) => /^\d{3} /.test(l) || /^\d{3}$/.test(l));
    if (fin >= 0 && attente) {
      const rep = lignes.splice(0, fin + 1);
      const a = attente;
      attente = null;
      a(rep);
    }
  };
  socket.setMaxListeners(60); // un écouteur « close » par commande du dialogue
  socket.on("data", pousser);
  const lire = () =>
    new Promise((ok, ko) => {
      attente = (rep) => {
        const code = Number(rep.at(-1).slice(0, 3));
        if (code >= 400) ko(new Error(`SMTP : ${rep.at(-1)}`));
        else ok({ code, rep });
      };
      // Serveur qui raccroche sans répondre : sans ça, l'envoi resterait bloqué pour toujours.
      const coupe = () => ko(new Error("SMTP : le serveur a fermé la connexion sans répondre"));
      socket.once("error", ko);
      socket.once("close", coupe);
      socket.once("end", coupe);
      pousser(Buffer.alloc(0));
    });
  const dire = (cmd) => {
    socket.write(`${cmd}\r\n`);
    return lire();
  };
  return { lire, dire, detacher: () => socket.removeListener("data", pousser) };
}

/** envoyerCourriel({ a, sujet, texte, repondreA? }) : rejette en cas d'échec. */
export function envoyerCourriel(message) {
  // Délai global : quoi qu'il arrive, l'envoi répond (réussi ou raté) en 45 secondes.
  const prise = { socket: null };
  let minuteur;
  const delai = new Promise((_, ko) => {
    minuteur = setTimeout(() => {
      prise.socket?.destroy();
      ko(new Error("SMTP : pas de réponse en 45 secondes"));
    }, DELAI_GLOBAL_MS);
  });
  return Promise.race([envoyer(message, prise), delai]).finally(() => clearTimeout(minuteur));
}

async function envoyer({ a, sujet, texte, repondreA }, prise) {
  const c = conf();
  if (!c.hote) throw new Error("Emails pas réglés (SMTP_HOTE vide).");
  const direct = c.port === 465;
  let socket = await new Promise((ok, ko) => {
    const s = direct ? tls.connect({ host: c.hote, port: c.port, servername: c.hote }, () => ok(s)) : net.connect({ host: c.hote, port: c.port }, () => ok(s));
    s.once("error", ko);
    s.setTimeout(20000, () => s.destroy(new Error("SMTP : délai dépassé")));
  });
  prise.socket = socket;
  try {
    let smtp = session(socket);
    await smtp.lire();
    let ehlo = await smtp.dire("EHLO recipelog-moteur");
    if (!direct && c.tls) {
      if (!ehlo.rep.some((l) => /STARTTLS/i.test(l))) throw new Error("SMTP : le serveur ne propose pas STARTTLS.");
      await smtp.dire("STARTTLS");
      smtp.detacher();
      socket = await new Promise((ok, ko) => {
        const s = tls.connect({ socket, servername: c.hote }, () => ok(s));
        s.once("error", ko);
      });
      prise.socket = socket;
      smtp = session(socket);
      ehlo = await smtp.dire("EHLO recipelog-moteur");
    }
    if (c.utilisateur) {
      await smtp.dire("AUTH LOGIN");
      await smtp.dire(Buffer.from(c.utilisateur).toString("base64"));
      await smtp.dire(Buffer.from(c.motDePasse).toString("base64"));
    }
    const de = adresse(c.expediteur);
    await smtp.dire(`MAIL FROM:<${de}>`);
    // Une adresse refusée n'empêche pas l'envoi aux autres (alerte à plusieurs admins).
    let acceptes = 0;
    let dernierRefus = null;
    for (const dest of [].concat(a)) {
      try {
        await smtp.dire(`RCPT TO:<${adresse(dest)}>`);
        acceptes += 1;
      } catch (e) {
        dernierRefus = e;
      }
    }
    if (!acceptes) throw dernierRefus ?? new Error("SMTP : aucun destinataire.");
    await smtp.dire("DATA");
    const corps = Buffer.from(texte.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64").replace(/.{76}/g, "$&\r\n");
    const message = [
      `From: ${expediteurEntete(c.expediteur)}`,
      `To: ${[].concat(a).map(propre).join(", ")}`,
      `Subject: ${entete(propre(sujet))}`,
      ...(repondreA ? [`Reply-To: ${propre(repondreA)}`] : []),
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${randomBytes(12).toString("hex")}@${de.split("@")[1] || "recipelog"}>`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: base64",
      "",
      corps,
      ".",
    ].join("\r\n");
    await smtp.dire(message);
    await smtp.dire("QUIT").catch(() => {});
  } finally {
    socket.destroy();
  }
}
