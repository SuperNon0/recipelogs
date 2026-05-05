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
  "image",
] as const;
export type CoverBgPattern = (typeof COVER_BG_PATTERNS)[number];

export const COVER_BG_PATTERN_LABELS: Record<CoverBgPattern, string> = {
  plain: "Uni",
  "gradient-diagonal": "Dégradé diagonal",
  "gradient-vertical": "Dégradé vertical",
  "gradient-radial": "Dégradé radial",
  "accent-corner": "Coin d'accent",
  image: "Image personnalisée",
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
  ingredientsPosition: z.enum(["left", "right", "top"]).default("left"),
  ingredientsRatio: z.enum(["narrow", "balanced", "wide"]).default("narrow"),

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
  coverTextColor: hex.default("#111111"),
  coverBgImageUrl: z.string().max(2_500_000).default(""),
  coverBgImageOpacity: z.number().min(0.05).max(1).default(0.7),
});

export type CookbookTheme = z.infer<typeof cookbookThemeSchema>;

export const DEFAULT_THEME: CookbookTheme = cookbookThemeSchema.parse({});

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

export function googleFontsHref(theme: CookbookTheme): string | null {
  const families = new Set<string>();
  for (const key of [theme.titleFont, theme.bodyFont]) {
    const def = FONTS[key];
    if (def?.google) {
      const weights = def.weights?.length ? def.weights.join(";") : "400";
      families.add(`family=${encodeURIComponent(def.google).replace(/%20/g, "+")}:wght@${weights}`);
    }
  }
  if (families.size === 0) return null;
  return `https://fonts.googleapis.com/css2?${[...families].join("&")}&display=swap`;
}
