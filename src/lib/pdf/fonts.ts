/**
 * Polices Google intégrées dans le HTML des PDF.
 *
 * Sans ça, Chromium retélécharge les polices à chaque PDF (1 à 3 s selon le
 * réseau). Ici on récupère une seule fois le CSS + les fichiers woff2, on les
 * garde en mémoire et on remplace le <link> par un <style> avec les polices en
 * data: URI. En cas d'échec réseau, le <link> d'origine est conservé.
 */

const LINK_RE = /<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com\/[^"]+)" \/>/g;
// UA d'un Chrome récent : Google renvoie alors du woff2 (le plus léger).
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
// Seuls les sous-ensembles utiles au français sont gardés.
const KEPT_SUBSETS = new Set(["latin", "latin-ext"]);

const cache = new Map<string, Promise<string | null>>();

async function fetchInlinedCss(href: string): Promise<string | null> {
  const res = await fetch(href.replace(/&amp;/g, "&"), {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) return null;
  const css = await res.text();

  // Le CSS Google est une suite de blocs « /* subset */ @font-face {...} ».
  const blocks = css.split(/(?=\/\* [\w-]+ \*\/)/).filter((block) => {
    const subset = block.match(/^\/\* ([\w-]+) \*\//)?.[1];
    return !subset || KEPT_SUBSETS.has(subset);
  });

  const out: string[] = [];
  for (const block of blocks) {
    let inlined = block;
    for (const [, url] of block.matchAll(/url\((https:[^)]+)\)/g)) {
      const font = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (!font.ok) return null;
      const b64 = Buffer.from(await font.arrayBuffer()).toString("base64");
      inlined = inlined.replace(url, `data:font/woff2;base64,${b64}`);
    }
    out.push(inlined);
  }
  return out.join("\n");
}

export async function inlineGoogleFonts(html: string): Promise<string> {
  const hrefs = [...html.matchAll(LINK_RE)].map((m) => m[1]);
  let result = html;
  for (const href of new Set(hrefs)) {
    if (!cache.has(href)) {
      const pending = fetchInlinedCss(href).catch(() => null);
      cache.set(href, pending);
      // Échec : on retentera au prochain PDF.
      pending.then((css) => { if (!css) cache.delete(href); });
    }
    const css = await cache.get(href)!;
    if (css) result = result.split(`<link rel="stylesheet" href="${href}" />`).join(`<style>${css}</style>`);
  }
  return result;
}
