"use client";

import { useRef, useTransition, useState, useMemo } from "react";
import { updateCookbookConfig } from "@/app/actions/cookbooks";
import {
  type CookbookTheme,
  type CoverLayout,
  type CoverBgPattern,
  type FontKey,
  THEME_COLORS,
  DEFAULT_THEME,
  COVER_LAYOUTS,
  COVER_LAYOUT_LABELS,
  COVER_BG_PATTERNS,
  COVER_BG_PATTERN_LABELS,
  FONTS,
  FONT_LABELS,
  FONT_KEYS,
  TEXT_SIZE_MIN,
  TEXT_SIZE_MAX,
  TEXT_SIZE_STEP,
} from "@/lib/pdf/theme";
import { CookbookPreview } from "./CookbookPreview";

const FONT_GROUPS: { label: string; cat: "sans" | "serif" | "display" | "mono" }[] = [
  { label: "Sans-serif", cat: "sans" },
  { label: "Serif", cat: "serif" },
  { label: "Display", cat: "display" },
  { label: "Mono", cat: "mono" },
];

export function CookbookConfigForm({
  cookbookId,
  defaultValues,
  defaultTheme,
}: {
  cookbookId: number;
  defaultValues: {
    name: string;
    description: string;
    format: string;
    hasToc: boolean;
    hasCover: boolean;
    hasLogo: boolean;
    footer: string;
  };
  defaultTheme: CookbookTheme;
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(defaultValues.name);
  const [description, setDescription] = useState(defaultValues.description);
  const [hasCover, setHasCover] = useState(defaultValues.hasCover);
  const [hasToc, setHasToc] = useState(defaultValues.hasToc);
  const [format, setFormat] = useState(defaultValues.format);
  const [footer, setFooter] = useState(defaultValues.footer);

  const [theme, setTheme] = useState<CookbookTheme>(defaultTheme);

  const setT = <K extends keyof CookbookTheme>(key: K, value: CookbookTheme[K]) =>
    setTheme((t) => ({ ...t, [key]: value }));

  const isDirty = useMemo(
    () =>
      JSON.stringify(theme) !== JSON.stringify(defaultTheme) ||
      name !== defaultValues.name ||
      description !== defaultValues.description ||
      hasCover !== defaultValues.hasCover ||
      hasToc !== defaultValues.hasToc ||
      format !== defaultValues.format ||
      footer !== defaultValues.footer,
    [theme, defaultTheme, name, description, hasCover, hasToc, format, footer, defaultValues],
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("name", name);
    fd.set("description", description);
    fd.set("format", format);
    fd.set("footer", footer);
    if (hasCover) fd.set("hasCover", "on");
    if (hasToc) fd.set("hasToc", "on");
    // hasLogo : conservé en BDD mais pas modifiable depuis l'UI pour l'instant
    if (defaultValues.hasLogo) fd.set("hasLogo", "on");
    fd.set("theme", JSON.stringify(theme));

    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateCookbookConfig(cookbookId, fd);
      if (result.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        setError(result.error);
      }
    });
  }

  function resetTheme() {
    setTheme(DEFAULT_THEME);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-6">
      {/* ── Colonne gauche : formulaire ───────────────── */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 min-w-0">
        {/* Identité */}
        <Section title="Identité du cahier">
          <label className="flex flex-col gap-1.5">
            <span className="fl-label">Nom *</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
              className="fl-input"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="fl-label">Description (apparaît sous le titre sur la couverture)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={2000}
              className="fl-input"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="fl-label">Format de page</span>
            <SegmentedControl
              value={format}
              onChange={setFormat}
              options={[
                { value: "A4", label: "A4 (210 × 297 mm)" },
                { value: "A5", label: "A5 (148 × 210 mm)" },
              ]}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="fl-label">Pied de page (sur chaque page)</span>
            <input
              value={footer}
              onChange={(e) => setFooter(e.target.value)}
              maxLength={500}
              className="fl-input"
              placeholder="Ex : © Ma Pâtisserie 2025"
            />
          </label>
        </Section>

        {/* Couleurs des recettes */}
        <Section title="Couleurs des recettes">
          <p className="text-xs text-[color:var(--muted)]">
            Le fond des pages de recettes est toujours blanc (impression sur feuille blanche).
          </p>
          <ColorRow
            label="Couleur d'accent (titres, traits)"
            value={theme.accentColor}
            onChange={(v) => setT("accentColor", v)}
          />
          <ColorRow
            label="Couleur du texte"
            value={theme.textColor}
            onChange={(v) => setT("textColor", v)}
          />
        </Section>

        {/* Typographie */}
        <Section title="Typographie">
          <FontPicker
            label="Police des titres"
            value={theme.titleFont}
            onChange={(v) => setT("titleFont", v)}
          />
          <FontPicker
            label="Police du corps"
            value={theme.bodyFont}
            onChange={(v) => setT("bodyFont", v)}
          />
          <NumberStepper
            label="Taille du texte"
            value={theme.textSize}
            min={TEXT_SIZE_MIN}
            max={TEXT_SIZE_MAX}
            step={TEXT_SIZE_STEP}
            unit="pt"
            onChange={(v) => setT("textSize", v)}
          />
        </Section>

        {/* Mise en page recette */}
        <Section title="Mise en page de la recette">
          <label className="flex flex-col gap-1.5">
            <span className="fl-label">Position des ingrédients</span>
            <SegmentedControl
              value={theme.ingredientsPosition}
              onChange={(v) => setT("ingredientsPosition", v)}
              options={[
                { value: "left", label: "Gauche" },
                { value: "right", label: "Droite" },
                { value: "top", label: "En haut" },
              ]}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="fl-label">Largeur de la colonne ingrédients</span>
            <SegmentedControl
              value={theme.ingredientsRatio}
              onChange={(v) => setT("ingredientsRatio", v)}
              options={[
                { value: "narrow", label: "Étroite" },
                { value: "balanced", label: "Équilibrée" },
                { value: "wide", label: "Large" },
              ]}
            />
          </label>
        </Section>

        {/* Sections affichées */}
        <Section title="Sections affichées sur la fiche">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Toggle label="Tags" checked={theme.showTags} onChange={(v) => setT("showTags", v)} />
            <Toggle label="Source" checked={theme.showSource} onChange={(v) => setT("showSource", v)} />
            <Toggle label="Note ★" checked={theme.showRating} onChange={(v) => setT("showRating", v)} />
            <Toggle label="Notes & astuces" checked={theme.showNotes} onChange={(v) => setT("showNotes", v)} />
            <Toggle label="Masse totale" checked={theme.showTotalMass} onChange={(v) => setT("showTotalMass", v)} />
            <Toggle label="Taille de portion" checked={theme.showPortion} onChange={(v) => setT("showPortion", v)} />
            <Toggle label="Numéros de page" checked={theme.showPageNumbers} onChange={(v) => setT("showPageNumbers", v)} />
          </div>
        </Section>

        {/* Couverture */}
        <Section title="Page de couverture">
          <Toggle
            label="Activer la page de couverture"
            checked={hasCover}
            onChange={setHasCover}
          />

          {hasCover && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="fl-label">Disposition du texte</span>
                <CoverLayoutGrid
                  value={theme.coverLayout}
                  onChange={(v) => setT("coverLayout", v)}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="fl-label">Style de fond</span>
                <CoverBgPatternGrid
                  value={theme.coverBgPattern}
                  c1={theme.coverBgColor}
                  c2={theme.coverBgColor2}
                  accent={theme.accentColor}
                  onChange={(v) => setT("coverBgPattern", v)}
                />
              </label>

              {theme.coverBgPattern !== "image" && (
                <ColorRow
                  label="Couleur du fond"
                  value={theme.coverBgColor}
                  onChange={(v) => setT("coverBgColor", v)}
                />
              )}

              {(theme.coverBgPattern === "gradient-diagonal" ||
                theme.coverBgPattern === "gradient-vertical" ||
                theme.coverBgPattern === "gradient-radial") && (
                <ColorRow
                  label="Couleur de fond (2ᵉ couleur du dégradé)"
                  value={theme.coverBgColor2}
                  onChange={(v) => setT("coverBgColor2", v)}
                />
              )}

              {theme.coverBgPattern === "image" && (
                <ImageUploadRow
                  value={theme.coverBgImageUrl}
                  onChange={(v) => setT("coverBgImageUrl", v)}
                  opacity={theme.coverBgImageOpacity}
                  onOpacityChange={(v) => setT("coverBgImageOpacity", v)}
                />
              )}

              <ColorRow
                label="Couleur du texte de la couverture"
                value={theme.coverTextColor}
                onChange={(v) => setT("coverTextColor", v)}
              />
            </>
          )}
        </Section>

        {/* Sommaire */}
        <Section title="Sommaire">
          <Toggle
            label="Activer le sommaire"
            checked={hasToc}
            onChange={setHasToc}
          />

          {hasToc && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="fl-label">Mode du sommaire</span>
                <SegmentedControl
                  value={theme.tocMode}
                  onChange={(v) => setT("tocMode", v)}
                  options={[
                    { value: "hidden", label: "Caché" },
                    { value: "flat", label: "Liste plate" },
                    { value: "by-section", label: "Par catégorie" },
                  ]}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="fl-label">Titre du sommaire</span>
                <input
                  type="text"
                  value={theme.tocTitle}
                  onChange={(e) => setT("tocTitle", e.target.value)}
                  maxLength={80}
                  className="fl-input"
                  placeholder="Contenu"
                />
              </label>

              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <Toggle
                  label="Pointillés (· · · · ·)"
                  checked={theme.tocDots}
                  onChange={(v) => setT("tocDots", v)}
                />
                <Toggle
                  label="Numéros de page"
                  checked={theme.tocPageNumbers}
                  onChange={(v) => setT("tocPageNumbers", v)}
                />
              </div>
            </>
          )}
        </Section>

        {/* Actions */}
        {error && (
          <p className="text-sm" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}

        <div className="flex items-center gap-3 flex-wrap sticky bottom-2 bg-[color:var(--surface)] p-3 rounded-md border border-[color:var(--border)] z-10">
          <button
            type="submit"
            disabled={pending}
            className="fl-btn fl-btn-primary"
          >
            {pending ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button
            type="button"
            onClick={resetTheme}
            disabled={pending}
            className="fl-btn"
          >
            Réinitialiser le thème
          </button>
          {isDirty && !saved && (
            <span className="fl-label" style={{ color: "var(--accent)" }}>
              Modifications non enregistrées
            </span>
          )}
          {saved && (
            <span className="fl-label" style={{ color: "var(--accent-2)" }}>
              ✓ Enregistré
            </span>
          )}
        </div>
      </form>

      {/* ── Colonne droite : aperçu flottant ──────────── */}
      <aside className="hidden lg:block">
        <div className="sticky top-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="fl-label" style={{ fontSize: "0.8rem" }}>
              Aperçu (mise à jour en direct)
            </span>
            <a
              href={`/cookbooks/${cookbookId}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="fl-label hover:text-[color:var(--text)]"
              style={{ fontSize: "0.75rem" }}
            >
              ⬇ PDF complet
            </a>
          </div>
          <CookbookPreview
            cookbookName={name}
            description={description}
            theme={theme}
            hasCover={hasCover}
          />
        </div>
      </aside>

      {/* Aperçu mobile : en haut, quand on n'est pas en lg */}
      <aside className="lg:hidden order-first">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="fl-label" style={{ fontSize: "0.8rem" }}>
              Aperçu
            </span>
            <a
              href={`/cookbooks/${cookbookId}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="fl-label hover:text-[color:var(--text)]"
              style={{ fontSize: "0.75rem" }}
            >
              ⬇ PDF complet
            </a>
          </div>
          <CookbookPreview
            cookbookName={name}
            description={description}
            theme={theme}
            hasCover={hasCover}
          />
        </div>
      </aside>
    </div>
  );
}

// ─── Sous-composants ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details open className="fl-card" style={{ padding: 0 }}>
      <summary
        className="cursor-pointer select-none px-4 py-3 fl-label"
        style={{ fontSize: "0.85rem", color: "var(--text)" }}
      >
        {title}
      </summary>
      <div className="px-4 pb-4 flex flex-col gap-4">{children}</div>
    </details>
  );
}

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
                border: selected
                  ? "2px solid var(--text)"
                  : "1px solid var(--border)",
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

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div
      className="inline-flex rounded-md overflow-hidden border flex-wrap"
      style={{ borderColor: "var(--border)" }}
      role="tablist"
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className="px-3 py-1.5 text-sm transition-colors"
            style={{
              background: selected ? "var(--accent)" : "transparent",
              color: selected ? "var(--bg)" : "var(--text)",
              fontWeight: selected ? 600 : 400,
              borderRight: "1px solid var(--border)",
            }}
            role="tab"
            aria-selected={selected}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className="flex items-center gap-2 cursor-pointer"
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
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
              {keys.map((key) => (
                <option key={key} value={key} style={{ fontFamily: FONTS[key].family }}>
                  {FONT_LABELS[key]}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
      <span
        className="text-xs text-[color:var(--muted)]"
        style={{ fontFamily: FONTS[value]?.family }}
      >
        Aperçu : Tarte aux fraises 1 234 g
      </span>
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
          {value}{unit ? ` ${unit}` : ""}
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

function CoverLayoutGrid({
  value,
  onChange,
}: {
  value: CoverLayout;
  onChange: (v: CoverLayout) => void;
}) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-3 gap-2">
      {COVER_LAYOUTS.map((layout) => {
        const selected = layout === value;
        return (
          <button
            key={layout}
            type="button"
            onClick={() => onChange(layout)}
            className="rounded-md p-2 flex flex-col items-center gap-1.5 transition-colors"
            style={{
              border: selected ? "2px solid var(--accent)" : "1px solid var(--border)",
              background: "var(--card)",
            }}
            aria-pressed={selected}
          >
            <CoverLayoutThumb layout={layout} />
            <span className="text-[0.65rem] text-[color:var(--muted)] text-center leading-tight">
              {COVER_LAYOUT_LABELS[layout]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CoverLayoutThumb({ layout }: { layout: CoverLayout }) {
  const w = 60, h = 80;
  const txt = "var(--text)";
  const fill = "var(--accent)";
  const border = "var(--border)";
  const bgFill = "var(--bg)";

  let inner: React.ReactNode = null;
  switch (layout) {
    case "circle":
      inner = (
        <>
          <rect x={0.5} y={0.5} width={w - 1} height={h - 1} fill={bgFill} stroke={border} />
          <circle cx={w / 2} cy={h / 2} r={16} fill={fill} fillOpacity={0.18} stroke={fill} />
          <text x={w / 2} y={h / 2 + 1} textAnchor="middle" fontSize="6" fill={txt}>
            Titre
          </text>
        </>
      );
      break;
    case "framed":
      inner = (
        <>
          <rect x={0.5} y={0.5} width={w - 1} height={h - 1} fill={bgFill} stroke={border} />
          <rect x={12} y={28} width={w - 24} height={24} fill="none" stroke={txt} strokeWidth="0.7" />
          <text x={w / 2} y={42} textAnchor="middle" fontSize="6" fill={txt}>
            Titre
          </text>
        </>
      );
      break;
    case "full-bleed":
      inner = (
        <>
          <rect x={0.5} y={0.5} width={w - 1} height={h - 1} fill={bgFill} stroke={border} />
          <text x={w / 2} y={h / 2 + 2} textAnchor="middle" fontSize="9" fontWeight="700" fill={txt}>
            Titre
          </text>
        </>
      );
      break;
    case "minimal":
      inner = (
        <>
          <rect x={0.5} y={0.5} width={w - 1} height={h - 1} fill={bgFill} stroke={border} />
          <line x1={10} y1={36} x2={w - 10} y2={36} stroke={fill} strokeWidth="1" />
          <line x1={10} y1={48} x2={w - 10} y2={48} stroke={fill} strokeWidth="1" />
          <text x={w / 2} y={44} textAnchor="middle" fontSize="6" fontWeight="700" fill={txt}>
            Titre
          </text>
        </>
      );
      break;
    case "typo-large":
      inner = (
        <>
          <rect x={0.5} y={0.5} width={w - 1} height={h - 1} fill={bgFill} stroke={border} />
          <text x={w / 2} y={h / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill={fill}>
            Titre
          </text>
        </>
      );
      break;
    case "typo-divider":
      inner = (
        <>
          <rect x={0.5} y={0.5} width={w - 1} height={h - 1} fill={bgFill} stroke={border} />
          <line x1={20} y1={32} x2={w - 20} y2={32} stroke={fill} strokeWidth="0.6" />
          <line x1={20} y1={50} x2={w - 20} y2={50} stroke={fill} strokeWidth="0.6" />
          <text x={w / 2} y={43} textAnchor="middle" fontSize="6" fontWeight="700" fill={txt}>
            TITRE
          </text>
        </>
      );
      break;
  }

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={42} height={56}>
      {inner}
    </svg>
  );
}

function CoverBgPatternGrid({
  value,
  c1,
  c2,
  accent,
  onChange,
}: {
  value: CoverBgPattern;
  c1: string;
  c2: string;
  accent: string;
  onChange: (v: CoverBgPattern) => void;
}) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-3 gap-2">
      {COVER_BG_PATTERNS.map((p) => {
        const selected = p === value;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className="rounded-md p-2 flex flex-col items-center gap-1.5 transition-colors"
            style={{
              border: selected ? "2px solid var(--accent)" : "1px solid var(--border)",
              background: "var(--card)",
            }}
            aria-pressed={selected}
          >
            <CoverBgPatternThumb pattern={p} c1={c1} c2={c2} accent={accent} />
            <span className="text-[0.65rem] text-[color:var(--muted)] text-center leading-tight">
              {COVER_BG_PATTERN_LABELS[p]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CoverBgPatternThumb({
  pattern,
  c1,
  c2,
  accent,
}: {
  pattern: CoverBgPattern;
  c1: string;
  c2: string;
  accent: string;
}) {
  const w = 50, h = 66;
  let bgStyle: React.CSSProperties = { background: c1 };
  let inner: React.ReactNode = null;

  switch (pattern) {
    case "plain":
      bgStyle = { background: c1 };
      break;
    case "gradient-diagonal":
      bgStyle = { background: `linear-gradient(135deg, ${c1}, ${c2})` };
      break;
    case "gradient-vertical":
      bgStyle = { background: `linear-gradient(180deg, ${c1}, ${c2})` };
      break;
    case "gradient-radial":
      bgStyle = { background: `radial-gradient(circle at center, ${c1}, ${c2})` };
      break;
    case "accent-corner":
      bgStyle = { background: c1 };
      inner = (
        <svg
          viewBox={`0 0 ${w} ${h}`}
          width={w}
          height={h}
          style={{ position: "absolute", inset: 0 }}
        >
          <polygon points={`0,0 ${w},0 0,${h * 0.75}`} fill={accent} fillOpacity={0.5} />
        </svg>
      );
      break;
    case "image":
      bgStyle = { background: c1 };
      inner = (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--muted)",
            fontSize: "0.65rem",
          }}
        >
          📷
        </div>
      );
      break;
  }

  return (
    <div
      style={{
        ...bgStyle,
        width: w,
        height: h,
        position: "relative",
        border: "1px solid rgba(0,0,0,0.15)",
        overflow: "hidden",
        borderRadius: 3,
      }}
    >
      {inner}
    </div>
  );
}

function ImageUploadRow({
  value,
  onChange,
  opacity,
  onOpacityChange,
}: {
  value: string;
  onChange: (v: string) => void;
  opacity: number;
  onOpacityChange: (v: number) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Le fichier doit être une image.");
      return;
    }
    if (file.size > 2_000_000) {
      setError("Image trop lourde (max 2 Mo).");
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result));
    reader.readAsDataURL(file);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="fl-label">URL ou upload d&apos;une image</span>
        <input
          type="text"
          value={value && !value.startsWith("data:") ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://exemple.com/mon-fond.jpg"
          className="fl-input"
        />
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            className="fl-btn"
            onClick={() => fileRef.current?.click()}
          >
            📁 Choisir un fichier…
          </button>
          {value && (
            <button
              type="button"
              className="fl-btn"
              onClick={() => onChange("")}
              style={{ color: "var(--danger)" }}
            >
              ✕ Retirer
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onPickFile}
            className="hidden"
          />
        </div>
        {value && (
          <div
            className="rounded-md overflow-hidden mt-1"
            style={{
              width: 80,
              height: 80,
              border: "1px solid var(--border)",
              backgroundImage: `url("${value.replace(/"/g, "%22")}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        )}
        {error && <span className="text-xs" style={{ color: "var(--danger)" }}>{error}</span>}
      </div>

      <NumberStepper
        label="Opacité de l'image"
        value={opacity}
        min={0.05}
        max={1}
        step={0.05}
        onChange={onOpacityChange}
      />
    </div>
  );
}
