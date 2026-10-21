import { prisma } from "@/lib/prisma";
import {
  DEFAULT_THEME,
  THEME_PRESETS,
  parseRecipePdfSettings,
  parseTheme,
  recipePdfSettingsToTheme,
  type CookbookTheme,
} from "@/lib/pdf/theme";

/**
 * Thèmes PDF enregistrés (table pdf_themes).
 *
 * Les 7 styles fournis (THEME_PRESETS) sont créés une seule fois : la liste des
 * clés déjà créées est gardée dans le réglage `pdfThemesSeeded`, si bien qu'un
 * thème fourni que l'on supprime ne revient pas.
 * Au tout premier passage, l'ancien réglage « PDF d'une recette » devient le
 * thème « Mon style » et reste le thème par défaut.
 */

export type PdfThemeItem = {
  id: number;
  name: string;
  description: string | null;
  presetKey: string | null;
  format: "A4" | "A5";
  config: CookbookTheme;
  isDefault: boolean;
};

const SEEDED_KEY = "pdfThemesSeeded";
const LEGACY_KEY = "recipePdfSettings";
const LEGACY_MARK = "legacy-recipe-settings";

type Row = {
  id: number;
  name: string;
  description: string | null;
  presetKey: string | null;
  format: "A4" | "A5";
  config: unknown;
  isDefault: boolean;
};

export function toThemeItem(r: Row): PdfThemeItem {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    presetKey: r.presetKey,
    format: r.format,
    config: parseTheme(r.config),
    isDefault: r.isDefault,
  };
}

/** Valeurs d'origine d'un thème fourni. */
export function presetConfig(key: string): CookbookTheme | null {
  const p = THEME_PRESETS.find((x) => x.key === key);
  return p ? { ...DEFAULT_THEME, ...p.values } : null;
}

let seeding: Promise<void> | null = null;

/** Crée les thèmes fournis manquants (une fois par clé). */
export async function ensureBuiltinThemes(): Promise<void> {
  // Une seule création à la fois, même si plusieurs pages chargent en parallèle.
  seeding ??= seedOnce().finally(() => {
    seeding = null;
  });
  return seeding;
}

async function seedOnce(): Promise<void> {
  const row = await prisma.setting.findUnique({ where: { key: SEEDED_KEY } });
  const seeded = new Set<string>(Array.isArray(row?.value) ? (row!.value as string[]) : []);
  const missing = THEME_PRESETS.filter((p) => !seeded.has(p.key));
  const needLegacy = !seeded.has(LEGACY_MARK);
  if (missing.length === 0 && !needLegacy) return;

  await prisma.$transaction(async (tx) => {
    const count = await tx.pdfTheme.count();
    let position = count;
    let hasDefault = (await tx.pdfTheme.count({ where: { isDefault: true } })) > 0;

    if (needLegacy) {
      const legacy = await tx.setting.findUnique({ where: { key: LEGACY_KEY } });
      if (legacy) {
        const s = parseRecipePdfSettings(legacy.value);
        await tx.pdfTheme.create({
          data: {
            name: "Mon style",
            description: "Repris de l'ancien réglage « PDF d'une recette ».",
            format: s.format,
            config: recipePdfSettingsToTheme(s),
            isDefault: !hasDefault,
            position: position++,
          },
        });
        hasDefault = true;
      }
      seeded.add(LEGACY_MARK);
    }

    for (const p of missing) {
      await tx.pdfTheme.upsert({
        where: { presetKey: p.key },
        update: {},
        create: {
          name: p.label,
          description: p.description,
          presetKey: p.key,
          format: "A4",
          config: { ...DEFAULT_THEME, ...p.values },
          isDefault: !hasDefault,
          position: position++,
        },
      });
      hasDefault = true;
      seeded.add(p.key);
    }

    await tx.setting.upsert({
      where: { key: SEEDED_KEY },
      update: { value: [...seeded] },
      create: { key: SEEDED_KEY, value: [...seeded] },
    });
  });
}

export async function listPdfThemes(): Promise<PdfThemeItem[]> {
  await ensureBuiltinThemes();
  const rows = await prisma.pdfTheme.findMany({ orderBy: [{ position: "asc" }, { id: "asc" }] });
  return rows.map(toThemeItem);
}

export async function getPdfTheme(id: number): Promise<PdfThemeItem | null> {
  const r = await prisma.pdfTheme.findUnique({ where: { id } });
  return r ? toThemeItem(r) : null;
}

/** Thème utilisé quand aucun n'est précisé (bouton PDF rapide). */
export async function getDefaultPdfTheme(): Promise<PdfThemeItem> {
  await ensureBuiltinThemes();
  const r =
    (await prisma.pdfTheme.findFirst({ where: { isDefault: true } })) ??
    (await prisma.pdfTheme.findFirst({ orderBy: [{ position: "asc" }, { id: "asc" }] }));
  if (r) return toThemeItem(r);
  return {
    id: 0,
    name: "Classique",
    description: null,
    presetKey: null,
    format: "A4",
    config: DEFAULT_THEME,
    isDefault: true,
  };
}
