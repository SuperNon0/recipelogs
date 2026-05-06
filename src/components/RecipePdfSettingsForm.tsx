"use client";

import { useState, useTransition } from "react";
import {
  type RecipePdfSettings,
  THEME_COLORS,
  FONTS,
  FONT_LABELS,
  FONT_KEYS,
  TEXT_SIZE_MIN,
  TEXT_SIZE_MAX,
  TEXT_SIZE_STEP,
  type FontKey,
} from "@/lib/pdf/theme";
import { saveRecipePdfSettings } from "@/app/actions/settings";

const FONT_GROUPS: { label: string; cat: "sans" | "serif" | "display" | "mono" }[] = [
  { label: "Sans-serif", cat: "sans" },
  { label: "Serif", cat: "serif" },
  { label: "Display", cat: "display" },
  { label: "Mono", cat: "mono" },
];

/**
 * Réglages du PDF généré pour UNE recette (route /recipes/[id]/pdf).
 * Le PDF des cahiers a son propre système de thème.
 */
export function RecipePdfSettingsForm({
  initial,
}: {
  initial: RecipePdfSettings;
}) {
  const [s, setS] = useState<RecipePdfSettings>(initial);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof RecipePdfSettings>(
    key: K,
    value: RecipePdfSettings[K],
  ) => setS((prev) => ({ ...prev, [key]: value }));

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r = await saveRecipePdfSettings(s);
      if (r.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="fl-label">
        Ces réglages s&apos;appliquent quand tu télécharges le PDF d&apos;une seule recette
        (les cahiers ont leur propre thème).
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="fl-label">Format de page</span>
        <div
          className="inline-flex rounded-md overflow-hidden border w-fit"
          style={{ borderColor: "var(--border)" }}
        >
          {[
            { v: "A4", l: "A4 (210 × 297 mm)" },
            { v: "A5", l: "A5 (148 × 210 mm)" },
          ].map((o) => {
            const sel = o.v === s.format;
            return (
              <button
                key={o.v}
                type="button"
                onClick={() => set("format", o.v as "A4" | "A5")}
                className="px-3 py-1.5 text-sm transition-colors"
                style={{
                  background: sel ? "var(--accent)" : "transparent",
                  color: sel ? "var(--bg)" : "var(--text)",
                  fontWeight: sel ? 600 : 400,
                  borderRight: "1px solid var(--border)",
                }}
              >
                {o.l}
              </button>
            );
          })}
        </div>
      </label>

      <ColorRow
        label="Couleur d'accent (titres, traits)"
        value={s.accentColor}
        onChange={(v) => set("accentColor", v)}
      />
      <ColorRow
        label="Couleur du texte"
        value={s.textColor}
        onChange={(v) => set("textColor", v)}
      />

      <FontPicker
        label="Police des titres"
        value={s.titleFont}
        onChange={(v) => set("titleFont", v)}
      />
      <FontPicker
        label="Police du corps"
        value={s.bodyFont}
        onChange={(v) => set("bodyFont", v)}
      />

      <NumberStepper
        label="Taille du texte"
        value={s.textSize}
        min={TEXT_SIZE_MIN}
        max={TEXT_SIZE_MAX}
        step={TEXT_SIZE_STEP}
        unit="pt"
        onChange={(v) => set("textSize", v)}
      />

      <div className="flex flex-col gap-2 pt-2 border-t border-[color:var(--border)]">
        <span className="fl-label">Sections affichées sur la fiche</span>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <Toggle label="Tags" checked={s.showTags} onChange={(v) => set("showTags", v)} />
          <Toggle label="Source" checked={s.showSource} onChange={(v) => set("showSource", v)} />
          <Toggle label="Note ★" checked={s.showRating} onChange={(v) => set("showRating", v)} />
          <Toggle label="Notes & astuces" checked={s.showNotes} onChange={(v) => set("showNotes", v)} />
          <Toggle label="Masse totale" checked={s.showTotalMass} onChange={(v) => set("showTotalMass", v)} />
          <Toggle label="Taille de portion" checked={s.showPortion} onChange={(v) => set("showPortion", v)} />
        </div>
      </div>

      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="fl-btn fl-btn-primary"
        >
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        {saved && (
          <span className="fl-label" style={{ color: "var(--accent-2)" }}>
            ✓ Enregistré
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Sous-composants (copiés/simplifiés depuis CookbookConfigForm) ──────────

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="fl-label">{label}</span>
        <span className="text-xs text-[color:var(--muted)] font-mono">{value}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {THEME_COLORS.map((c) => {
          const selected = c.toLowerCase() === value.toLowerCase();
          return (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              className="rounded-full transition-transform"
              style={{
                width: 24,
                height: 24,
                background: c,
                border: selected ? "2px solid var(--text)" : "1px solid var(--border)",
                transform: selected ? "scale(1.1)" : "none",
              }}
              aria-label={`Couleur ${c}`}
            />
          );
        })}
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-7 h-7 rounded-full cursor-pointer border border-[color:var(--border)]"
          aria-label="Couleur personnalisée"
          title="Choisir une couleur personnalisée"
          style={{ padding: 0, background: "transparent" }}
        />
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[color:var(--accent)]"
      />
      <span className="fl-label">{label}</span>
    </label>
  );
}

function FontPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: FontKey;
  onChange: (v: FontKey) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="fl-label">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as FontKey)}
        className="fl-input"
        style={{ fontFamily: FONTS[value]?.family }}
      >
        {FONT_GROUPS.map((group) => {
          const keys = FONT_KEYS.filter((k) => FONTS[k].category === group.cat);
          if (keys.length === 0) return null;
          return (
            <optgroup key={group.cat} label={group.label}>
              {keys.map((k) => (
                <option key={k} value={k} style={{ fontFamily: FONTS[k].family }}>
                  {FONT_LABELS[k]}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
    </label>
  );
}

function NumberStepper({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const dec = () => onChange(Math.max(min, Math.round((value - step) * 10) / 10));
  const inc = () => onChange(Math.min(max, Math.round((value + step) * 10) / 10));
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="fl-label">{label}</span>
        <span className="font-mono text-sm" style={{ color: "var(--accent)" }}>
          {value}
          {unit ? ` ${unit}` : ""}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={dec}
          disabled={value <= min}
          className="fl-btn"
          style={{ width: 36, height: 36, padding: 0, fontSize: "1.1rem", fontWeight: 700 }}
          aria-label="Diminuer"
        >
          −
        </button>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1"
          style={{
            accentColor: "var(--accent)",
            background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, var(--border) ${pct}%, var(--border) 100%)`,
          }}
        />
        <button
          type="button"
          onClick={inc}
          disabled={value >= max}
          className="fl-btn"
          style={{ width: 36, height: 36, padding: 0, fontSize: "1.1rem", fontWeight: 700 }}
          aria-label="Augmenter"
        >
          +
        </button>
      </div>
    </div>
  );
}
