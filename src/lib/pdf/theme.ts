import { z } from "zod";

// ─── Palette commune ──────────────────────────────────────────────────────────

export const THEME_COLORS = [
  "#ffffff", "#000000", "#4a4a4a", "#9a9a9a", "#d8d4cb",
  "#1f4060", "#2868b8", "#3a8ad8", "#7fbeef", "#9ed8e8",
  "#1f7068", "#2ea38f", "#5cd4b0", "#a8ecd0", "#286830",
  "#3aa83a", "#7ec43a", "#bfe055", "#e88a30", "#e6a83a",
  "#e6c83a", "#f0d840", "#a02020", "#cc2828", "#e85c47",
  "#e6856e", "#902a4a", "#c8388a", "#e8528c", "#f0a0c8",
] as const;

// ─── Polices ──────────────────────────────────────────────────────────────────

export type FontDef = {
  family: string;
  google?: string;
  weights?: number[];
  category: "sans" | "serif" | "mono" | "display";
};

export const FONTS: Record<string, FontDef> = {
  arial: { family: 'Arial, "Helvetica Neue", Helvetica, sans-serif', category: "sans" },
  helvetica: { family: '"Helvetica Neue", Helvetica, Arial, sans-serif', category: "sans" },
  georgia: { family: 'Georgia, "Times New Roman", Times, serif', category: "serif" },
  times: { family: '"Times New Roman", Times, serif', category: "serif" },
  courier: { family: '"Courier New", Courier, monospace', category: "mono" },
  "dm-mono": {
    family: '"DM Mono", ui-monospace, Menlo, monospace',
    google: "DM Mono",
    weights: [400, 500],
    category: "mono",
  },
  "dm-serif": {
    family: '"DM Serif Display", Georgia, serif',
    google: "DM Serif Display",
    weights: [400],
    category: "display",
  },
  inter: {
    family: '"Inter", -apple-system, sans-serif',
    google: "Inter",
    weights: [400, 600, 700],
    category: "sans",
  },
  lato: { family: '"Lato", sans-serif', google: "Lato", weights: [400, 700], category: "sans" },
  "open-sans": {
    family: '"Open Sans", sans-serif',
    google: "Open Sans",
    weights: [400, 600, 700],
    category: "sans",
  },
  roboto: {
    family: '"Roboto", sans-serif',
    google: "Roboto",
    weights: [400, 500, 700],
    category: "sans",
  },
  nunito: {
    family: '"Nunito", sans-serif',
    google: "Nunito",
    weights: [400, 600, 700],
    category: "sans",
  },
  lora: {
    family: '"Lora", Georgia, serif',
    google: "Lora",
    weights: [400, 600, 700],
    category: "serif",
  },
  merriweather: {
    family: '"Merriweather", Georgia, serif',
    google: "Merriweather",
    weights: [400, 700],
    category: "serif",
  },
  playfair: {
    family: '"Playfair Display", Georgia, serif',
    google: "Playfair Display",
    weights: [400, 700],
    category: "display",
  },
  cormorant: {
    family: '"Cormorant Garamond", Georgia, serif',
    google: "Cormorant Garamond",
    weights: [500, 700],
    category: "serif",
  },
  montserrat: {
    family: '"Montserrat", Arial, sans-serif',
    google: "Montserrat",
    weights: [400, 600, 700],
    category: "sans",
  },
  caveat: {
    family: '"Caveat", "Comic Sans MS", cursive',
    google: "Caveat",
    weights: [500, 700],
    category: "display",
  },
};

export type FontKey = keyof typeof FONTS;
export const FONT_KEYS = Object.keys(FONTS) as FontKey[];

export const FONT_LABELS: Record<FontKey, string> = {
  arial: "Arial",
  helvetica: "Helvetica",
  georgia: "Georgia",
  times: "Times New Roman",
  courier: "Courier",
  "dm-mono": "DM Mono (site)",
  "dm-serif": "DM Serif Display (site)",
  inter: "Inter",
  lato: "Lato",
  "open-sans": "Open Sans",
  roboto: "Roboto",
  nunito: "Nunito",
  lora: "Lora",
  merriweather: "Merriweather",
  playfair: "Playfair Display",
  cormorant: "Cormorant Garamond",
  montserrat: "Montserrat",
  caveat: "Caveat (manuscrite)",
};

const LEGACY_FONT_MAP: Record<string, FontKey> = {
  sans: "arial",
  serif: "dm-serif",
  mono: "dm-mono",
  rounded: "nunito",
  classic: "georgia",
};

const fontSchema = z
  .string()
  .transform((v) => (v in LEGACY_FONT_MAP ? LEGACY_FONT_MAP[v] : v))
  .pipe(z.enum(FONT_KEYS as [FontKey, ...FontKey[]]));

// ─── Tailles ──────────────────────────────────────────────────────────────────

export const TEXT_SIZE_MIN = 7;
export const TEXT_SIZE_MAX = 16;
export const TEXT_SIZE_DEFAULT = 10;
export const TEXT_SIZE_STEP = 0.5;

export function titleSizeFor(textSize: number): number {
  return Math.round(textSize * 2.2 * 10) / 10;
}

const textSizeSchema = z
  .union([
    z.number(),
    z.literal("small").transform(() => 9),
    z.literal("medium").transform(() => 10),
    z.literal("large").transform(() => 11.5),
  ])
  .pipe(z.number().min(TEXT_SIZE_MIN).max(TEXT_SIZE_MAX));

// ─── Couvertures ──────────────────────────────────────────────────────────────

/**
 * Layouts de couverture = uniquement le PLACEMENT du texte (titre + description).
 * Le fond est géré séparément via `coverBgPattern`.
 */
/** Mise en page des fiches recettes dans les PDF. */
export const RECIPE_LAYOUTS = ["classique", "fiche-technique", "moderne", "magazine"] as const;
export type RecipeLayout = (typeof RECIPE_LAYOUTS)[number];
export const RECIPE_LAYOUT_LABELS: Record<RecipeLayout, string> = {
  classique: "Classique",
  "fiche-technique": "Fiche technique",
  moderne: "Moderne",
  magazine: "Magazine",
};
export const RECIPE_LAYOUT_HINTS: Record<RecipeLayout, string> = {
  classique: "Ingrédients à gauche, préparation à droite.",
  "fiche-technique": "Style BTM : cartouche (masse, date), tableau des ingrédients avec % de la masse.",
  moderne: "Une seule colonne, titre éditorial, ingrédients sur 2 colonnes.",
  magazine: "Photo de la recette en tête, encadré ingrédients, lettrine.",
};

export const COVER_LAYOUTS = [
  "circle",
  "framed",
  "full-bleed",
  "minimal",
  "typo-large",
  "typo-divider",
] as const;
export type CoverLayout = (typeof COVER_LAYOUTS)[number];

export const COVER_LAYOUT_LABELS: Record<CoverLayout, string> = {
  circle: "Cercle centré",
  framed: "Cadre centré",
  "full-bleed": "Centré (pleine page)",
  minimal: "Minimaliste (filets)",
  "typo-large": "Typo géante",
  "typo-divider": "Typo + filets",
};

/** Fonds de couverture — uniquement les "trucs jolis". */
export const COVER_BG_PATTERNS = [
  "plain",
  "gradient-diagonal",
  "gradient-vertical",
  "gradient-radial",
  "accent-corner",
  "dots",
  "stripes",
  "grid",
  "image",
] as const;
export type CoverBgPattern = (typeof COVER_BG_PATTERNS)[number];

export const COVER_BG_PATTERN_LABELS: Record<CoverBgPattern, string> = {
  plain: "Uni",
  "gradient-diagonal": "Dégradé diagonal",
  "gradient-vertical": "Dégradé vertical",
  "gradient-radial": "Dégradé radial",
  "accent-corner": "Coin d'accent",
  dots: "Pois",
  stripes: "Rayures",
  grid: "Quadrillage",
  image: "Image personnalisée",
};

/**
 * Motifs de couverture répétés (pois, rayures, quadrillage), en CSS pur.
 * Partagé entre le PDF (`size` en mm) et les vignettes du formulaire (en px).
 */
export function coverPatternCss(
  pattern: "dots" | "stripes" | "grid",
  c1: string,
  c2: string,
  size: (mm: number) => string,
): string {
  switch (pattern) {
    case "dots":
      return `radial-gradient(${c2} 22%, transparent 24%) 0 0 / ${size(9)} ${size(9)}, ${c1}`;
    case "stripes":
      return `repeating-linear-gradient(135deg, ${c2} 0 ${size(3)}, ${c1} ${size(3)} ${size(9)})`;
    case "grid":
      return `linear-gradient(${c2} 1px, transparent 1px) 0 0 / ${size(8)} ${size(8)}, linear-gradient(90deg, ${c2} 1px, transparent 1px) 0 0 / ${size(8)} ${size(8)}, ${c1}`;
  }
}

// ─── Habillage des pages de recettes ─────────────────────────────────────────

/** Fond des pages (dessiné sous le texte, marges comprises). */
export const PAPERS = ["white", "cream", "ivory", "rose", "grid", "lined"] as const;
export type Paper = (typeof PAPERS)[number];
export const PAPER_LABELS: Record<Paper, string> = {
  white: "Blanc",
  cream: "Crème",
  ivory: "Ivoire",
  rose: "Rosé",
  grid: "Quadrillé",
  lined: "Cahier ligné",
};
/** Couleur de fond de chaque papier (null = blanc, rien n'est dessiné). */
export const PAPER_COLORS: Record<Paper, string | null> = {
  white: null,
  cream: "#fbf6ea",
  ivory: "#fffdf5",
  rose: "#fdf2ef",
  grid: null,
  lined: "#fffef8",
};

/** Décor répété sur chaque page (dessiné dans les marges, couleur d'accent). */
export const PAGE_FRAMES = ["none", "line", "double", "corners", "side", "band"] as const;
export type PageFrame = (typeof PAGE_FRAMES)[number];
export const PAGE_FRAME_LABELS: Record<PageFrame, string> = {
  none: "Aucun",
  line: "Filet",
  double: "Double filet",
  corners: "Coins",
  side: "Liseré",
  band: "Bandeau",
};

export const TITLE_STYLES = ["simple", "underline", "ornament", "band"] as const;
export type TitleStyle = (typeof TITLE_STYLES)[number];
export const TITLE_STYLE_LABELS: Record<TitleStyle, string> = {
  simple: "Simple",
  underline: "Souligné",
  ornament: "Ornement",
  band: "Bandeau coloré",
};

export const STEP_STYLES = ["numbers", "circles"] as const;
export type StepStyle = (typeof STEP_STYLES)[number];
export const STEP_STYLE_LABELS: Record<StepStyle, string> = {
  numbers: "1. 2. 3.",
  circles: "Pastilles",
};

export const INGREDIENT_STYLES = ["list", "leaders", "boxed"] as const;
export type IngredientStyle = (typeof INGREDIENT_STYLES)[number];
export const INGREDIENT_STYLE_LABELS: Record<IngredientStyle, string> = {
  list: "Liste",
  leaders: "Pointillés",
  boxed: "Encadré",
};

/** Alignement du titre (et des lignes sous le titre). « auto » = selon la mise en page. */
export const TITLE_ALIGNS = ["auto", "left", "center", "right"] as const;
export type TitleAlign = (typeof TITLE_ALIGNS)[number];
export const TITLE_ALIGN_LABELS: Record<TitleAlign, string> = {
  auto: "Selon la mise en page",
  left: "À gauche",
  center: "Centré",
  right: "À droite",
};

export const INGREDIENT_POSITIONS = ["left", "right", "top"] as const;
export type IngredientPosition = (typeof INGREDIENT_POSITIONS)[number];
export const INGREDIENT_POSITION_LABELS: Record<IngredientPosition, string> = {
  left: "À gauche",
  right: "À droite",
  top: "Au-dessus",
};

export const INGREDIENT_RATIOS = ["narrow", "balanced", "wide"] as const;
export type IngredientRatio = (typeof INGREDIENT_RATIOS)[number];
export const INGREDIENT_RATIO_LABELS: Record<IngredientRatio, string> = {
  narrow: "Étroite",
  balanced: "Moitié",
  wide: "Large",
};
/** Largeur de la colonne ingrédients quand elle est à côté de la préparation. */
export const INGREDIENT_RATIO_WIDTH: Record<IngredientRatio, string> = {
  narrow: "38%",
  balanced: "48%",
  wide: "58%",
};

/** Style des intertitres « Ingrédients » / « Préparation ». */
export const SECTION_TITLE_STYLES = ["simple", "underline", "caps", "pill"] as const;
export type SectionTitleStyle = (typeof SECTION_TITLE_STYLES)[number];
export const SECTION_TITLE_STYLE_LABELS: Record<SectionTitleStyle, string> = {
  simple: "Simple",
  underline: "Souligné",
  caps: "Petites capitales",
  pill: "Étiquette",
};

/** Espacement général du texte. */
export const DENSITIES = ["compact", "normal", "airy"] as const;
export type Density = (typeof DENSITIES)[number];
export const DENSITY_LABELS: Record<Density, string> = {
  compact: "Serré",
  normal: "Normal",
  airy: "Aéré",
};

/** Photo de la recette : « auto » = seulement en mise en page Magazine. */
export const PHOTO_MODES = ["auto", "top", "none"] as const;
export type PhotoMode = (typeof PHOTO_MODES)[number];
export const PHOTO_MODE_LABELS: Record<PhotoMode, string> = {
  auto: "Magazine uniquement",
  top: "En tête de page",
  none: "Jamais",
};

// ─── Zod schema ───────────────────────────────────────────────────────────────

const hex = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Couleur hex invalide");

export const cookbookThemeSchema = z.object({
  // Recette : couleurs (le fond est TOUJOURS blanc — feuille d'imprimante)
  accentColor: hex.default("#A52A2A"),
  textColor: hex.default("#111111"),

  // Typographie
  titleFont: fontSchema.default("arial"),
  bodyFont: fontSchema.default("arial"),
  textSize: textSizeSchema.default(TEXT_SIZE_DEFAULT),

  // Mise en page recette
  recipeLayout: z.enum(RECIPE_LAYOUTS).default("classique"),
  paper: z.enum(PAPERS).default("white"),
  pageFrame: z.enum(PAGE_FRAMES).default("none"),
  titleStyle: z.enum(TITLE_STYLES).default("simple"),
  stepStyle: z.enum(STEP_STYLES).default("numbers"),
  ingredientStyle: z.enum(INGREDIENT_STYLES).default("list"),
  ingredientsPosition: z.enum(INGREDIENT_POSITIONS).default("left"),
  ingredientsRatio: z.enum(INGREDIENT_RATIOS).default("narrow"),
  titleAlign: z.enum(TITLE_ALIGNS).default("auto"),
  titleUppercase: z.boolean().default(false),
  sectionTitleStyle: z.enum(SECTION_TITLE_STYLES).default("simple"),
  density: z.enum(DENSITIES).default("normal"),
  photoMode: z.enum(PHOTO_MODES).default("auto"),

  // Sections affichées sur la fiche recette
  showTags: z.boolean().default(true),
  showSource: z.boolean().default(true),
  showRating: z.boolean().default(false),
  showNotes: z.boolean().default(true),
  showTotalMass: z.boolean().default(true),
  showPortion: z.boolean().default(true),
  showPageNumbers: z.boolean().default(true),

  // Sommaire
  tocMode: z.enum(["hidden", "flat", "by-section"]).default("flat"),
  tocDots: z.boolean().default(false),
  tocPageNumbers: z.boolean().default(true),
  tocTitle: z.string().max(80).default("Contenu"),

  // Couverture
  coverLayout: z.enum(COVER_LAYOUTS).default("circle"),
  coverBgPattern: z.enum(COVER_BG_PATTERNS).default("gradient-diagonal"),
  coverBgColor: hex.default("#d35a4a"),
  coverBgColor2: hex.default("#6ea8d8"),
  /** Couleur d'accent propre à la couverture (motif "accent-corner"). Indépendante de l'accent recette. */
  coverAccentColor: hex.default("#1f4060"),
  coverTextColor: hex.default("#111111"),
  coverBgImageUrl: z.string().max(2_500_000).default(""),
  coverBgImageOpacity: z.number().min(0.05).max(1).default(0.7),

  // Pied de page (alignement du texte ; le numéro de page est toujours centré)
  footerAlign: z.enum(["left", "right"]).default("left"),
});

export type CookbookTheme = z.infer<typeof cookbookThemeSchema>;

/** La photo de la recette est-elle imprimée avec ce thème ? */
export function themeShowsPhoto(theme: Pick<CookbookTheme, "photoMode" | "recipeLayout">): boolean {
  if (theme.photoMode === "none") return false;
  if (theme.photoMode === "top") return true;
  return theme.recipeLayout === "magazine";
}

export const DEFAULT_THEME: CookbookTheme = cookbookThemeSchema.parse({});

// ─── Réglages PDF d'une recette seule ────────────────────────────────────────

/**
 * Sous-ensemble du thème cahier appliqué quand on télécharge le PDF d'UNE
 * recette unique (route /recipes/[id]/pdf).
 *
 * Stocké comme un JSON dans la table `settings` sous la clé `recipePdfSettings`.
 */
export const recipePdfSettingsSchema = z.object({
  format: z.enum(["A4", "A5"]).default("A4"),
  recipeLayout: z.enum(RECIPE_LAYOUTS).default("classique"),
  paper: z.enum(PAPERS).default("white"),
  pageFrame: z.enum(PAGE_FRAMES).default("none"),
  titleStyle: z.enum(TITLE_STYLES).default("simple"),
  stepStyle: z.enum(STEP_STYLES).default("numbers"),
  ingredientStyle: z.enum(INGREDIENT_STYLES).default("list"),
  textColor: hex.default("#111111"),
  accentColor: hex.default("#A52A2A"),
  titleFont: fontSchema.default("arial"),
  bodyFont: fontSchema.default("arial"),
  textSize: textSizeSchema.default(TEXT_SIZE_DEFAULT),
  showTags: z.boolean().default(true),
  showSource: z.boolean().default(true),
  showRating: z.boolean().default(false),
  showNotes: z.boolean().default(true),
  showTotalMass: z.boolean().default(true),
  showPortion: z.boolean().default(true),
});

export type RecipePdfSettings = z.infer<typeof recipePdfSettingsSchema>;
export const DEFAULT_RECIPE_PDF_SETTINGS: RecipePdfSettings =
  recipePdfSettingsSchema.parse({});

/**
 * Convertit les réglages PDF d'une recette seule en thème cahier pour
 * réutiliser l'infrastructure existante de rendu (buildSingleRecipeHtml).
 */
export function recipePdfSettingsToTheme(s: RecipePdfSettings): CookbookTheme {
  return {
    ...DEFAULT_THEME,
    recipeLayout: s.recipeLayout,
    paper: s.paper,
    pageFrame: s.pageFrame,
    titleStyle: s.titleStyle,
    stepStyle: s.stepStyle,
    ingredientStyle: s.ingredientStyle,
    textColor: s.textColor,
    accentColor: s.accentColor,
    titleFont: s.titleFont,
    bodyFont: s.bodyFont,
    textSize: s.textSize,
    showTags: s.showTags,
    showSource: s.showSource,
    showRating: s.showRating,
    showNotes: s.showNotes,
    showTotalMass: s.showTotalMass,
    showPortion: s.showPortion,
  };
}

export function parseRecipePdfSettings(raw: unknown): RecipePdfSettings {
  if (raw == null || typeof raw !== "object") return DEFAULT_RECIPE_PDF_SETTINGS;
  const parsed = recipePdfSettingsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return DEFAULT_RECIPE_PDF_SETTINGS;
}

export function parseTheme(raw: unknown): CookbookTheme {
  if (raw == null || typeof raw !== "object") return DEFAULT_THEME;

  const partial = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(cookbookThemeSchema.shape) as (keyof CookbookTheme)[]) {
    if (key in partial) out[key] = partial[key];
  }

  // Migration douce : `coverGradient: true` (ancien schéma) → coverBgPattern: gradient-diagonal
  if (
    !("coverBgPattern" in out) &&
    "coverGradient" in partial &&
    partial.coverGradient === true
  ) {
    out.coverBgPattern = "gradient-diagonal";
  }
  if (
    !("coverBgPattern" in out) &&
    "coverGradient" in partial &&
    partial.coverGradient === false
  ) {
    out.coverBgPattern = "plain";
  }
  // Migration douce : ancien `bgImageUrl` → coverBgImageUrl si on est en pattern image
  if (!("coverBgImageUrl" in out) && "bgImageUrl" in partial) {
    out.coverBgImageUrl = partial.bgImageUrl;
  }

  const parsed = cookbookThemeSchema.safeParse(out);
  if (parsed.success) return parsed.data;

  const result: Record<string, unknown> = { ...DEFAULT_THEME };
  for (const [key, value] of Object.entries(out)) {
    const fieldSchema = (cookbookThemeSchema.shape as Record<string, z.ZodTypeAny>)[key];
    if (!fieldSchema) continue;
    const r = fieldSchema.safeParse(value);
    if (r.success) result[key] = r.data;
  }
  return result as CookbookTheme;
}

/** Feuille Google Fonts des polices du thème (null si polices système). */
export function googleFontsHref(theme: CookbookTheme): string | null {
  return fontsHref([theme.titleFont, theme.bodyFont]);
}

/** Feuille Google Fonts de toutes les polices des PDF (miniatures, éditeur). */
export function allPdfFontsHref(): string | null {
  return fontsHref(FONT_KEYS);
}

function fontsHref(keys: readonly string[]): string | null {
  const families = new Set<string>();
  for (const key of keys) {
    const def = FONTS[key];
    if (def?.google) {
      const weights = def.weights?.length ? def.weights.join(";") : "400";
      families.add(`family=${encodeURIComponent(def.google).replace(/%20/g, "+")}:wght@${weights}`);
    }
  }
  if (families.size === 0) return null;
  return `https://fonts.googleapis.com/css2?${[...families].join("&")}&display=swap`;
}

// ─── Styles prêts à l'emploi ─────────────────────────────────────────────────

/** Réglages d'apparence modifiés par un style prêt à l'emploi. */
export type ThemePresetValues = Pick<
  CookbookTheme,
  | "recipeLayout" | "paper" | "pageFrame" | "titleStyle" | "stepStyle" | "ingredientStyle"
  | "accentColor" | "textColor" | "titleFont" | "bodyFont"
  | "coverLayout" | "coverBgPattern" | "coverBgColor" | "coverBgColor2" | "coverAccentColor" | "coverTextColor"
>;

export const THEME_PRESETS: { key: string; label: string; description: string; values: ThemePresetValues }[] = [
  {
    key: "classique",
    label: "Pâtissier classique",
    description: "Sobre et lisible, la mise en page d'origine.",
    values: {
      recipeLayout: "classique", paper: "white", pageFrame: "none", titleStyle: "simple",
      stepStyle: "numbers", ingredientStyle: "list",
      accentColor: "#A52A2A", textColor: "#111111", titleFont: "arial", bodyFont: "arial",
      coverLayout: "circle", coverBgPattern: "gradient-diagonal", coverBgColor: "#d35a4a",
      coverBgColor2: "#6ea8d8", coverAccentColor: "#1f4060", coverTextColor: "#111111",
    },
  },
  {
    key: "elegant",
    label: "Élégant",
    description: "Papier crème, double filet, typographie Garamond, touches dorées.",
    values: {
      recipeLayout: "classique", paper: "cream", pageFrame: "double", titleStyle: "ornament",
      stepStyle: "numbers", ingredientStyle: "leaders",
      accentColor: "#9a7440", textColor: "#2b2620", titleFont: "cormorant", bodyFont: "lora",
      coverLayout: "typo-divider", coverBgPattern: "plain", coverBgColor: "#f6efe2",
      coverBgColor2: "#e8dcc4", coverAccentColor: "#9a7440", coverTextColor: "#3b2f22",
    },
  },
  {
    key: "carnet",
    label: "Carnet de cuisine",
    description: "Cahier ligné, titres manuscrits, liseré bleu, étapes en pastilles.",
    values: {
      recipeLayout: "classique", paper: "lined", pageFrame: "side", titleStyle: "simple",
      stepStyle: "circles", ingredientStyle: "list",
      accentColor: "#2868b8", textColor: "#23303d", titleFont: "caveat", bodyFont: "nunito",
      coverLayout: "framed", coverBgPattern: "grid", coverBgColor: "#fdfcf7",
      coverBgColor2: "#d6e2f0", coverAccentColor: "#2868b8", coverTextColor: "#23303d",
    },
  },
  {
    key: "pastel",
    label: "Pastel gourmand",
    description: "Papier rosé, coins décoratifs, ingrédients encadrés.",
    values: {
      recipeLayout: "classique", paper: "rose", pageFrame: "corners", titleStyle: "underline",
      stepStyle: "circles", ingredientStyle: "boxed",
      accentColor: "#c8476e", textColor: "#3a2a30", titleFont: "playfair", bodyFont: "nunito",
      coverLayout: "circle", coverBgPattern: "dots", coverBgColor: "#fde8ee",
      coverBgColor2: "#f6c3d3", coverAccentColor: "#c8476e", coverTextColor: "#3a2a30",
    },
  },
  {
    key: "btm",
    label: "Fiche BTM",
    description: "Fiche technique dense : tableau avec % de masse, filet bleu marine.",
    values: {
      recipeLayout: "fiche-technique", paper: "white", pageFrame: "line", titleStyle: "simple",
      stepStyle: "numbers", ingredientStyle: "list",
      accentColor: "#1f4060", textColor: "#111111", titleFont: "arial", bodyFont: "arial",
      coverLayout: "minimal", coverBgPattern: "plain", coverBgColor: "#ffffff",
      coverBgColor2: "#e6edf5", coverAccentColor: "#1f4060", coverTextColor: "#1f4060",
    },
  },
  {
    key: "bistrot",
    label: "Bistrot",
    description: "Bandeau bordeaux, photo en tête, ingrédients en pointillés.",
    values: {
      recipeLayout: "magazine", paper: "ivory", pageFrame: "band", titleStyle: "simple",
      stepStyle: "numbers", ingredientStyle: "leaders",
      accentColor: "#8a2442", textColor: "#221a1c", titleFont: "playfair", bodyFont: "lato",
      coverLayout: "full-bleed", coverBgPattern: "stripes", coverBgColor: "#8a2442",
      coverBgColor2: "#7a1f3a", coverAccentColor: "#e6c83a", coverTextColor: "#ffffff",
    },
  },
  {
    key: "nordique",
    label: "Nordique épuré",
    description: "Beaucoup d'air, une colonne, vert sapin, titres soulignés.",
    values: {
      recipeLayout: "moderne", paper: "white", pageFrame: "none", titleStyle: "underline",
      stepStyle: "circles", ingredientStyle: "leaders",
      accentColor: "#1f7068", textColor: "#1d2524", titleFont: "montserrat", bodyFont: "inter",
      coverLayout: "minimal", coverBgPattern: "plain", coverBgColor: "#eef3f1",
      coverBgColor2: "#d5e3de", coverAccentColor: "#1f7068", coverTextColor: "#1d2524",
    },
  },
];
