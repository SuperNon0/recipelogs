"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CookbookTheme } from "@/lib/pdf/theme";

const ZOOM_PRESETS = [
  { key: "S", label: "Petit", height: 480 },
  { key: "M", label: "Moyen", height: 720 },
  { key: "L", label: "Grand", height: 980 },
  { key: "XL", label: "Plein écran", height: 0 },
] as const;

type ZoomKey = (typeof ZOOM_PRESETS)[number]["key"];

/**
 * Aperçu du cahier = **vrai PDF rendu par Puppeteer**.
 *
 * Débounce 1.5 s après le dernier changement pour éviter de spammer
 * Puppeteer côté serveur. Affichage du PDF dans un <iframe> via blob URL —
 * le viewer PDF natif du navigateur gère la pagination.
 */
export function CookbookPreview({
  cookbookId,
  cookbookName,
  description,
  format,
  hasCover,
  hasToc,
  footer,
  theme,
}: {
  cookbookId: number;
  cookbookName: string;
  description?: string;
  format: string;
  hasCover: boolean;
  hasToc: boolean;
  footer: string;
  theme: CookbookTheme;
}) {
  const [zoom, setZoom] = useState<ZoomKey>("M");
  const [fullscreen, setFullscreen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Payload à envoyer au serveur (mémorisé pour équivaloir à la dépendance)
  const payload = useMemo(
    () =>
      JSON.stringify({
        theme,
        name: cookbookName,
        description,
        hasCover,
        hasToc,
        footer,
        format,
      }),
    [theme, cookbookName, description, hasCover, hasToc, footer, format],
  );

  // Debounce + fetch du PDF quand le payload change
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/cookbooks/${cookbookId}/preview-pdf`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          signal: ctrl.signal,
        });
        if (!res.ok) {
          throw new Error(`Erreur ${res.status}`);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setPdfUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return url;
        });
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [payload, cookbookId]);

  // Cleanup blob URL au démontage
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      if (abortRef.current) abortRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentZoom = ZOOM_PRESETS.find((z) => z.key === zoom) ?? ZOOM_PRESETS[1];

  if (fullscreen) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(14, 15, 17, 0.96)",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          padding: 12,
          gap: 8,
        }}
      >
        <div className="flex items-center justify-between">
          <span className="fl-label" style={{ color: "var(--text)" }}>
            Aperçu PDF plein écran{loading ? " · génération…" : ""}
          </span>
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            className="fl-btn fl-btn-secondary"
            style={{ fontSize: "0.8rem" }}
          >
            ✕ Fermer
          </button>
        </div>
        <PdfFrame url={pdfUrl} loading={loading} error={error} fullHeight />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1 flex-wrap">
        <span className="fl-label" style={{ fontSize: "0.7rem", marginRight: 4 }}>
          Taille :
        </span>
        {ZOOM_PRESETS.map((p) => {
          const selected = p.key === zoom;
          if (p.key === "XL") {
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setFullscreen(true)}
                className="fl-btn"
                style={{ fontSize: "0.75rem", padding: "0.3rem 0.55rem" }}
                title="Plein écran"
              >
                ⛶ {p.label}
              </button>
            );
          }
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setZoom(p.key)}
              style={{
                padding: "0.3rem 0.55rem",
                fontSize: "0.75rem",
                fontWeight: selected ? 700 : 500,
                background: selected ? "var(--accent)" : "transparent",
                color: selected ? "var(--bg)" : "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              {p.label}
            </button>
          );
        })}
        {loading && (
          <span
            className="fl-label"
            style={{ fontSize: "0.7rem", color: "var(--muted)", marginLeft: 6 }}
          >
            · génération PDF…
          </span>
        )}
      </div>

      <PdfFrame url={pdfUrl} loading={loading} error={error} height={currentZoom.height} />
    </div>
  );
}

function PdfFrame({
  url,
  loading,
  error,
  height,
  fullHeight,
}: {
  url: string | null;
  loading: boolean;
  error: string | null;
  height?: number;
  fullHeight?: boolean;
}) {
  const style: React.CSSProperties = fullHeight
    ? { flex: 1, width: "100%", border: 0, display: "block", background: "#2a2a2a", borderRadius: 8 }
    : {
        width: "100%",
        height: height ?? 720,
        border: 0,
        display: "block",
        background: "#2a2a2a",
      };

  return (
    <div
      className="rounded-md overflow-hidden border relative"
      style={{
        borderColor: "var(--border)",
        background: "#2a2a2a",
        minHeight: fullHeight ? 0 : (height ?? 480),
      }}
    >
      {url && (
        <iframe
          key={url}
          title="Aperçu PDF du cahier"
          src={`${url}#toolbar=0&navpanes=0&view=FitH`}
          style={style}
        />
      )}
      {!url && !error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--muted)",
            fontSize: "0.85rem",
          }}
        >
          {loading ? "Génération du PDF…" : "Aperçu en préparation…"}
        </div>
      )}
      {error && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            textAlign: "center",
            color: "var(--danger)",
            fontSize: "0.85rem",
          }}
        >
          Erreur : {error}
        </div>
      )}
      {loading && url && (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            background: "rgba(0,0,0,0.6)",
            color: "#fff",
            fontSize: "0.7rem",
            padding: "4px 8px",
            borderRadius: 4,
          }}
        >
          Mise à jour…
        </div>
      )}
    </div>
  );
}
