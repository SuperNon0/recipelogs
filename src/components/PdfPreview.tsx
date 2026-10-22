"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";

type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | null = null;

/** Charge pdf.js à la demande (uniquement quand un aperçu s'affiche). */
function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    return m;
  });
  return pdfjsPromise;
}

/**
 * Affiche les pages d'un PDF en images (pdf.js), identique au fichier
 * téléchargé, sur ordinateur comme sur téléphone.
 *
 * `data` : contenu du PDF déjà chargé. `loading` : affiche un indicateur
 * par-dessus l'aperçu précédent pendant la génération.
 */
export function PdfPreview({
  data,
  loading,
  error,
  maxPages = 6,
}: {
  data: ArrayBuffer | null;
  loading?: boolean;
  error?: string | null;
  maxPages?: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [boxWidth, setBoxWidth] = useState(0);

  // Largeur réelle de l'aperçu : on redessine les pages quand elle change
  // (fenêtre agrandie, plein écran…), sinon l'image dessinée à l'ancienne
  // taille est étirée et devient floue.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => setBoxWidth(Math.round(box.clientWidth)), 150);
    });
    ro.observe(box);
    setBoxWidth(Math.round(box.clientWidth));
    return () => {
      clearTimeout(timer);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!data || !boxRef.current || boxWidth <= 0) return;
    let cancelled = false;
    const box = boxRef.current;
    (async () => {
      try {
        const pdfjs = await loadPdfJs();
        const doc = await pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
        if (cancelled) return;
        const n = Math.min(doc.numPages, maxPages);
        const width = Math.max(240, boxWidth - 2);
        // Au moins 2 pixels par point affiché (texte net même en zoomant un
        // peu), jusqu'à 3 sur les écrans très denses (téléphones).
        const ratio = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
        const canvases: HTMLCanvasElement[] = [];
        for (let i = 1; i <= n; i++) {
          const page = await doc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: (width / base.width) * ratio });
          const c = document.createElement("canvas");
          c.width = vp.width;
          c.height = vp.height;
          c.style.width = "100%";
          c.style.display = "block";
          c.style.background = "#fff";
          c.style.borderRadius = "6px";
          c.style.boxShadow = "0 10px 30px rgba(0,0,0,.35)";
          await page.render({ canvasContext: c.getContext("2d")!, viewport: vp }).promise;
          if (cancelled) return;
          canvases.push(c);
        }
        box.replaceChildren(...canvases);
        setPages(n);
        setTotal(doc.numPages);
        setRenderError(null);
        doc.destroy();
      } catch {
        if (!cancelled) setRenderError("L'aperçu n'a pas pu être affiché.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data, maxPages, boxWidth]);

  const msg = error ?? renderError;
  return (
    <div style={{ position: "relative" }}>
      <div
        ref={boxRef}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          minHeight: data ? undefined : 320,
          opacity: loading ? 0.45 : 1,
          transition: "opacity 150ms ease",
        }}
      />
      {!data && !loading && !msg && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--muted)", fontSize: 13 }}>
          Choisis un thème pour voir l&apos;aperçu.
        </div>
      )}
      {loading && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", minHeight: 200 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 999, background: "var(--pop)", border: "1px solid var(--border2)", color: "var(--soft)", fontSize: 13 }}>
            <LoaderCircle size={16} className="animate-spin" style={{ color: "var(--accent)" }} />
            Génération de l&apos;aperçu…
          </span>
        </div>
      )}
      {msg && (
        <div style={{ padding: 16, color: "var(--danger)", fontSize: 13 }}>{msg}</div>
      )}
      {pages > 0 && total > pages && (
        <p style={{ marginTop: 10, color: "var(--muted)", fontSize: 12, textAlign: "center" }}>
          {pages} premières pages sur {total}.
        </p>
      )}
    </div>
  );
}

/** Récupère un PDF (GET ou POST JSON) en annulant la requête précédente. */
export function usePdfFetch() {
  const [data, setData] = useState<ArrayBuffer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  const load = async (url: string, body?: unknown) => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(url, {
        method: body === undefined ? "GET" : "POST",
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!r.ok) throw new Error(String(r.status));
      const buf = await r.arrayBuffer();
      if (ctrl.signal.aborted) return;
      setData(buf);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("La génération du PDF a échoué. Réessaie dans un instant.");
    } finally {
      if (ctrlRef.current === ctrl) setLoading(false);
    }
  };

  return { data, loading, error, load };
}
