"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleHelp, X } from "lucide-react";
import { useEscape, useIsPhone } from "./useMedia";
import { STOP } from "./Menu";

/**
 * Petit « ? » à côté d'une information. Au clic, ouvre une bulle qui explique
 * ce que c'est, comment c'est calculé et un exemple.
 * Ordinateur : bulle ancrée au bouton. Téléphone : feuille qui remonte du bas.
 */
export function Help({
  title,
  children,
  calc,
  example,
  label,
}: {
  title: string;
  /** Ce que c'est (texte simple). */
  children: React.ReactNode;
  /** Comment c'est calculé (affiché en bloc à chasse fixe). */
  calc?: string;
  /** Exemple concret. */
  example?: React.ReactNode;
  /** Libellé accessible (par défaut « Aide : <title> »). */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const phone = useIsPhone();
  const close = useCallback(() => setOpen(false), []);
  useEscape(open, close);

  useLayoutEffect(() => {
    if (!open || phone || !btnRef.current || !popRef.current) return;
    const b = btnRef.current.getBoundingClientRect();
    const p = popRef.current.getBoundingClientRect();
    let left = b.left + b.width / 2 - 40;
    left = Math.max(12, Math.min(left, window.innerWidth - p.width - 12));
    let top = b.bottom + 8;
    if (top + p.height > window.innerHeight - 12) top = Math.max(12, b.top - p.height - 8);
    setPos({ left, top });
  }, [open, phone]);

  useEffect(() => {
    if (!open || phone) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, phone]);

  const body = (
    <>
      <h4>
        <CircleHelp size={16} />
        <span style={{ flex: 1 }}>{title}</span>
        <button
          type="button"
          onClick={close}
          aria-label="Fermer"
          style={{ background: "none", border: "none", color: "var(--muted)", padding: 2, display: "grid" }}
        >
          <X size={15} />
        </button>
      </h4>
      <div>{children}</div>
      {calc && (
        <>
          <div className="sect">Comment c&apos;est calculé</div>
          <div className="calc">{calc}</div>
        </>
      )}
      {example && (
        <>
          <div className="sect">Exemple</div>
          <div style={{ marginTop: 4 }}>{example}</div>
        </>
      )}
    </>
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="help-btn"
        aria-label={label ?? `Aide : ${title}`}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setPos(null);
          setOpen((v) => !v);
        }}
      >
        ?
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div style={{ display: "contents" }} {...STOP}>
          {phone ? (
            <>
              <div className="sheet-veil" onClick={close} />
              <div className="sheet help-pop" role="dialog" aria-label={title} style={{ position: "fixed", width: "auto", borderRadius: "20px 20px 0 0", fontSize: 14.5, padding: "8px 18px calc(22px + env(safe-area-inset-bottom))" }}>
                <div className="sheet-grab" />
                {body}
              </div>
            </>
          ) : (
            <div
              ref={popRef}
              className="help-pop"
              role="dialog"
              aria-label={title}
              style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
            >
              {body}
            </div>
          )}
          </div>,
          document.body,
        )}
    </>
  );
}
