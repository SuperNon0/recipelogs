"use client";

import { useEffect, useRef, useState } from "react";
import { type CookbookTheme } from "@/lib/pdf/theme";

const ZOOM_PRESETS = [
  { key: "S", label: "Petit", height: 420 },
  { key: "M", label: "Moyen", height: 640 },
  { key: "L", label: "Grand", height: 940 },
  { key: "XL", label: "Plein écran", height: 0 },
] as const;

type ZoomKey = (typeof ZOOM_PRESETS)[number]["key"];

const DEBOUNCE_MS = 700;

/**
 * Aperçu PDF "fidèle" : on POST la config en cours sur l'API preview-pdf,
 * on récupère le binaire PDF, on l'affiche dans une iframe via un Blob URL.
 *
 * La requête est débouncée pour éviter de relancer Puppeteer à chaque frappe.
 */
export function CookbookPreview({
  cookbookId,
  cookbookName,
  description,
  theme,
  hasCover,
  hasToc,
  format,
  footer,
}: {
  cookbookId: number;
  cookbookName: string;
  description?: string;
  theme: CookbookTheme;
  hasCover: boolean;
  hasToc: boolean;
  format: string;
  footer: string;
}) {
  const [zoom, setZoom] = useState<ZoomKey>("M");
  const [fullscreen, setFullscreen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prevUrlRef = useRef<string | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const handle = setTimeout(async () => {
      const myId = ++reqIdRef.current;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/cookbooks/${cookbookId}/preview-pdf`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: cookbookName,
            description,
            format,
            hasCover,
            hasToc,
            footer,
            theme,
          }),
        });
        if (myId !== reqIdRef.current) return; // une requête plus récente est en cours
        if (!res.ok) {
          setError(`Erreur ${res.status}`);
          setLoading(false);
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = url;
        setPdfUrl(url);
        setLoading(false);
      } catch (e) {
        if (myId !== reqIdRef.current) return;
        setError(e instanceof Error ? e.message : "Erreur réseau");
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [
    cookbookId,
    cookbookName,
    description,
    format,
    hasCover,
    hasToc,
    footer,
    theme,
  ]);

  // Cleanup à la destruction
  useEffect(() => {
    return () => {
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
    };
  }, []);

  const currentZoom = ZOOM_PRESETS.find((z) => z.key === zoom) ?? ZOOM_PRESETS[1];
  const iframeSrc = pdfUrl ? `${pdfUrl}#toolbar=0&navpanes=0` : "";

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
            Aperçu PDF plein écran
            {loading && (
              <span style={{ color: "var(--muted)", marginLeft: 8 }}>
                · génération…
              </span>
            )}
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
        <div
          style={{
            flex: 1,
            position: "relative",
            background: "#2a2a2a",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          {iframeSrc && (
            <iframe
              title="Aperçu PDF (plein écran)"
              src={iframeSrc}
              style={{
                width: "100%",
                height: "100%",
                border: 0,
                display: "block",
                background: "#2a2a2a",
              }}
            />
          )}
          {loading && <LoadingOverlay />}
          {error && !loading && <ErrorOverlay message={error} />}
        </div>
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
            · génération du PDF…
          </span>
        )}
      </div>

      <div
        className="rounded-md overflow-hidden border"
        style={{
          borderColor: "var(--border)",
          background: "#2a2a2a",
          position: "relative",
          height: currentZoom.height,
        }}
      >
        {iframeSrc && (
          <iframe
            title="Aperçu PDF du cahier"
            src={iframeSrc}
            style={{
              width: "100%",
              height: "100%",
              border: 0,
              display: "block",
              background: "#2a2a2a",
            }}
          />
        )}
        {loading && !pdfUrl && <LoadingOverlay />}
        {error && !loading && <ErrorOverlay message={error} />}
      </div>
    </div>
  );
}

function LoadingOverlay() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#ccc",
        fontSize: "0.85rem",
        background: "rgba(0,0,0,0.25)",
        pointerEvents: "none",
      }}
    >
      ⏳ Génération de l&apos;aperçu PDF…
    </div>
  );
}

function ErrorOverlay({ message }: { message: string }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--danger)",
        fontSize: "0.85rem",
        background: "rgba(0,0,0,0.4)",
        textAlign: "center",
        padding: 16,
      }}
    >
      Aperçu indisponible : {message}
    </div>
  );
}
