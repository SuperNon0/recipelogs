"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Columns2,
  Eye,
  LayoutTemplate,
  ListChecks,
  Palette,
  PanelTop,
  RotateCcw,
  Save,
  Star,
  Type,
  BookImage,
  FileText,
} from "lucide-react";
import { Help } from "@/components/ui/Help";
import { ModalOverlay } from "@/components/ModalOverlay";
import { ThemeThumb } from "@/components/ThemeThumb";
import { ThemePreviewPanel, type RecipeChoice } from "./ThemePreviewPanel";
import {
  BandAlignThumb,
  HeaderModeThumb,
  InfoBoxThumb,
  IngColumnsThumb,
  MarginsThumb,
  QtyPositionThumb,
  StepDividerThumb,
  StepsColumnsThumb,
  TitleScaleThumb,
  ZebraThumb,
  BlockOrderThumb,
  DensityThumb,
  FormatThumb,
  FrameThumb,
  IngPositionThumb,
  IngRatioThumb,
  IngStyleThumb,
  LayoutThumb,
  PaperThumb,
  SectionTitleThumb,
  StepStyleThumb,
  TitleAlignThumb,
  TitleStyleThumb,
} from "./OptionThumbs";
import { CoverBgPatternThumb, CoverLayoutThumb } from "@/components/CookbookConfigForm";
import { setDefaultPdfTheme, updatePdfTheme, resetPdfTheme } from "@/app/actions/pdfThemes";
import {
  COVER_BG_PATTERNS,
  COVER_BG_PATTERN_LABELS,
  COVER_LAYOUTS,
  COVER_LAYOUT_LABELS,
  DENSITIES,
  DENSITY_LABELS,
  FONTS,
  FONT_KEYS,
  FONT_LABELS,
  H_ALIGNS,
  H_ALIGN_LABELS,
  HEADER_MODES,
  HEADER_MODE_LABELS,
  ING_COLUMNS,
  ING_COLUMNS_LABELS,
  PAGE_MARGINS,
  PAGE_MARGIN_LABELS,
  QTY_POSITIONS,
  QTY_POSITION_LABELS,
  STEPS_COLUMNS,
  STEPS_COLUMNS_LABELS,
  TITLE_SCALES,
  TITLE_SCALE_LABELS,
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
  THEME_COLORS,
  TITLE_ALIGNS,
  TITLE_ALIGN_LABELS,
  TITLE_STYLES,
  TITLE_STYLE_LABELS,
  type CookbookTheme,
  type FontKey,
} from "@/lib/pdf/theme";

type Props = {
  theme: {
    id: number;
    name: string;
    description: string | null;
    presetKey: string | null;
    format: "A4" | "A5";
    isDefault: boolean;
    config: CookbookTheme;
  };
  recipes: RecipeChoice[];
};

/** Éditeur complet d'un thème PDF, avec aperçu en direct. */
export function ThemeEditor({ theme, recipes }: Props) {
  const router = useRouter();
  const [name, setName] = useState(theme.name);
  const [description, setDescription] = useState(theme.description ?? "");
  const [format, setFormat] = useState<"A4" | "A5">(theme.format);
  const [c, setC] = useState<CookbookTheme>(theme.config);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const savedKey = useMemo(
    () => JSON.stringify([theme.name, theme.description ?? "", theme.format, theme.config]),
    [theme],
  );
  const dirty = JSON.stringify([name, description, format, c]) !== savedKey;

  // Prévient avant de quitter la page avec des modifications non enregistrées.
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  const set = <K extends keyof CookbookTheme>(k: K, v: CookbookTheme[K]) => setC((p) => ({ ...p, [k]: v }));

  const save = () =>
    startTransition(async () => {
      setMsg(null);
      const r = await updatePdfTheme(theme.id, { name, description, format, config: c });
      if (r.ok) {
        setMsg({ ok: true, text: "Thème enregistré." });
        router.refresh();
      } else setMsg({ ok: false, text: r.error });
    });

  // Réglages sans effet avec le modèle choisi : masqués (cf. template.ts).
  const layout = c.recipeLayout;
  const sideBySide = layout === "classique" || layout === "magazine";
  const hidden = HIDDEN_BY_LAYOUT[layout];

  return (
    <div>
      <Link href="/settings/themes" className="crumb">
        <ChevronLeft size={14} /> Thèmes PDF
      </Link>
      <div className="page-head" style={{ marginBottom: 16 }}>
        <ThemeThumb config={c} width={40} />
        <h1 style={{ minWidth: 200 }}>{name || "Thème sans nom"}</h1>
        {theme.isDefault ? (
          <span className="fl-tag" style={{ color: "var(--accent)", borderColor: "rgba(240,166,74,.35)", background: "var(--accent-dim)" }}>
            <Star size={11} /> Par défaut
          </span>
        ) : (
          <button type="button" className="fl-btn fl-btn-secondary" onClick={() => startTransition(async () => { await setDefaultPdfTheme(theme.id); router.refresh(); })}>
            <Star size={15} /> Utiliser par défaut
          </button>
        )}
        {theme.presetKey && (
          <button
            type="button"
            className="fl-btn fl-btn-secondary"
            onClick={() => {
              if (!confirm("Revenir aux réglages d'origine de ce thème ?")) return;
              startTransition(async () => {
                await resetPdfTheme(theme.id);
                router.refresh();
              });
            }}
          >
            <RotateCcw size={15} /> <span className="desk-only">Revenir à l&apos;original</span>
          </button>
        )}
      </div>

      <div className="theme-editor">
        <div className="theme-editor-form">
          <Section icon={FileText} title="Nom et format">
            <Field label="Nom">
              <input className="fl-input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Description (facultatif)">
              <input className="fl-input" value={description} maxLength={400} onChange={(e) => setDescription(e.target.value)} placeholder="Ex. pour les fiches de l'examen" />
            </Field>
            <VisualChoice
              label="Format de page"
              help={{ title: "Format de page", text: "Taille du papier du PDF. A4 = feuille classique (21 × 29,7 cm). A5 = moitié d'A4 (14,8 × 21 cm), pratique pour un classeur de cuisine." }}
              value={format}
              onChange={setFormat}
              options={(["A4", "A5"] as const).map((v) => ({ value: v, label: v, thumb: <FormatThumb format={v} /> }))}
            />
            <VisualChoice
              label="Marges"
              help={{ title: "Marges", text: "Espace blanc autour du texte. Étroites = plus de place pour la recette ; Larges = fiche plus aérée.", calc: "Étroites 7 × 8 mm   Normales 10 × 12 mm   Larges 16 × 20 mm (haut × côtés)" }}
              value={c.pageMargins}
              onChange={(v) => set("pageMargins", v)}
              options={PAGE_MARGINS.map((v) => ({ value: v, label: PAGE_MARGIN_LABELS[v], thumb: <MarginsThumb margins={v} /> }))}
            />
          </Section>

          <Section icon={LayoutTemplate} title="Mise en page" help="La structure de la fiche : où se placent le titre, les ingrédients et la préparation.">
            <VisualChoice
              label="Modèle"
              value={layout}
              onChange={(v) => set("recipeLayout", v)}
              options={RECIPE_LAYOUTS.map((v) => ({ value: v, label: RECIPE_LAYOUT_LABELS[v], thumb: <LayoutThumb layout={v} /> }))}
              hint={RECIPE_LAYOUT_HINTS[layout]}
            />
            {hidden.length > 0 && (
              <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: -8 }}>
                Avec ce modèle, ces réglages n&apos;ont pas d&apos;effet et sont masqués : {hidden.join(", ")}.
              </p>
            )}
            {sideBySide ? (
              <VisualChoice
                label="Place des ingrédients"
                help={{ title: "Place des ingrédients", text: "À gauche ou à droite de la préparation, ou au-dessus sur toute la largeur." }}
                value={c.ingredientsPosition}
                onChange={(v) => set("ingredientsPosition", v)}
                options={INGREDIENT_POSITIONS.map((v) => ({ value: v, label: INGREDIENT_POSITION_LABELS[v], thumb: <IngPositionThumb position={v} /> }))}
              />
            ) : (
              <VisualChoice
                label="Ordre des blocs"
                help={{ title: "Ordre des blocs", text: "Ce modèle met tout sur une seule colonne : choisis si les ingrédients viennent avant ou après la préparation." }}
                value={c.ingredientsPosition === "right" ? "right" : "left"}
                onChange={(v) => set("ingredientsPosition", v)}
                options={[
                  { value: "left" as const, label: "Ingrédients d'abord", thumb: <BlockOrderThumb ingFirst /> },
                  { value: "right" as const, label: "Préparation d'abord", thumb: <BlockOrderThumb ingFirst={false} /> },
                ]}
              />
            )}
            {sideBySide && c.ingredientsPosition !== "top" && (
              <VisualChoice
                label="Largeur de la colonne ingrédients"
                help={{ title: "Largeur de la colonne", text: "Part de la largeur de page donnée aux ingrédients quand ils sont à côté de la préparation.", calc: "Étroite = 38 %   Moitié = 48 %   Large = 58 %" }}
                value={c.ingredientsRatio}
                onChange={(v) => set("ingredientsRatio", v)}
                options={INGREDIENT_RATIOS.map((v) => ({ value: v, label: INGREDIENT_RATIO_LABELS[v], thumb: <IngRatioThumb ratio={v} /> }))}
              />
            )}
            <VisualChoice
              label="Alignement du titre"
              help={{ title: "Alignement du titre", text: "Position du nom de la recette et des lignes juste en dessous (catégories, tags, note). « Selon la mise en page » : centré en Classique, à gauche sinon." }}
              value={c.titleAlign}
              onChange={(v) => set("titleAlign", v)}
              options={TITLE_ALIGNS.map((v) => ({ value: v, label: TITLE_ALIGN_LABELS[v], thumb: <TitleAlignThumb align={v} layout={layout} /> }))}
            />
            <VisualChoice
              label="Espacement"
              help={{ title: "Espacement", text: "Serré fait tenir plus de texte sur une page ; Aéré donne une fiche plus lisible et plus « magazine »." }}
              value={c.density}
              onChange={(v) => set("density", v)}
              options={DENSITIES.map((v) => ({ value: v, label: DENSITY_LABELS[v], thumb: <DensityThumb density={v} /> }))}
            />
            {layout !== "fiche-technique" && (
              <VisualChoice
                label="Cartouche d'infos"
                help={{ title: "Cartouche d'infos", text: "Petit tableau sous le titre : masse totale, nombre d'ingrédients et date. Toujours affiché en Fiche technique." }}
                value={onOff(c.showInfoBox)}
                onChange={(v) => set("showInfoBox", v === "on")}
                options={[
                  { value: "off" as const, label: "Sans", thumb: <InfoBoxThumb on={false} /> },
                  { value: "on" as const, label: "Avec", thumb: <InfoBoxThumb on /> },
                ]}
              />
            )}
          </Section>

          <Section icon={Columns2} title="Styles des éléments">
            <VisualChoice label="Titre de la recette" value={c.titleStyle} onChange={(v) => set("titleStyle", v)} options={TITLE_STYLES.map((v) => ({ value: v, label: TITLE_STYLE_LABELS[v], thumb: <TitleStyleThumb style={v} /> }))} />
            <VisualChoice
              label="Taille du titre"
              help={{ title: "Taille du titre", text: "Taille du nom de la recette, par rapport à la taille calculée depuis le texte.", calc: "Petit × 0,8   Moyen × 1   Grand × 1,2   Très grand × 1,45" }}
              value={c.titleScale}
              onChange={(v) => set("titleScale", v)}
              options={TITLE_SCALES.map((v) => ({ value: v, label: TITLE_SCALE_LABELS[v], thumb: <TitleScaleThumb scale={v} /> }))}
            />
            {layout !== "fiche-technique" && <Toggle label="Titre en majuscules" checked={c.titleUppercase} onChange={(v) => set("titleUppercase", v)} />}
            <VisualChoice
              label="Intertitres (Ingrédients, Préparation)"
              value={c.sectionTitleStyle}
              onChange={(v) => set("sectionTitleStyle", v)}
              options={SECTION_TITLE_STYLES.map((v) => ({ value: v, label: SECTION_TITLE_STYLE_LABELS[v], thumb: <SectionTitleThumb style={v} /> }))}
            />
            {layout !== "fiche-technique" && (
              <VisualChoice
                label="Liste d'ingrédients"
                value={c.ingredientStyle}
                onChange={(v) => set("ingredientStyle", v)}
                // Le magazine a déjà son propre encadré : « Encadré » n'y change rien.
                options={INGREDIENT_STYLES.filter((v) => layout !== "magazine" || v !== "boxed").map((v) => ({ value: v, label: INGREDIENT_STYLE_LABELS[v], thumb: <IngStyleThumb style={v} /> }))}
              />
            )}
            {(layout === "fiche-technique" || c.ingredientStyle !== "leaders") && (
              <VisualChoice
                label="Place de la quantité"
                help={{ title: "Place de la quantité", text: "Quantité devant le nom de l'ingrédient, ou au bout de la ligne. Avec la liste « Pointillés », elle est toujours au bout." }}
                value={c.qtyPosition}
                onChange={(v) => set("qtyPosition", v)}
                options={QTY_POSITIONS.map((v) => ({ value: v, label: QTY_POSITION_LABELS[v], thumb: <QtyPositionThumb position={v} /> }))}
              />
            )}
            {layout !== "fiche-technique" && (
              <>
                <VisualChoice
                  label="Lignes zébrées"
                  help={{ title: "Lignes zébrées", text: "Une ligne d'ingrédient sur deux sur un fond légèrement coloré, pour suivre la ligne plus facilement." }}
                  value={onOff(c.ingZebra)}
                  onChange={(v) => set("ingZebra", v === "on")}
                  options={[
                    { value: "off" as const, label: "Non", thumb: <ZebraThumb on={false} /> },
                    { value: "on" as const, label: "Oui", thumb: <ZebraThumb on /> },
                  ]}
                />
                <VisualChoice
                  label="Colonnes d'ingrédients"
                  help={{ title: "Colonnes d'ingrédients", text: "Liste d'ingrédients sur une ou deux colonnes. « Selon le modèle » : 2 colonnes en Moderne, 1 sinon." }}
                  value={c.ingColumns}
                  onChange={(v) => set("ingColumns", v)}
                  options={ING_COLUMNS.map((v) => ({ value: v, label: ING_COLUMNS_LABELS[v], thumb: <IngColumnsThumb columns={v} layout={layout} /> }))}
                />
              </>
            )}
            <VisualChoice
              label="Colonnes de la préparation"
              help={{ title: "Colonnes de la préparation", text: "Les étapes sur deux colonnes, comme un journal. Pratique pour les longues recettes." }}
              value={c.stepsColumns}
              onChange={(v) => set("stepsColumns", v)}
              options={STEPS_COLUMNS.map((v) => ({ value: v, label: STEPS_COLUMNS_LABELS[v], thumb: <StepsColumnsThumb columns={v} /> }))}
            />
            <VisualChoice
              label="Filet entre les étapes"
              help={{ title: "Filet entre les étapes", text: "Un trait fin sépare chaque étape de la suivante." }}
              value={onOff(c.stepDivider)}
              onChange={(v) => set("stepDivider", v === "on")}
              options={[
                { value: "off" as const, label: "Non", thumb: <StepDividerThumb on={false} /> },
                { value: "on" as const, label: "Oui", thumb: <StepDividerThumb on /> },
              ]}
            />
            {layout !== "magazine" && (
              <VisualChoice label="Numéros des étapes" value={c.stepStyle} onChange={(v) => set("stepStyle", v)} options={STEP_STYLES.map((v) => ({ value: v, label: STEP_STYLE_LABELS[v], thumb: <StepStyleThumb style={v} /> }))} />
            )}
          </Section>

          <Section icon={Palette} title="Couleurs">
            <ColorField label="Couleur d'accent" help="Titres, traits, numéros d'étapes et quantités." value={c.accentColor} onChange={(v) => set("accentColor", v)} />
            <ColorField label="Couleur du texte" value={c.textColor} onChange={(v) => set("textColor", v)} />
          </Section>

          <Section icon={Type} title="Polices">
            <FontField label="Police des titres" value={c.titleFont} onChange={(v) => set("titleFont", v)} />
            <FontField label="Police du texte" value={c.bodyFont} onChange={(v) => set("bodyFont", v)} />
            <Field
              label={`Taille du texte : ${String(c.textSize).replace(".", ",")} pt`}
              help={{ title: "Taille du texte", text: "Taille du texte courant. Les titres suivent automatiquement.", calc: "titre = taille du texte × 2,2 × taille du titre (Moyen = × 1)", example: "Texte de 10 pt, titre Moyen : 22 pt." }}
            >
              <input
                type="range"
                min={TEXT_SIZE_MIN}
                max={TEXT_SIZE_MAX}
                step={TEXT_SIZE_STEP}
                value={c.textSize}
                onChange={(e) => set("textSize", Number(e.target.value))}
                style={{ accentColor: "var(--accent)", width: "100%" }}
              />
            </Field>
          </Section>

          <Section icon={BookImage} title="Page">
            <VisualChoice label="Papier" help={{ title: "Papier", text: "Fond de chaque page, imprimé sous le texte (marges comprises)." }} value={c.paper} onChange={(v) => set("paper", v)} options={PAPERS.map((v) => ({ value: v, label: PAPER_LABELS[v], thumb: <PaperThumb paper={v} /> }))} />
            <VisualChoice label="Décor de page" help={{ title: "Décor de page", text: "Ornement répété sur chaque page dans les marges, dans la couleur d'accent." }} value={c.pageFrame} onChange={(v) => set("pageFrame", v)} options={PAGE_FRAMES.map((v) => ({ value: v, label: PAGE_FRAME_LABELS[v], thumb: <FrameThumb frame={v} /> }))} />
          </Section>

          <Section icon={ListChecks} title="Informations imprimées">
            <Toggle label="Masse totale" checked={c.showTotalMass} onChange={(v) => set("showTotalMass", v)} />
            <Toggle label="Tags" checked={c.showTags} onChange={(v) => set("showTags", v)} />
            <Toggle label="Note (étoiles)" checked={c.showRating} onChange={(v) => set("showRating", v)} />
            <Toggle label="Notes et astuces" checked={c.showNotes} onChange={(v) => set("showNotes", v)} />
            <Toggle label="Source" checked={c.showSource} onChange={(v) => set("showSource", v)} />
          </Section>

          <Section icon={PanelTop} title="En-tête et pied de page" help="Petites lignes répétées en haut et en bas de chaque page de recette (pas sur la couverture ni le sommaire).">
            <VisualChoice
              label="En-tête"
              help={{ title: "En-tête", text: "« Nom du cahier » : le nom du cahier, ou celui de la recette quand tu imprimes une recette seule." }}
              value={c.headerMode}
              onChange={(v) => set("headerMode", v)}
              options={HEADER_MODES.map((v) => ({ value: v, label: HEADER_MODE_LABELS[v], thumb: <HeaderModeThumb mode={v} /> }))}
            />
            {c.headerMode === "custom" && (
              <Field label="Texte de l'en-tête">
                <input className="fl-input" value={c.headerText} maxLength={120} onChange={(e) => set("headerText", e.target.value)} placeholder="Ex. CAP Pâtissier — fiches techniques" />
              </Field>
            )}
            {c.headerMode !== "none" && (
              <VisualChoice
                label="Place de l'en-tête"
                value={c.headerAlign}
                onChange={(v) => set("headerAlign", v)}
                options={H_ALIGNS.map((v) => ({ value: v, label: H_ALIGN_LABELS[v], thumb: <BandAlignThumb align={v} where="top" /> }))}
              />
            )}
            <Field
              label="Texte du pied de page (facultatif)"
              help={{ title: "Texte du pied de page", text: "Répété en bas de chaque page. Un cahier qui a son propre pied de page garde le sien." }}
            >
              <input className="fl-input" value={c.footerText} maxLength={200} onChange={(e) => set("footerText", e.target.value)} placeholder="Ex. Noë, 2026" />
            </Field>
            {c.footerText.trim() && (
              <VisualChoice
                label="Place du texte"
                value={c.footerAlign}
                onChange={(v) => set("footerAlign", v)}
                options={H_ALIGNS.map((v) => ({ value: v, label: H_ALIGN_LABELS[v], thumb: <BandAlignThumb align={v} where="bottom" /> }))}
              />
            )}
            <Toggle label="Numéros de page (cahiers et recettes de plusieurs pages)" checked={c.showPageNumbers} onChange={(v) => set("showPageNumbers", v)} />
            {c.showPageNumbers && (
              <VisualChoice
                label="Place du numéro de page"
                value={c.pageNumberAlign}
                onChange={(v) => set("pageNumberAlign", v)}
                options={H_ALIGNS.map((v) => ({ value: v, label: H_ALIGN_LABELS[v], thumb: <BandAlignThumb align={v} where="bottom" label="3" /> }))}
              />
            )}
          </Section>

          <Section icon={BookImage} title="Couverture des cahiers" help="Utilisée seulement quand ce thème est appliqué à un cahier qui a une page de couverture.">
            <VisualChoice label="Placement du titre" value={c.coverLayout} onChange={(v) => set("coverLayout", v)} options={COVER_LAYOUTS.map((v) => ({ value: v, label: COVER_LAYOUT_LABELS[v], thumb: <CoverLayoutThumb layout={v} /> }))} />
            <VisualChoice
              label="Fond"
              value={c.coverBgPattern}
              onChange={(v) => set("coverBgPattern", v)}
              options={COVER_BG_PATTERNS.filter((p) => p !== "image").map((v) => ({
                value: v,
                label: COVER_BG_PATTERN_LABELS[v],
                thumb: <CoverBgPatternThumb pattern={v} c1={c.coverBgColor} c2={c.coverBgColor2} accent={c.coverAccentColor} image="" />,
              }))}
            />
            <ColorField label="Couleur de fond 1" value={c.coverBgColor} onChange={(v) => set("coverBgColor", v)} />
            <ColorField label="Couleur de fond 2" value={c.coverBgColor2} onChange={(v) => set("coverBgColor2", v)} />
            <ColorField label="Couleur du texte" value={c.coverTextColor} onChange={(v) => set("coverTextColor", v)} />
          </Section>
        </div>

        <aside className="theme-editor-preview desk-only">
          <div className="fl-label" style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
            Aperçu en direct
            <Help title="Aperçu en direct">
              Le vrai PDF, régénéré automatiquement un instant après chaque modification (même
              avant d&apos;enregistrer). Choisis la recette qui sert d&apos;exemple dans la liste.
            </Help>
          </div>
          <ThemePreviewPanel config={c} format={format} recipes={recipes} expandable />
        </aside>
      </div>

      <div className="theme-savebar">
        <span style={{ color: dirty ? "var(--accent)" : "var(--muted)", fontSize: 13, marginRight: "auto" }}>
          {msg ? <span style={{ color: msg.ok ? "var(--accent-2)" : "var(--danger)" }}>{msg.text}</span> : dirty ? "Modifications non enregistrées" : "Tout est enregistré"}
        </span>
        <button type="button" className="fl-btn fl-btn-secondary mob-only" onClick={() => setShowPreview(true)}>
          <Eye size={16} /> Aperçu
        </button>
        {dirty && (
          <button
            type="button"
            className="fl-btn fl-btn-ghost desk-only"
            onClick={() => {
              setName(theme.name);
              setDescription(theme.description ?? "");
              setFormat(theme.format);
              setC(theme.config);
              setMsg(null);
            }}
          >
            Annuler
          </button>
        )}
        <button type="button" className="fl-btn fl-btn-primary" disabled={!dirty || pending} onClick={save}>
          <Save size={16} /> {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>

      {showPreview && (
        <ModalOverlay wide onClose={() => setShowPreview(false)} title="Aperçu">
          <ThemePreviewPanel config={c} format={format} recipes={recipes} />
        </ModalOverlay>
      )}
    </div>
  );
}

/** Réglages masqués selon le modèle, parce qu'il ne les utilise pas. */
const HIDDEN_BY_LAYOUT: Record<CookbookTheme["recipeLayout"], string[]> = {
  classique: [],
  "fiche-technique": [
    "largeur de la colonne ingrédients",
    "cartouche d'infos (toujours affiché)",
    "titre en majuscules (toujours en majuscules)",
    "liste d'ingrédients, lignes zébrées et colonnes d'ingrédients (toujours un tableau)",
  ],
  moderne: ["largeur de la colonne ingrédients"],
  magazine: ["numéros des étapes (le magazine met une lettrine)", "liste « Encadré » (déjà encadrée)"],
};

/** Oui / non sous forme de choix à schémas. */
const onOff = (v: boolean) => (v ? ("on" as const) : ("off" as const));

// ─── Petits composants de formulaire ─────────────────────────────────────────

type HelpSpec = { title: string; text: string; calc?: string; example?: string };

function Section({
  icon: Icon,
  title,
  help,
  children,
}: {
  icon: React.ComponentType<{ size?: number }>;
  title: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="fl-card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, fontWeight: 600 }}>
        <span style={{ color: "var(--accent)", display: "grid" }}>
          <Icon size={17} />
        </span>
        {title}
        {help && <Help title={title}>{help}</Help>}
      </h2>
      {children}
    </section>
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

/** Comme Choice, avec un petit schéma au-dessus de chaque option. */
function VisualChoice<T extends string>({
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
  options: { value: T; label: string; thumb: React.ReactNode }[];
  hint?: string;
  help?: HelpSpec;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <Label text={label} help={help} />
      <div className="cb-cover-grid">
        {options.map((o) => (
          <button key={o.value} type="button" className="cb-cover-opt" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
            {o.thumb}
            {o.label}
          </button>
        ))}
      </div>
      {hint && <p style={{ color: "var(--muted)", fontSize: 12.5 }}>{hint}</p>}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontSize: 13.5, color: "var(--soft)" }}>{label}</span>
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
      <select className="fl-input" value={value} onChange={(e) => onChange(e.target.value as FontKey)}>
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
