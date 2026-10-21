import { notFound } from "next/navigation";
import { ThemeEditor } from "@/components/themes/ThemeEditor";
import { getPdfTheme } from "@/lib/pdfThemes";
import { prisma } from "@/lib/prisma";
import { allPdfFontsHref } from "@/lib/pdf/theme";

export const dynamic = "force-dynamic";

export default async function ThemeEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const themeId = Number(id);
  if (!Number.isInteger(themeId)) notFound();
  const [theme, recipes] = await Promise.all([
    getPdfTheme(themeId),
    prisma.recipe.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
  ]);
  if (!theme) notFound();
  // `key` : repart de l'état enregistré après un « Revenir à l'original ».
  const fonts = allPdfFontsHref();
  return (
    <>
      {fonts && <link rel="stylesheet" href={fonts} />}
      <ThemeEditor key={JSON.stringify(theme.config)} theme={theme} recipes={recipes} />
    </>
  );
}
