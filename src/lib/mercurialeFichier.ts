/** Lecture d'une mercuriale Excel (.xlsx) ou CSV en tableau de textes (serveur). */
import JSZip from "jszip";

export const MAX_LIGNES_TABLEUR = 3000;
const MAX_COLONNES = 40;

// ─────────────────────────────────────────────
// Lecture du fichier
// ─────────────────────────────────────────────

export type FormatTableur = "csv" | "xlsx";

export function formatTableur(nom: string, bytes: Buffer): FormatTableur | null {
  // Un .xlsx est un zip (PK…) ; un vieux .xls (binaire) n'est pas lu.
  if (bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) return "xlsx";
  if (/\.(csv|txt|tsv)$/i.test(nom)) return "csv";
  return null;
}

/** Texte d'un CSV : UTF-8, sinon Windows-1252 (CSV enregistré par Excel en France). */
export function texteCsv(bytes: Buffer): string {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const t = utf8.includes("�") ? new TextDecoder("windows-1252").decode(bytes) : utf8;
  return t.replace(/^﻿/, "");
}

export function lireCsv(texte: string): string[][] {
  const premieres = texte.split(/\r?\n/).slice(0, 5).join("\n");
  const compte = (c: string) => premieres.split(c).length - 1;
  const sep = [";", "\t", ","].sort((a, b) => compte(b) - compte(a))[0];
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let champ = "";
  let guillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (guillemets) {
      if (c === '"' && texte[i + 1] === '"') {
        champ += '"';
        i++;
      } else if (c === '"') guillemets = false;
      else champ += c;
      continue;
    }
    if (c === '"' && champ === "") guillemets = true;
    else if (c === sep) {
      ligne.push(champ);
      champ = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texte[i + 1] === "\n") i++;
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = "";
      if (lignes.length >= MAX_LIGNES_TABLEUR) break;
    } else champ += c;
  }
  if (champ !== "" || ligne.length) {
    ligne.push(champ);
    lignes.push(ligne);
  }
  return propre(lignes);
}

const ENTITES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decoder = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITES[e.toLowerCase()],
  );
const textes = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decoder(m[1])).join("");

function colonne(ref: string): number {
  const lettres = ref.match(/^[A-Z]+/)?.[0] ?? "A";
  let n = 0;
  for (const l of lettres) n = n * 26 + (l.charCodeAt(0) - 64);
  return n - 1;
}

/** Première feuille d'un classeur Excel (.xlsx), en texte. */
export async function lireXlsx(bytes: Buffer): Promise<string[][]> {
  const zip = await JSZip.loadAsync(bytes);
  const lire = (chemin: string) => zip.file(chemin)?.async("string") ?? Promise.resolve(null);
  const partages = ((await lire("xl/sharedStrings.xml")) ?? "").match(/<si>[\s\S]*?<\/si>/g)?.map(textes) ?? [];

  // Première feuille dans l'ordre du classeur (pas forcément sheet1.xml).
  let chemin = "xl/worksheets/sheet1.xml";
  const classeur = await lire("xl/workbook.xml");
  const liens = await lire("xl/_rels/workbook.xml.rels");
  const rid = classeur?.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  const cible = rid && liens ? liens.match(new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`))?.[1] ?? liens.match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`))?.[1] : null;
  if (cible) chemin = cible.startsWith("/") ? cible.slice(1) : `xl/${cible.replace(/^\.\//, "")}`;
  const feuille = await lire(chemin);
  if (feuille == null) throw new Error("Classeur Excel illisible (aucune feuille).");

  const lignes: string[][] = [];
  for (const r of feuille.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const ligne: string[] = [];
    let auto = 0;
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1];
      const i = ref ? colonne(ref) : auto;
      auto = i + 1;
      if (i >= MAX_COLONNES) continue;
      const corps = c[2] ?? "";
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const v = corps.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let val = "";
      if (type === "s") val = partages[Number(v)] ?? "";
      else if (type === "inlineStr") val = textes(corps);
      else if (v != null) val = decoder(v);
      while (ligne.length < i) ligne.push("");
      ligne[i] = val;
    }
    lignes.push(ligne);
    if (lignes.length >= MAX_LIGNES_TABLEUR) break;
  }
  return propre(lignes);
}

/** Cases sans espaces en trop, lignes vides retirées. */
function propre(lignes: string[][]): string[][] {
  return lignes
    .map((l) => l.slice(0, MAX_COLONNES).map((c) => c.replace(/\s+/g, " ").trim()))
    .filter((l) => l.some((c) => c !== ""));
}

export async function lireTableur(nom: string, bytes: Buffer): Promise<string[][]> {
  const f = formatTableur(nom, bytes);
  if (f === "xlsx") return lireXlsx(bytes);
  if (f === "csv") return lireCsv(texteCsv(bytes));
  throw new Error("Format non lu : enregistre le fichier en .xlsx ou .csv (un vieux .xls ne se lit pas), ou envoie un PDF.");
}

