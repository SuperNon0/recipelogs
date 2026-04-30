import { z } from "zod";

// ─── Palettes & options (UI helpers) ──────────────────────────────────────────

/** Palette inspirée Recipe Keeper : 31 couleurs. */
export const THEME_COLORS = [
  "#ffffff", "#000000", "#4a4a4a", "#9a9a9a", "#d8d4cb",
  "#1f4060", "#2868b8", "#3a8ad8", "#7fbeef", "#9ed8e8",
  "#1f7068", "#2ea38f", "#5cd4b0", "#a8ecd0", "#286830",
  "#3aa83a", "#7ec43a", "#bfe055", "#e88a30", "#e6a83a",
  "#e6c83a", "#f0d840", "#a02020", "#cc2828", "#e85c47",
  "#e6856e", "#902a4a", "#c8388a", "#e8528c", "#f0a0c8",
] as const;

export const FONT_FAMILIES = {
  sans: '-apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif',
  serif: '"DM Serif Display", Georgia, "Times New Roman", serif',
  mono: '"DM Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  rounded: '"Avenir Next", "Avenir", "Segoe UI", Tahoma, sans-serif',
  classic: 'Georgia, "Times New Roman", Times, serif',
} as const;

export type FontKey = keyof typeof FONT_FAMILIES;

export const TEXT_SIZE_PT = {
  small: 9,
  medium: 10,
  large: 11.5,
} as const;

export const TITLE_SIZE_PT = {
  small: 18,
  medium: 22,
  large: 28,
} as const;

export const MARGIN_MM = {
  small: 8,
  medium: 12,
  large: 18,
} as const;

// ─── Zod schema ───────────────────────────────────────────────────────────────

const hex = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Couleur hex invalide");

export const COVER_LAYOUTS = [
  "circle",
  "framed",
  "half-top",
  "half-bottom",
  "full-bleed",
  "banner-top",
  "minimal",
] as const;
export type CoverLayout = (typeof COVER_LAYOUTS)[number];

export const COVER_LAYOUT_LABELS: Record<CoverLayout, string> = {
  circle: "Cercle centré",
  framed: "Cadre centré",
  "half-top": "Bandeau haut",
  "half-bottom": "Bandeau bas",
  "full-bleed": "Plein bleed",
  "banner-top": "Bannière fine",
  minimal: "Minimaliste",
};

export const cookbookThemeSchema = z.object({
  // Couleurs (recette)
  accentColor: hex.default("#A52A2A"),
  textColor: hex.default("#111111"),
  bgColor: hex.default("#ffffff"),

  // Typographie
  titleFont: z.enum(["sans", "serif", "mono", "rounded", "classic"]).default("sans"),
  bodyFont: z.enum(["sans", "serif", "mono", "rounded", "classic"]).default("sans"),
  textSize: z.enum(["small", "medium", "large"]).default("medium"),

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
  coverBgColor: hex.default("#d35a4a"),
  coverBgColor2: hex.default("#6ea8d8"),
  coverGradient: z.boolean().default(true),
  coverTextColor: hex.default("#111111"),
  coverSubtitle: z.string().max(200).default(""),

  // Cahier
  marginSize: z.enum(["small", "medium", "large"]).default("medium"),
});

export type CookbookTheme = z.infer<typeof cookbookThemeSchema>;

/** Valeurs par défaut = visuel actuel (BTM examen blanc). Zéro régression. */
export const DEFAULT_THEME: CookbookTheme = cookbookThemeSchema.parse({});

/**
 * Lecture tolérante : accepte n'importe quel JSON et tombe sur les defaults
 * pour les champs invalides ou manquants. Jamais d'exception.
 */
export function parseTheme(raw: unknown): CookbookTheme {
  if (raw == null || typeof raw !== "object") return DEFAULT_THEME;

  // Merge par champ : on garde un champ s'il passe la validation, sinon default.
  const partial = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(cookbookThemeSchema.shape) as (keyof CookbookTheme)[]) {
    if (key in partial) out[key] = partial[key];
  }
  const parsed = cookbookThemeSchema.safeParse(out);
  if (parsed.success) return parsed.data;

  // Best-effort : on essaie champ par champ.
  const result: Record<string, unknown> = { ...DEFAULT_THEME };
  for (const [key, value] of Object.entries(out)) {
    const fieldSchema = (cookbookThemeSchema.shape as Record<string, z.ZodTypeAny>)[key];
    if (!fieldSchema) continue;
    const r = fieldSchema.safeParse(value);
    if (r.success) result[key] = r.data;
  }
  return result as CookbookTheme;
}
