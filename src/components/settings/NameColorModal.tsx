"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ModalOverlay } from "@/components/ModalOverlay";

/** Couleurs proposées pour les dossiers et les catégories (données). */
export const DATA_COLORS: { hex: string; label: string }[] = [
  { hex: "#f0a64a", label: "Ambre" },
  { hex: "#ef9b6b", label: "Abricot" },
  { hex: "#ef7d6b", label: "Corail" },
  { hex: "#e2649a", label: "Framboise" },
  { hex: "#b57be8", label: "Lilas" },
  { hex: "#8f9cf0", label: "Pervenche" },
  { hex: "#5a9ee0", label: "Bleu" },
  { hex: "#4fc0ad", label: "Menthe" },
  { hex: "#7ec46a", label: "Pistache" },
  { hex: "#e6c34a", label: "Citron" },
  { hex: "#a5805f", label: "Noisette" },
  { hex: "#8a93a6", label: "Gris" },
];

/** Couleur « hexadécimale à 6 chiffres » acceptée par le sélecteur natif. */
function toInputColor(c: string): string {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  return "#888888";
}

/** Pastilles de couleur + couleur personnalisée. */
export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const custom = !DATA_COLORS.some((c) => c.hex.toLowerCase() === value.toLowerCase());
  return (
    <div className="set-swatches">
      {DATA_COLORS.map((c) => {
        const on = c.hex.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={c.hex}
            type="button"
            className="set-swatch"
            style={{ background: c.hex }}
            aria-label={c.label}
            title={c.label}
            aria-pressed={on}
            onClick={() => onChange(c.hex)}
          >
            {on && <Check size={15} strokeWidth={3} />}
          </button>
        );
      })}
      <label
        className="set-swatch-custom"
        title="Couleur personnalisée"
        style={custom ? { borderStyle: "solid", borderColor: "var(--accent)", color: "var(--text)" } : undefined}
      >
        <input type="color" value={toInputColor(value)} onChange={(e) => onChange(e.target.value)} />
        Autre
      </label>
    </div>
  );
}

/**
 * Fenêtre « nom + couleur » pour créer ou modifier un dossier ou une catégorie.
 * `onSubmit` renvoie un message d'erreur, ou null quand tout s'est bien passé.
 */
export function NameColorModal({
  title,
  submitLabel,
  icon: Icon,
  initialName = "",
  initialColor = DATA_COLORS[0].hex,
  placeholder,
  fields = "both",
  onSubmit,
  onClose,
}: {
  title: string;
  submitLabel: string;
  icon: LucideIcon;
  initialName?: string;
  initialColor?: string;
  placeholder?: string;
  /** Champs affichés : nom, couleur ou les deux. */
  fields?: "both" | "name" | "color";
  onSubmit: (name: string, color: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    startTransition(async () => {
      const err = await onSubmit(name.trim(), color);
      if (err) setError(err);
      else onClose();
    });
  }

  return (
    <ModalOverlay title={title} onClose={onClose}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="set-preview">
          <span className="ic set-ic-c" style={{ "--c": color, width: 32, height: 32, borderRadius: 9, display: "grid", placeItems: "center" } as React.CSSProperties}>
            <Icon size={17} />
          </span>
          <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {name.trim() || placeholder || "Sans nom"}
          </span>
        </div>

        {fields !== "color" && (
          <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <span className="fl-label">Nom</span>
            <input
              className="fl-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              placeholder={placeholder}
              autoFocus
            />
          </label>
        )}

        {fields !== "name" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <span className="fl-label">Couleur</span>
            <ColorPicker value={color} onChange={setColor} />
          </div>
        )}

        {error && <p className="set-error">{error}</p>}

        <div className="set-foot">
          <button type="button" className="fl-btn fl-btn-secondary" onClick={onClose} disabled={pending}>
            Annuler
          </button>
          <button type="submit" className="fl-btn fl-btn-primary" disabled={pending || !name.trim()}>
            {pending ? "Enregistrement…" : submitLabel}
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}
