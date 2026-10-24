/**
 * Lecture d'une vidéo (TikTok, Instagram, YouTube…) ou d'une page de recette,
 * pour que Claude puisse en tirer une recette via l'outil MCP `lire_video`.
 *
 * Pas d'IA ici : on rassemble seulement ce qu'il faut à Claude.
 * - vidéo : `yt-dlp` donne le titre, la description et les sous-titres, et
 *   télécharge la vidéo ; `ffmpeg` en extrait quelques images (texte affiché) ;
 * - page web : la recette au format schema.org (JSON-LD) si le site la publie,
 *   sinon le titre, la description et le texte de la page.
 *
 * `yt-dlp` et `ffmpeg` sont installés sur le serveur par deploy/proxmox/deploy.sh.
 */
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseHTML } from "linkedom";

const YT_DLP = process.env.YT_DLP_BIN || "yt-dlp";
const FFMPEG = process.env.FFMPEG_BIN || "ffmpeg";

export type Platform = "tiktok" | "instagram" | "youtube" | "web";

/** Dossier proposé pour ranger la recette, selon d'où elle vient. */
export const PLATFORM_FOLDER: Record<Platform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  web: "Internet",
};

export function detectPlatform(url: string): Platform {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "web";
  }
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
  if (host === "instagram.com" || host.endsWith(".instagram.com") || host === "instagr.am") return "instagram";
  if (host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com")) return "youtube";
  return "web";
}

/** Premier lien http(s) trouvé dans un texte (le partage TikTok ajoute souvent du texte autour). */
export function extractUrl(input: string): string | null {
  const m = input.match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[),.;!?]+$/, "") : null;
}

/** Texte brut d'un fichier de sous-titres VTT ou SRT, sans horodatage ni répétitions. */
export function subtitlesToText(raw: string): string {
  const lines: string[] = [];
  for (let line of raw.replace(/\r/g, "").split("\n")) {
    line = line.trim();
    if (!line || line === "WEBVTT" || /^\d+$/.test(line) || line.includes("-->")) continue;
    if (/^(NOTE|STYLE|REGION|Kind:|Language:)/.test(line)) continue;
    line = line
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    // Les sous-titres automatiques répètent la ligne précédente à chaque mot ajouté.
    if (line && line !== lines[lines.length - 1]) lines.push(line);
  }
  return lines.join("\n");
}

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const e = err as NodeJS.ErrnoException & { killed?: boolean };
        if (e.code === "ENOENT") reject(new Error(`${cmd} n'est pas installé sur le serveur (lancer « Mettre à jour le site »)`));
        else if (e.killed) reject(new Error(`${cmd} a mis trop de temps`));
        else reject(new Error(lastErrorLine(stderr) || e.message));
      } else resolve({ stdout, stderr });
    });
  });
}

function lastErrorLine(stderr: string): string {
  const lines = stderr.split("\n").map((l) => l.trim()).filter(Boolean);
  return (lines.reverse().find((l) => l.startsWith("ERROR")) ?? lines[0] ?? "").replace(/^ERROR:\s*/, "");
}

/** Version installée d'un outil, ou null s'il manque (affiché dans Réglages). */
export async function toolVersion(tool: "yt-dlp" | "ffmpeg"): Promise<string | null> {
  try {
    const { stdout } = await run(tool === "yt-dlp" ? YT_DLP : FFMPEG, [tool === "yt-dlp" ? "--version" : "-version"], 10_000);
    const first = stdout.split("\n")[0].trim();
    return tool === "ffmpeg" ? (first.match(/version\s+(\S+)/)?.[1] ?? first) : first;
  } catch {
    return null;
  }
}

export type VideoImage = { data: string; mimeType: "image/jpeg"; secondes: number };

export type VideoContent = {
  type: "video";
  plateforme: Platform;
  lien: string;
  titre: string | null;
  auteur: string | null;
  duree_secondes: number | null;
  description: string | null;
  sous_titres: string | null;
  images: VideoImage[];
};

export type PageContent = {
  type: "page";
  plateforme: Platform;
  lien: string;
  titre: string | null;
  description: string | null;
  /** Recette(s) schema.org trouvées dans la page, telles que publiées par le site. */
  recettes_schema_org: unknown[];
  /** Texte de la page, quand le site ne publie pas de recette structurée. */
  texte: string | null;
};

const MAX_TEXT = 15_000;
const cut = (s: string | null | undefined, max = MAX_TEXT) =>
  s ? (s.length > max ? `${s.slice(0, max)}… (coupé)` : s) : null;

type YtInfo = {
  title?: string;
  fulltitle?: string;
  description?: string;
  uploader?: string;
  creator?: string;
  channel?: string;
  duration?: number;
  webpage_url?: string;
};

/**
 * Télécharge la vidéo dans un dossier temporaire, lit description et
 * sous-titres, extrait `nbImages` images réparties sur la durée.
 */
export async function readVideo(url: string, nbImages: number): Promise<VideoContent> {
  const dir = await mkdtemp(join(tmpdir(), "recipelog-video-"));
  try {
    await run(
      YT_DLP,
      [
        "--no-playlist",
        "--no-progress",
        "--no-cache-dir",
        "--write-info-json",
        "--write-subs",
        "--write-auto-subs",
        "--sub-langs",
        "fr.*,fra.*,en.*,eng.*",
        "--sub-format",
        "vtt/srt/best",
        "--max-filesize",
        "300M",
        "-f",
        "b[height<=720][ext=mp4]/b[height<=720]/b/bv*+ba",
        "-o",
        join(dir, "video.%(ext)s"),
        url,
      ],
      75_000,
    ).catch((e: Error) => {
      // Les sous-titres peuvent échouer seuls (langue absente) : on continue si la vidéo est là.
      if (!/subtitle/i.test(e.message)) throw e;
    });

    const files = await readdir(dir);
    const infoFile = files.find((f) => f.endsWith(".info.json"));
    const info: YtInfo = infoFile ? JSON.parse(await readFile(join(dir, infoFile), "utf8")) : {};
    const subFile =
      files.find((f) => /\.fr[^.]*\.(vtt|srt)$/i.test(f) || /\.fra[^.]*\.(vtt|srt)$/i.test(f)) ??
      files.find((f) => /\.(vtt|srt)$/i.test(f));
    const videoFile = files.find((f) => /^video\.(mp4|webm|mkv|mov)$/i.test(f));

    const duration = typeof info.duration === "number" && info.duration > 0 ? info.duration : null;
    const images = videoFile && nbImages > 0 ? await extractFrames(join(dir, videoFile), dir, duration, nbImages) : [];

    return {
      type: "video",
      plateforme: detectPlatform(url),
      lien: info.webpage_url || url,
      titre: info.fulltitle || info.title || null,
      auteur: info.uploader || info.creator || info.channel || null,
      duree_secondes: duration ? Math.round(duration) : null,
      description: cut(info.description?.trim()),
      sous_titres: subFile ? cut(subtitlesToText(await readFile(join(dir, subFile), "utf8"))) : null,
      images,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Instants (en secondes) des images : réparties sur la vidéo, sans la toute première ni la dernière seconde. */
export function frameTimes(duration: number | null, count: number): number[] {
  if (count <= 0) return [];
  if (!duration || duration <= 1) return [0];
  const n = Math.min(count, Math.max(1, Math.floor(duration)));
  return Array.from({ length: n }, (_, i) => Math.round(((i + 0.5) * duration * 10) / n) / 10);
}

async function extractFrames(video: string, dir: string, duration: number | null, count: number): Promise<VideoImage[]> {
  const images: VideoImage[] = [];
  for (const [i, t] of frameTimes(duration, count).entries()) {
    const out = join(dir, `frame-${i}.jpg`);
    try {
      // 640 px de haut suffisent pour lire le texte incrusté, et restent légers à envoyer.
      await run(FFMPEG, ["-y", "-loglevel", "error", "-ss", String(t), "-i", video, "-frames:v", "1", "-vf", "scale=-2:640", "-q:v", "5", out], 10_000);
      images.push({ data: (await readFile(out)).toString("base64"), mimeType: "image/jpeg", secondes: t });
    } catch {
      /* une image ratée n'empêche pas les autres */
    }
  }
  return images;
}

/** Recettes schema.org (JSON-LD) d'une page, y compris dans un @graph. */
export function findJsonLdRecipes(html: string): unknown[] {
  const { document } = parseHTML(html);
  const found: unknown[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    const type = o["@type"];
    if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) found.push(o);
    if (o["@graph"]) visit(o["@graph"]);
  };
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      visit(JSON.parse(s.textContent ?? ""));
    } catch {
      /* JSON invalide : on ignore ce bloc */
    }
  }
  return found;
}

export async function readPage(url: string): Promise<PageContent> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; RecipeLog)",
      "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`la page répond ${res.status}`);
  const html = await res.text();
  const { document } = parseHTML(html);
  const meta = (name: string) =>
    document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute("content")?.trim() || null;
  const recipes = findJsonLdRecipes(html);
  let texte: string | null = null;
  if (recipes.length === 0) {
    for (const el of document.querySelectorAll("script, style, noscript, nav, header, footer, svg")) el.remove();
    const root = document.querySelector("article") ?? document.querySelector("main") ?? document.body;
    texte = cut(root?.textContent?.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim());
  }
  return {
    type: "page",
    plateforme: detectPlatform(url),
    lien: res.url || url,
    titre: meta("og:title") ?? (document.querySelector("title")?.textContent?.trim() || null),
    description: meta("og:description") ?? meta("description"),
    recettes_schema_org: recipes,
    texte,
  };
}

/**
 * Point d'entrée de l'outil : vidéo pour TikTok, Instagram et YouTube,
 * page web sinon. Un lien web qui contient une vidéo que yt-dlp sait lire
 * n'est pas tenté en vidéo : la page suffit presque toujours pour un site.
 */
export async function readRecipeSource(url: string, nbImages: number): Promise<VideoContent | PageContent> {
  const platform = detectPlatform(url);
  if (platform === "web") return readPage(url);
  try {
    return await readVideo(url, nbImages);
  } catch (e) {
    // Publication Instagram en photos, vidéo privée… : la page donne au moins la légende.
    const page = await readPage(url).catch(() => null);
    if (page && (page.description || page.recettes_schema_org.length)) return page;
    throw e;
  }
}
