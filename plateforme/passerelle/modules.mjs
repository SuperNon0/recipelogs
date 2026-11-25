// Modules en option du client, réglés dans le panel (panel/modules.mjs) :
// ia/modules.json = { clients: { maison: { factures: false } } }.
// GET /v1/modules → { coupes: ["factures"] } : seuls les modules décochés ; tout
// le reste est allumé. L'appli du client coupe aussi les sous-modules d'un module coupé.
import { readFile } from "node:fs/promises";

const RACINE = process.env.IA_DIR || "/ia";

export async function modulesPour(client) {
  let j = {};
  try {
    j = JSON.parse(await readFile(`${RACINE}/modules.json`, "utf8"));
  } catch {
    j = {};
  }
  const m = j?.clients?.[client];
  const coupes = m && typeof m === "object" ? Object.keys(m).filter((k) => m[k] === false && /^[a-z0-9-]{1,40}$/.test(k)) : [];
  return { coupes };
}
