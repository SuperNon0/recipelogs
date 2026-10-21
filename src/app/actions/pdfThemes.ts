"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/actionResult";
import { cookbookThemeSchema, DEFAULT_THEME, type CookbookTheme } from "@/lib/pdf/theme";
import { ensureBuiltinThemes, presetConfig } from "@/lib/pdfThemes";

const json = (c: CookbookTheme) => c as unknown as Prisma.InputJsonValue;

const themeInput = z.object({
  name: z.string().trim().min(1, "Donne un nom au thème.").max(80, "Nom trop long (80 caractères maximum)."),
  description: z.string().trim().max(400).optional().nullable(),
  format: z.enum(["A4", "A5"]),
  config: cookbookThemeSchema,
});

export type ThemeInput = z.input<typeof themeInput>;

function refresh(id?: number) {
  revalidatePath("/settings/themes");
  if (id) revalidatePath(`/settings/themes/${id}`);
}

async function nextPosition(): Promise<number> {
  const last = await prisma.pdfTheme.findFirst({ orderBy: { position: "desc" }, select: { position: true } });
  return (last?.position ?? -1) + 1;
}

/** Nouveau thème : vierge, ou copie d'un thème existant. */
export async function createPdfTheme(
  fromId?: number,
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  await ensureBuiltinThemes();
  const src = fromId ? await prisma.pdfTheme.findUnique({ where: { id: fromId } }) : null;
  const t = await prisma.pdfTheme.create({
    data: {
      name: src ? `${src.name} (copie)`.slice(0, 80) : "Nouveau thème",
      description: src?.description ?? null,
      format: src?.format ?? "A4",
      config: src ? (src.config as Prisma.InputJsonValue) : json(DEFAULT_THEME),
      position: await nextPosition(),
    },
  });
  refresh();
  return { ok: true, id: t.id };
}

export async function updatePdfTheme(id: number, input: ThemeInput): Promise<ActionResult> {
  const parsed = themeInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Thème invalide." };
  const { name, description, format, config } = parsed.data;
  try {
    await prisma.pdfTheme.update({
      where: { id },
      data: { name, description: description || null, format, config: json(config) },
    });
  } catch {
    return { ok: false, error: "Ce thème n'existe plus." };
  }
  refresh(id);
  return { ok: true };
}

export async function renamePdfTheme(id: number, name: string): Promise<ActionResult> {
  const n = name.trim();
  if (!n) return { ok: false, error: "Donne un nom au thème." };
  await prisma.pdfTheme.update({ where: { id }, data: { name: n.slice(0, 80) } });
  refresh(id);
  return { ok: true };
}

export async function setDefaultPdfTheme(id: number): Promise<ActionResult> {
  await prisma.$transaction([
    prisma.pdfTheme.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
    prisma.pdfTheme.update({ where: { id }, data: { isDefault: true } }),
  ]);
  refresh();
  return { ok: true };
}

export async function deletePdfTheme(id: number): Promise<ActionResult> {
  const total = await prisma.pdfTheme.count();
  if (total <= 1) return { ok: false, error: "Il faut garder au moins un thème." };
  const t = await prisma.pdfTheme.delete({ where: { id } }).catch(() => null);
  if (t?.isDefault) {
    const first = await prisma.pdfTheme.findFirst({ orderBy: [{ position: "asc" }, { id: "asc" }] });
    if (first) await prisma.pdfTheme.update({ where: { id: first.id }, data: { isDefault: true } });
  }
  refresh();
  return { ok: true };
}

/** Remet un thème fourni dans son état d'origine. */
export async function resetPdfTheme(id: number): Promise<ActionResult> {
  const t = await prisma.pdfTheme.findUnique({ where: { id } });
  const config = t?.presetKey ? presetConfig(t.presetKey) : null;
  if (!t || !config) return { ok: false, error: "Seuls les thèmes fournis peuvent être réinitialisés." };
  await prisma.pdfTheme.update({ where: { id }, data: { config: json(config), format: "A4" } });
  refresh(id);
  return { ok: true };
}

/** Déplace un thème d'un cran vers le haut (-1) ou le bas (+1) dans la liste. */
export async function movePdfTheme(id: number, dir: -1 | 1): Promise<ActionResult> {
  const list = await prisma.pdfTheme.findMany({ orderBy: [{ position: "asc" }, { id: "asc" }], select: { id: true } });
  const i = list.findIndex((t) => t.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return { ok: true };
  [list[i], list[j]] = [list[j], list[i]];
  await prisma.$transaction(list.map((t, k) => prisma.pdfTheme.update({ where: { id: t.id }, data: { position: k } })));
  refresh();
  return { ok: true };
}
