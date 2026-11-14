// Maintenance et bandeaux (lot 6) : ce que doit afficher le RecipeLog d'un client, maintenant.
// Le fichier est écrit par le moteur du panel ; ici on ne fait que le lire.
import { readFile } from "node:fs/promises";

const FICHIER = `${process.env.ANNONCES_DIR || "/annonces"}/annonces.json`;
const vise = (cibles, client) => cibles.includes("*") || cibles.includes(client);

export async function annoncesPour(client) {
  let a = { maintenances: [], bandeaux: [] };
  try {
    a = JSON.parse(await readFile(FICHIER, "utf8"));
  } catch {
    /* rien de prévu */
  }
  const t = Date.now();
  let maintenance = null;
  const bandeaux = [];
  for (const m of a.maintenances ?? []) {
    if (!vise(m.cibles ?? [], client) || m.terminee || (m.fin && Date.parse(m.fin) <= t)) continue;
    const debut = Date.parse(m.debut);
    if (debut <= t) maintenance = { message: m.message, fin: m.fin ?? null };
    // Préavis : un bandeau dès l'entrée dans la fenêtre de préavis (au moins 1 h avant).
    else if (debut - Math.max(1, m.preavisHeures ?? 24) * 3600000 <= t) bandeaux.push({ id: `m-${m.id}`, niveau: "alerte", maintenance: { debut: m.debut, fin: m.fin ?? null }, texte: m.message });
  }
  for (const b of a.bandeaux ?? []) {
    if (vise(b.cibles ?? [], client) && (!b.jusqua || Date.parse(b.jusqua) > t)) bandeaux.push({ id: `b-${b.id}`, niveau: b.niveau === "alerte" ? "alerte" : "info", texte: b.texte });
  }
  return { maintenance, bandeaux };
}
