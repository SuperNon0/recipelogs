// Passerelle de la plateforme RecipeLog : l'API que chaque client (instance)
// appelle pour gérer son équipe, sans jamais voir la clé d'Authentik.
// Contrat : ../connexion.md. Joignable seulement sur le réseau Docker.
import { createServer } from "node:http";
import { ErreurPasserelle, clientParCle, equipe, inviter, retirer, renvoyer } from "./authentik.mjs";

const PORT = Number(process.env.PORT || 8000);

function repondre(res, statut, corps) {
  res.writeHead(statut, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(corps === undefined ? "" : JSON.stringify(corps));
}

async function lireJson(req) {
  let taille = 0;
  const morceaux = [];
  for await (const m of req) {
    taille += m.length;
    if (taille > 16 * 1024) throw new ErreurPasserelle(413, "trop_gros", "Requête trop grosse.");
    morceaux.push(m);
  }
  if (!morceaux.length) return {};
  try {
    return JSON.parse(Buffer.concat(morceaux).toString("utf8"));
  } catch {
    throw new ErreurPasserelle(400, "json_invalide", "Requête illisible.");
  }
}

async function traiter(req, res) {
  const url = new URL(req.url, "http://passerelle");
  const chemin = url.pathname.replace(/\/+$/, "") || "/";
  if (chemin === "/sante") return repondre(res, 200, { ok: true });

  const cle = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  const nom = await clientParCle(cle);
  if (!nom) return repondre(res, 401, { error: "cle_invalide", message: "Clé de la passerelle refusée." });

  if (chemin === "/v1/equipe" && req.method === "GET") return repondre(res, 200, await equipe(nom));
  if (chemin === "/v1/equipe" && req.method === "POST") {
    const { email, nom: nomAffiche } = await lireJson(req);
    return repondre(res, 201, await inviter(nom, email, nomAffiche));
  }
  const m = chemin.match(/^\/v1\/equipe\/([^/]+)(\/invitation)?$/);
  if (m) {
    const email = decodeURIComponent(m[1]);
    if (!m[2] && req.method === "DELETE") {
      await retirer(nom, email);
      return repondre(res, 204);
    }
    if (m[2] && req.method === "POST") return repondre(res, 200, await renvoyer(nom, email));
  }
  return repondre(res, 404, { error: "introuvable", message: "Adresse inconnue de la passerelle." });
}

createServer((req, res) => {
  const debut = Date.now();
  traiter(req, res)
    .catch((e) => {
      if (e instanceof ErreurPasserelle) {
        if (e.statut >= 500) console.error(e.message);
        const { detail, ...extra } = e.extra ?? {};
        return repondre(res, e.statut >= 400 && e.statut < 600 ? e.statut : 500, { error: e.code, message: e.message, ...extra });
      }
      console.error(e);
      repondre(res, 500, { error: "erreur", message: "Erreur interne de la passerelle." });
    })
    .finally(() => {
      if (req.url !== "/sante") console.log(`${req.method} ${req.url?.replace(/\/v1\/equipe\/[^/]+/, "/v1/equipe/…")} ${res.statusCode} ${Date.now() - debut}ms`);
    });
}).listen(PORT, () => console.log(`Passerelle RecipeLog sur le port ${PORT}.`));
