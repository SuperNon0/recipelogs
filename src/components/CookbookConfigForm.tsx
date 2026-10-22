"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookImage,
  BookOpen,
  ChevronDown,
  Columns2,
  Eye,
  FileText,
  ImageIcon,
  LayoutTemplate,
  ListChecks,
  ListOrdered,
  Palette,
  RotateCcw,
  Save,
  Settings2,
  Trash2,
  Type,
  Upload,
  X,
} from "lucide-react";
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
  DENSITIES,
  DENSITY_LABELS,
  FONTS,
  FONT_LABELS,
  FONT_KEYS,
  INGREDIENT_POSITIONS,
  INGREDIENT_POSITION_LABELS,
  INGREDIENT_RATIOS,
  INGREDIENT_RATIO_LABELS,
  INGREDIENT_STYLES,
  INGREDIENT_STYLE_LABELS,
  PAGE_FRAMES,
  PAGE_FRAME_LABELS,
  PAPERS,
  PAPER_LABELS,
  PHOTO_MODES,
  PHOTO_MODE_LABELS,
  RECIPE_LAYOUTS,
  RECIPE_LAYOUT_HINTS,
  RECIPE_LAYOUT_LABELS,
  SECTION_TITLE_STYLES,
  SECTION_TITLE_STYLE_LABELS,
  STEP_STYLES,
  STEP_STYLE_LABELS,
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
  TEXT_SIZE_STEP,
  TITLE_ALIGNS,
  TITLE_ALIGN_LABELS,
  TITLE_STYLES,
  TITLE_STYLE_LABELS,
  coverPatternCss,
} from "@/lib/pdf/theme";
import { Help } from "./ui/Help";
import { ModalOverlay } from "./ModalOverlay";
import { ThemeThumb } from "./ThemeThumb";
import { CookbookPreview, useCookbookPreview } from "./CookbookPreview";
import { DeleteCookbookButton } from "./DeleteCookbookButton";

/** Thème PDF enregistré, proposé dans « Thème ». */
export type CookbookThemeOption = {
  id: number;
  name: string;
  description: string | null;
  format: "A4" | "A5";
  isDefault: boolean;
  config: CookbookTheme;
};

/**
 * Empreinte du style d'un thème, pour reconnaître le thème appliqué.
 * On ignore ce qui est propre au cahier : titre du sommaire et image de couverture.
 */
function styleKey(t: CookbookTheme, format: string, ignorePattern: boolean): string {
  return JSON.stringify({
    ...t,
    tocTitle: "",
    coverBgImageUrl: "",
    coverBgImageOpacity: 0,
    coverBgPattern: ignorePattern ? "" : t.coverBgPattern,
    format,
  });
}

/** Réglages du cahier : thème, couverture, sommaire, mise en page détaillée. */
export function CookbookConfigForm({
  cookbookId,
  defaultValues,
  defaultTheme,
  themes,
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
  themes: CookbookThemeOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const [name, setName] = useState(defaultValues.name);
  const [description, setDescription] = useState(defaultValues.description);
  const [hasCover, setHasCover] = useState(defaultValues.hasCover);
  const [hasToc, setHasToc] = useState(defaultValues.hasToc);
  const [format, setFormat] = useState(defaultValues.format);
  const [footer, setFooter] = useState(defaultValues.footer);
  const [theme, setTheme] = useState<CookbookTheme>(defaultTheme);

  const set = <K extends keyof CookbookTheme>(key: K, value: CookbookTheme[K]) =>
    setTheme((t) => ({ ...t, [key]: value }));

  const savedKey = useMemo(
    () =>
      JSON.stringify([
        defaultValues.name,
        defaultValues.description,
        defaultValues.hasCover,
        defaultValues.hasToc,
        defaultValues.format,
        defaultValues.footer,
        defaultTheme,
      ]),
    [defaultValues, defaultTheme],
  );
  const dirty = JSON.stringify([name, description, hasCover, hasToc, format, footer, theme]) !== savedKey;

  // Prévient avant de quitter la page avec des modifications non enregistrées.
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  const preview = useCookbookPreview(cookbookId, {
    name,
    description,
    theme,
    hasCover,
    hasToc,
    format,
    footer,
  });

  const ignorePattern = theme.coverBgPattern === "image";
  const currentKey = styleKey(theme, format, ignorePattern);
  const currentTheme = themes.find((t) => styleKey(t.config, t.format, ignorePattern) === currentKey) ?? null;

  function applyTheme(t: CookbookThemeOption) {
    setTheme((prev) => {
      const next: CookbookTheme = { ...t.config, tocTitle: prev.tocTitle };
      // L'image de couverture choisie pour ce cahier est gardée si le thème n'en a pas.
      if (!t.config.coverBgImageUrl && prev.coverBgImageUrl) {
        next.coverBgImageUrl = prev.coverBgImageUrl;
        next.coverBgImageOpacity = prev.coverBgImageOpacity;
        if (prev.coverBgPattern === "image") next.coverBgPattern = "image";
      }
      return next;
    });
    setFormat(t.format);
    setMsg({ ok: true, text: `Thème « ${t.name} » appliqué. Enregistre pour le garder.` });
  }

  function save() {
    const fd = new FormData();
    fd.set("name", name);
    fd.set("description", description);
    fd.set("format", format);
    fd.set("footer", footer);
    if (hasCover) fd.set("hasCover", "on");
    if (hasToc) fd.set("hasToc", "on");
    // hasLogo : conservé en base mais pas modifiable depuis l'interface pour l'instant.
    if (defaultValues.hasLogo) fd.set("hasLogo", "on");
    fd.set("theme", JSON.stringify(theme));

    setMsg(null);
    startTransition(async () => {
      const r = await updateCookbookConfig(cookbookId, fd);
      if (r.ok) {
        setMsg({ ok: true, text: "Réglages enregistrés." });
        router.refresh();
      } else setMsg({ ok: false, text: r.error });
    });
  }

  function cancel() {
    setName(defaultValues.name);
    setDescription(defaultValues.description);
    setHasCover(defaultValues.hasCover);
    setHasToc(defaultValues.hasToc);
    setFormat(defaultValues.format);
    setFooter(defaultValues.footer);
    setTheme(defaultTheme);
    setMsg(null);
  }

  const sideBySide = theme.recipeLayout === "classique" || theme.recipeLayout === "magazine";
  const gradient =
    theme.coverBgPattern === "gradient-diagonal" ||
    theme.coverBgPattern === "gradient-vertical" ||
    theme.coverBgPattern === "gradient-radial" ||
    theme.coverBgPattern === "dots" ||
    theme.coverBgPattern === "stripes" ||
    theme.coverBgPattern === "grid";

  return (
    <div>
      <div className="theme-editor">
        <div className="theme-editor-form">
          {/* ── Thème ─────────────────────────────────── */}
          <Section
            icon={Palette}
            title="Thème"
            summary={currentTheme ? currentTheme.name : "Réglages personnalisés"}
            open
            help="Un thème PDF regroupe tout l'habillage : couleurs, polices, disposition des recettes, fond de page et couverture. « Appliquer » recopie ses réglages dans ce cahier ; tu peux ensuite tout ajuster dans les sections ci-dessous sans modifier le thème lui-même. L'image de couverture et le titre du sommaire du cahier sont conservés."
          >
            {themes.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: 13 }}>Aucun thème enregistré.</p>
            ) : (
              <div className="cb-themes">
                {themes.map((t) => {
                  const current = currentTheme?.id === t.id;
                  return (
                    <div key={t.id} className="cb-theme" data-current={current ? "true" : undefined}>
                      <ThemeThumb config={t.config} width={34} />
                      <div className="cb-theme-txt">
                        <b title={t.name}>{t.name}</b>
                        <small>
                          {RECIPE_LAYOUT_LABELS[t.config.recipeLayout]} · {t.format}
                          {t.isDefault ? " · par défaut" : ""}
                        </small>
                      </div>
                      {current ? (
                        <span className="fl-tag" style={{ color: "var(--accent)", borderColor: "rgba(240,166,74,.35)", background: "transparent" }}>
                          Appliqué
                        </span>
                      ) : (
                        <button type="button" className="fl-btn fl-btn-secondary" style={{ height: 32, padding: "0 10px" }} onClick={() => applyTheme(t)}>
                          Appliquer
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Link href="/settings/themes" className="fl-btn fl-btn-ghost">
                <Settings2 size={15} /> Gérer les thèmes
              </Link>
              <button
                type="button"
                className="fl-btn fl-btn-ghost"
                onClick={() => {
                  if (confirm("Remettre tous les réglages d'apparence du cahier à leurs valeurs de base ?")) setTheme(DEFAULT_THEME);
                }}
              >
                <RotateCcw size={15} /> Réglages de base
              </button>
            </div>
          </Section>

          {/* ── Cahier ────────────────────────────────── */}
          <Section icon={FileText} title="Cahier" summary={`${format} · ${name || "sans nom"}`} open>
            <Field label="Nom">
              <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} className="fl-input" />
            </Field>
            <Field label="Description (sous le titre, sur la couverture)">
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={2000} className="fl-input" />
            </Field>
            <Choice
              label="Format de page"
              help={{ title: "Format de page", text: "Taille du papier du PDF. A4 = feuille classique (21 × 29,7 cm). A5 = moitié d'A4 (14,8 × 21 cm), pratique pour un classeur de cuisine." }}
              value={format}
              onChange={setFormat}
              options={[{ value: "A4", label: "A4" }, { value: "A5", label: "A5" }]}
            />
            <Field
              label="Pied de page (facultatif)"
              help={{ title: "Pied de page", text: "Petit texte répété en bas de chaque page de recette (pas sur la couverture ni le sommaire). Le numéro de page reste toujours centré." }}
            >
              <input value={footer} onChange={(e) => setFooter(e.target.value)} maxLength={500} className="fl-input" placeholder="Ex. Ma pâtisserie, 2026" />
            </Field>
            <Choice
              label="Position du pied de page"
              value={theme.footerAlign}
              onChange={(v) => set("footerAlign", v)}
              options={[{ value: "left", label: "À gauche" }, { value: "right", label: "À droite" }]}
            />
          </Section>

          {/* ── Couverture ────────────────────────────── */}
          <Section
            icon={BookImage}
            title="Couverture"
            summary={hasCover ? COVER_LAYOUT_LABELS[theme.coverLayout] : "Sans couverture"}
            help="Première page du PDF, avec le nom du cahier et sa description."
          >
            <Toggle label="Page de couverture" checked={hasCover} onChange={setHasCover} />
            {hasCover && (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <Label text="Placement du titre" />
                  <div className="cb-cover-grid">
                    {COVER_LAYOUTS.map((l) => (
                      <button key={l} type="button" className="cb-cover-opt" aria-pressed={l === theme.coverLayout} onClick={() => set("coverLayout", l)}>
                        <CoverLayoutThumb layout={l} />
                        {COVER_LAYOUT_LABELS[l]}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <Label text="Fond" />
                  <div className="cb-cover-grid">
                    {COVER_BG_PATTERNS.map((p) => (
                      <button key={p} type="button" className="cb-cover-opt" aria-pressed={p === theme.coverBgPattern} onClick={() => set("coverBgPattern", p)}>
                        <CoverBgPatternThumb pattern={p} c1={theme.coverBgColor} c2={theme.coverBgColor2} accent={theme.coverAccentColor} image={theme.coverBgImageUrl} />
                        {COVER_BG_PATTERN_LABELS[p]}
                      </button>
                    ))}
                  </div>
                </div>
                {theme.coverBgPattern === "image" ? (
                  <ImageUploadRow
                    value={theme.coverBgImageUrl}
                    onChange={(v) => set("coverBgImageUrl", v)}
                    opacity={theme.coverBgImageOpacity}
                    onOpacityChange={(v) => set("coverBgImageOpacity", v)}
                  />
                ) : (
                  <ColorField label={gradient ? "Couleur de fond 1" : "Couleur de fond"} value={theme.coverBgColor} onChange={(v) => set("coverBgColor", v)} />
                )}
                {gradient && <ColorField label="Couleur de fond 2" value={theme.coverBgColor2} onChange={(v) => set("coverBgColor2", v)} />}
                {theme.coverBgPattern === "accent-corner" && (
                  <ColorField label="Couleur du coin" value={theme.coverAccentColor} onChange={(v) => set("coverAccentColor", v)} />
                )}
                <ColorField label="Couleur du texte" value={theme.coverTextColor} onChange={(v) => set("coverTextColor", v)} />
              </>
            )}
          </Section>

          {/* ── Sommaire et numérotation ──────────────── */}
          <Section icon={ListOrdered} title="Sommaire et numérotation" summary={hasToc ? "Avec sommaire" : "Sans sommaire"}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontSize: 13.5, color: "var(--soft)", display: "flex", alignItems: "center" }}>
                Sommaire
                <Help title="Sommaire">
                  Page placée après la couverture, qui liste les chapitres et les recettes du cahier dans
                  leur ordre, avec le numéro de la page où chacun commence. Les titres de section ne
                  sont pas repris au sommaire.
                </Help>
              </span>
              <button type="button" role="switch" aria-checked={hasToc} aria-label="Sommaire" className="fl-switch" onClick={() => setHasToc(!hasToc)} />
            </div>
            {hasToc && (
              <>
                <Field label="Titre du sommaire">
                  <input type="text" value={theme.tocTitle} onChange={(e) => set("tocTitle", e.target.value)} maxLength={80} className="fl-input" placeholder="Contenu" />
                </Field>
                <Toggle label="Pointillés entre le titre et le numéro" checked={theme.tocDots} onChange={(v) => set("tocDots", v)} />
              </>
            )}
            <p style={{ color: "var(--muted)", fontSize: 12.5, display: "flex", alignItems: "center", flexWrap: "wrap" }}>
              Pages numérotées à partir de la première recette.
              <Help
                title="Numérotation des pages"
                calc="page 1 = première page après la couverture et le sommaire"
                example="Couverture + sommaire d'une page : la 1re recette est imprimée « 1 », la 3e page du PDF."
              >
                Le numéro est imprimé au centre, en bas de chaque page de recette et de chapitre. La
                couverture et le sommaire ne sont pas numérotés et ne comptent pas. Une recette longue
                peut prendre plusieurs pages : le sommaire indique toujours sa vraie première page.
              </Help>
            </p>
          </Section>

          {/* ── Mise en page des recettes ─────────────── */}
          <Section icon={LayoutTemplate} title="Mise en page des recettes" summary={RECIPE_LAYOUT_LABELS[theme.recipeLayout]} help="La structure de la fiche : où se placent le titre, les ingrédients et la préparation.">
            <Choice
              label="Modèle"
              value={theme.recipeLayout}
              onChange={(v) => set("recipeLayout", v)}
              options={RECIPE_LAYOUTS.map((v) => ({ value: v, label: RECIPE_LAYOUT_LABELS[v] }))}
              hint={RECIPE_LAYOUT_HINTS[theme.recipeLayout]}
            />
            <Choice
              label="Place des ingrédients"
              help={{ title: "Place des ingrédients", text: "À gauche ou à droite de la préparation, ou au-dessus. Avec les modèles en une colonne (Moderne, Fiche technique), « À droite » affiche la préparation en premier." }}
              value={theme.ingredientsPosition}
              onChange={(v) => set("ingredientsPosition", v)}
              options={INGREDIENT_POSITIONS.map((v) => ({ value: v, label: INGREDIENT_POSITION_LABELS[v] }))}
            />
            {sideBySide && theme.ingredientsPosition !== "top" && (
              <Choice
                label="Largeur de la colonne ingrédients"
                help={{ title: "Largeur de la colonne", text: "Part de la largeur de page donnée aux ingrédients quand ils sont à côté de la préparation.", calc: "Étroite = 38 %   Moitié = 48 %   Large = 58 %" }}
                value={theme.ingredientsRatio}
                onChange={(v) => set("ingredientsRatio", v)}
                options={INGREDIENT_RATIOS.map((v) => ({ value: v, label: INGREDIENT_RATIO_LABELS[v] }))}
              />
            )}
            <Choice
              label="Alignement du titre"
              help={{ title: "Alignement du titre", text: "Position du nom de la recette et des lignes juste en dessous (catégories, tags, note). « Selon la mise en page » : centré en Classique, à gauche sinon." }}
              value={theme.titleAlign}
              onChange={(v) => set("titleAlign", v)}
              options={TITLE_ALIGNS.map((v) => ({ value: v, label: TITLE_ALIGN_LABELS[v] }))}
            />
            <Choice
              label="Espacement"
              help={{ title: "Espacement", text: "Serré fait tenir plus de texte sur une page ; Aéré donne une fiche plus lisible et plus « magazine »." }}
              value={theme.density}
              onChange={(v) => set("density", v)}
              options={DENSITIES.map((v) => ({ value: v, label: DENSITY_LABELS[v] }))}
            />
            <Choice
              label="Photo de la recette"
              help={{ title: "Photo de la recette", text: "La photo ajoutée à la recette, imprimée en bandeau en haut de la fiche. Sans photo, rien n'est affiché." }}
              value={theme.photoMode}
              onChange={(v) => set("photoMode", v)}
              options={PHOTO_MODES.map((v) => ({ value: v, label: PHOTO_MODE_LABELS[v] }))}
            />
          </Section>

          {/* ── Styles des éléments ───────────────────── */}
          <Section icon={Columns2} title="Styles des éléments" summary={TITLE_STYLE_LABELS[theme.titleStyle]}>
            <Choice label="Titre de la recette" value={theme.titleStyle} onChange={(v) => set("titleStyle", v)} options={TITLE_STYLES.map((v) => ({ value: v, label: TITLE_STYLE_LABELS[v] }))} />
            <Toggle label="Titre en majuscules" checked={theme.titleUppercase} onChange={(v) => set("titleUppercase", v)} />
            <Choice
              label="Intertitres (Ingrédients, Préparation)"
              value={theme.sectionTitleStyle}
              onChange={(v) => set("sectionTitleStyle", v)}
              options={SECTION_TITLE_STYLES.map((v) => ({ value: v, label: SECTION_TITLE_STYLE_LABELS[v] }))}
            />
            <Choice
              label="Liste d'ingrédients"
              value={theme.ingredientStyle}
              onChange={(v) => set("ingredientStyle", v)}
              options={INGREDIENT_STYLES.map((v) => ({ value: v, label: INGREDIENT_STYLE_LABELS[v] }))}
              hint={theme.recipeLayout === "fiche-technique" ? "En fiche technique, les ingrédients sont toujours présentés en tableau." : undefined}
            />
            <Choice
              label="Numéros des étapes"
              value={theme.stepStyle}
              onChange={(v) => set("stepStyle", v)}
              options={STEP_STYLES.map((v) => ({ value: v, label: STEP_STYLE_LABELS[v] }))}
              hint={theme.recipeLayout === "magazine" ? "En magazine, les étapes ne sont pas numérotées (lettrine)." : undefined}
            />
          </Section>

          {/* ── Couleurs et polices ───────────────────── */}
          <Section icon={Type} title="Couleurs et polices" summary={`${FONT_LABELS[theme.titleFont] ?? theme.titleFont} · ${String(theme.textSize).replace(".", ",")} pt`}>
            <ColorField label="Couleur d'accent" help="Titres, traits, numéros d'étapes et quantités." value={theme.accentColor} onChange={(v) => set("accentColor", v)} />
            <ColorField label="Couleur du texte" value={theme.textColor} onChange={(v) => set("textColor", v)} />
            <FontField label="Police des titres" value={theme.titleFont} onChange={(v) => set("titleFont", v)} />
            <FontField label="Police du texte" value={theme.bodyFont} onChange={(v) => set("bodyFont", v)} />
            <Field
              label={`Taille du texte : ${String(theme.textSize).replace(".", ",")} pt`}
              help={{ title: "Taille du texte", text: "Taille du texte courant. Les titres suivent automatiquement.", calc: "titre = taille du texte × 2,2", example: "Texte de 10 pt : titres de 22 pt." }}
            >
              <input
                type="range"
                min={TEXT_SIZE_MIN}
                max={TEXT_SIZE_MAX}
                step={TEXT_SIZE_STEP}
                value={theme.textSize}
                onChange={(e) => set("textSize", Number(e.target.value))}
                style={{ accentColor: "var(--accent)", width: "100%" }}
                aria-label="Taille du texte"
              />
            </Field>
          </Section>

          {/* ── Page ──────────────────────────────────── */}
          <Section icon={BookOpen} title="Page" summary={`${PAPER_LABELS[theme.paper]} · ${PAGE_FRAME_LABELS[theme.pageFrame]}`}>
            <Choice label="Papier" help={{ title: "Papier", text: "Fond de chaque page, imprimé sous le texte (marges comprises). La couverture garde son propre fond." }} value={theme.paper} onChange={(v) => set("paper", v)} options={PAPERS.map((v) => ({ value: v, label: PAPER_LABELS[v] }))} />
            <Choice label="Décor de page" help={{ title: "Décor de page", text: "Ornement répété sur chaque page dans les marges, dans la couleur d'accent." }} value={theme.pageFrame} onChange={(v) => set("pageFrame", v)} options={PAGE_FRAMES.map((v) => ({ value: v, label: PAGE_FRAME_LABELS[v] }))} />
          </Section>

          {/* ── Informations imprimées ────────────────── */}
          <Section icon={ListChecks} title="Informations imprimées">
            <Toggle label="Masse totale" checked={theme.showTotalMass} onChange={(v) => set("showTotalMass", v)} />
            <Toggle label="Tags" checked={theme.showTags} onChange={(v) => set("showTags", v)} />
            <Toggle label="Note (étoiles)" checked={theme.showRating} onChange={(v) => set("showRating", v)} />
            <Toggle label="Notes et astuces" checked={theme.showNotes} onChange={(v) => set("showNotes", v)} />
            <Toggle label="Source" checked={theme.showSource} onChange={(v) => set("showSource", v)} />
            <Toggle label="Numéros de page" checked={theme.showPageNumbers} onChange={(v) => set("showPageNumbers", v)} />
          </Section>

          <section className="fl-card" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", borderColor: "rgba(239,125,107,.25)" }}>
            <Trash2 size={17} style={{ color: "var(--danger)" }} />
            <span style={{ flex: "1 1 200px", color: "var(--soft)", fontSize: 13 }}>
              Supprimer le cahier ne supprime pas ses recettes.
            </span>
            <DeleteCookbookButton cookbookId={cookbookId} cookbookName={defaultValues.name} />
          </section>
        </div>

        <aside className="theme-editor-preview cb-preview-col">
          <CookbookPreview state={preview} />
        </aside>
      </div>

      <div className="theme-savebar">
        <span style={{ color: dirty ? "var(--accent)" : "var(--muted)", fontSize: 13, marginRight: "auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {msg ? (
            <span style={{ color: msg.ok ? "var(--accent-2)" : "var(--danger)" }}>{msg.text}</span>
          ) : dirty ? (
            "Modifications non enregistrées"
          ) : (
            "Tout est enregistré"
          )}
        </span>
        <button type="button" className="fl-btn fl-btn-secondary cb-preview-btn" onClick={() => setShowPreview(true)}>
          <Eye size={16} /> Aperçu
        </button>
        {dirty && (
          <button type="button" className="fl-btn fl-btn-ghost desk-only" onClick={cancel}>
            Annuler
          </button>
        )}
        <button type="button" className="fl-btn fl-btn-primary" disabled={!dirty || pending || !name.trim()} onClick={save}>
          <Save size={16} /> {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>

      {showPreview && (
        <ModalOverlay wide title="Aperçu du cahier" onClose={() => setShowPreview(false)}>
          <CookbookPreview state={preview} inModal />
        </ModalOverlay>
      )}
    </div>
  );
}

// ─── Petits composants de formulaire ─────────────────────────────────────────

type HelpSpec = { title: string; text: string; calc?: string; example?: string };

/** Section repliable (fermée par défaut, sauf `open`). */
function Section({
  icon: Icon,
  title,
  summary,
  help,
  open,
  children,
}: {
  icon: React.ComponentType<{ size?: number }>;
  title: string;
  summary?: string;
  help?: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="cb-sect" open={open}>
      <summary>
        <span style={{ color: "var(--accent)", display: "grid" }}>
          <Icon size={17} />
        </span>
        <span style={{ display: "flex", alignItems: "center", flex: "none" }}>
          {title}
          {help && <Help title={title}>{help}</Help>}
        </span>
        {summary && <small>{summary}</small>}
        <ChevronDown size={17} className="chev" />
      </summary>
      <div className="cb-sect-body">{children}</div>
    </details>
  );
}

function Label({ text, help }: { text: string; help?: HelpSpec }) {
  return (
    <span className="fl-label" style={{ display: "flex", alignItems: "center" }}>
      {text}
      {help && (
        <Help title={help.title} calc={help.calc} example={help.example}>
          {help.text}
        </Help>
      )}
    </span>
  );
}

function Field({ label, help, children }: { label: string; help?: HelpSpec; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <Label text={label} help={help} />
      {children}
    </div>
  );
}

function Choice<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
  help,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  hint?: string;
  help?: HelpSpec;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <Label text={label} help={help} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {options.map((o) => (
          <button key={o.value} type="button" className="fl-chip" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
      {hint && <p style={{ color: "var(--muted)", fontSize: 12.5 }}>{hint}</p>}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  help,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  help?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontSize: 13.5, color: "var(--soft)", display: "flex", alignItems: "center" }}>
        {label}
        {help && <Help title={label}>{help}</Help>}
      </span>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} className="fl-switch" onClick={() => onChange(!checked)} />
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
  help,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  help?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Label text={label} help={help ? { title: label, text: help } : undefined} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {THEME_COLORS.map((col) => {
          const on = col.toLowerCase() === value.toLowerCase();
          return (
            <button
              key={col}
              type="button"
              aria-label={`Couleur ${col}`}
              aria-pressed={on}
              onClick={() => onChange(col)}
              style={{
                width: 24,
                height: 24,
                borderRadius: 7,
                background: col,
                border: "1px solid rgba(255,255,255,.12)",
                boxShadow: on ? "0 0 0 2px var(--bg), 0 0 0 4px var(--accent)" : undefined,
              }}
            />
          );
        })}
        <label
          title="Couleur personnalisée"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 4, fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-mono)" }}
        >
          <input
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
            onChange={(e) => onChange(e.target.value)}
            style={{ width: 30, height: 26, border: "1px solid var(--border2)", borderRadius: 7, background: "none", padding: 1 }}
          />
          {value}
        </label>
      </div>
    </div>
  );
}

const FONT_GROUPS: { label: string; cat: "sans" | "serif" | "display" | "mono" }[] = [
  { label: "Sans empattement", cat: "sans" },
  { label: "Avec empattement", cat: "serif" },
  { label: "Décorative", cat: "display" },
  { label: "Chasse fixe", cat: "mono" },
];

function FontField({ label, value, onChange }: { label: string; value: FontKey; onChange: (v: FontKey) => void }) {
  return (
    <Field label={label}>
      <select className="fl-input" value={value} onChange={(e) => onChange(e.target.value as FontKey)} style={{ fontFamily: FONTS[value]?.family }}>
        {FONT_GROUPS.map((g) => (
          <optgroup key={g.cat} label={g.label}>
            {FONT_KEYS.filter((k) => FONTS[k].category === g.cat).map((k) => (
              <option key={k} value={k}>
                {FONT_LABELS[k]}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </Field>
  );
}

// ─── Vignettes de couverture ─────────────────────────────────────────────────

export function CoverLayoutThumb({ layout }: { layout: CoverLayout }) {
  const w = 60;
  const h = 80;
  const txt = "var(--text)";
  const fill = "var(--accent)";
  let inner: React.ReactNode = null;
  switch (layout) {
    case "circle":
      inner = (
        <>
          <circle cx={w / 2} cy={h / 2} r={16} fill={fill} fillOpacity={0.18} stroke={fill} />
          <text x={w / 2} y={h / 2 + 2} textAnchor="middle" fontSize="6" fill={txt}>Titre</text>
        </>
      );
      break;
    case "framed":
      inner = (
        <>
          <rect x={12} y={28} width={w - 24} height={24} fill="none" stroke={txt} strokeWidth="0.7" />
          <text x={w / 2} y={42} textAnchor="middle" fontSize="6" fill={txt}>Titre</text>
        </>
      );
      break;
    case "full-bleed":
      inner = <text x={w / 2} y={h / 2 + 3} textAnchor="middle" fontSize="9" fontWeight="700" fill={txt}>Titre</text>;
      break;
    case "minimal":
      inner = (
        <>
          <line x1={10} y1={36} x2={w - 10} y2={36} stroke={fill} strokeWidth="1" />
          <line x1={10} y1={48} x2={w - 10} y2={48} stroke={fill} strokeWidth="1" />
          <text x={w / 2} y={44} textAnchor="middle" fontSize="6" fontWeight="700" fill={txt}>Titre</text>
        </>
      );
      break;
    case "typo-large":
      inner = <text x={w / 2} y={h / 2 + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill={fill}>Titre</text>;
      break;
    case "typo-divider":
      inner = (
        <>
          <line x1={20} y1={32} x2={w - 20} y2={32} stroke={fill} strokeWidth="0.6" />
          <line x1={20} y1={50} x2={w - 20} y2={50} stroke={fill} strokeWidth="0.6" />
          <text x={w / 2} y={43} textAnchor="middle" fontSize="6" fontWeight="700" fill={txt}>TITRE</text>
        </>
      );
      break;
  }
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={39} height={52} aria-hidden>
      <rect x={0.5} y={0.5} width={w - 1} height={h - 1} rx={3} fill="var(--card)" stroke="var(--border2)" />
      {inner}
    </svg>
  );
}

export function CoverBgPatternThumb({
  pattern,
  c1,
  c2,
  accent,
  image,
}: {
  pattern: CoverBgPattern;
  c1: string;
  c2: string;
  accent: string;
  image: string;
}) {
  const w = 39;
  const h = 52;
  let background = c1;
  let inner: React.ReactNode = null;
  switch (pattern) {
    case "gradient-diagonal":
      background = `linear-gradient(135deg, ${c1}, ${c2})`;
      break;
    case "gradient-vertical":
      background = `linear-gradient(180deg, ${c1}, ${c2})`;
      break;
    case "gradient-radial":
      background = `radial-gradient(circle at center, ${c1}, ${c2})`;
      break;
    case "dots":
    case "stripes":
    case "grid":
      // Même motif que le PDF, à l'échelle de la vignette (A4 = 39 px de large).
      background = coverPatternCss(pattern, c1, c2, (mm) => `${(mm * w) / 210}px`);
      break;
    case "accent-corner":
      inner = (
        <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ position: "absolute", inset: 0 }}>
          <polygon points={`0,0 ${w},0 0,${h * 0.75}`} fill={accent} fillOpacity={0.5} />
        </svg>
      );
      break;
    case "image":
      background = image ? `center / cover no-repeat url("${image.replace(/"/g, "%22")}")` : "var(--card)";
      inner = image ? null : (
        <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--muted)" }}>
          <ImageIcon size={16} />
        </span>
      );
      break;
  }
  return (
    <span
      aria-hidden
      style={{ display: "block", background, width: w, height: h, position: "relative", border: "1px solid rgba(0,0,0,.2)", overflow: "hidden", borderRadius: 3 }}
    >
      {inner}
    </span>
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
      setError("Image trop lourde (2 Mo au maximum).");
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result));
    reader.readAsDataURL(file);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Field label="Image de fond">
        <input
          type="text"
          value={value && !value.startsWith("data:") ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Adresse d'une image (https://…)"
          className="fl-input"
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {value && (
            <span
              aria-hidden
              style={{
                width: 48,
                height: 48,
                borderRadius: 8,
                border: "1px solid var(--border2)",
                background: `center / cover no-repeat url("${value.replace(/"/g, "%22")}")`,
              }}
            />
          )}
          <button type="button" className="fl-btn fl-btn-secondary" onClick={() => fileRef.current?.click()}>
            <Upload size={15} /> Choisir un fichier
          </button>
          {value && (
            <button type="button" className="fl-btn fl-btn-ghost" onClick={() => onChange("")}>
              <X size={15} /> Retirer
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} hidden />
        </div>
        {error && <span style={{ color: "var(--danger)", fontSize: 12.5 }}>{error}</span>}
      </Field>
      <Field
        label={`Opacité de l'image : ${Math.round(opacity * 100)} %`}
        help={{ title: "Opacité de l'image", text: "Plus la valeur est basse, plus l'image est pâle et le titre lisible par-dessus." }}
      >
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.05}
          value={opacity}
          onChange={(e) => onOpacityChange(Number(e.target.value))}
          style={{ accentColor: "var(--accent)", width: "100%" }}
          aria-label="Opacité de l'image"
        />
      </Field>
    </div>
  );
}
