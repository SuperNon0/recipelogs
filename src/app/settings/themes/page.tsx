import { ThemeList } from "@/components/themes/ThemeList";
import { Help } from "@/components/ui/Help";
import { listPdfThemes } from "@/lib/pdfThemes";
import { prisma } from "@/lib/prisma";
import { allPdfFontsHref } from "@/lib/pdf/theme";

export const dynamic = "force-dynamic";

export default async function ThemesPage() {
  const [themes, recipes] = await Promise.all([
    listPdfThemes(),
    prisma.recipe.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
  ]);

  const fonts = allPdfFontsHref();
  return (
    <div>
      {fonts && <link rel="stylesheet" href={fonts} />}
      <div className="page-head">
        <h1>
          Thèmes PDF
          <Help title="Thèmes PDF">
            Un thème regroupe tout l&apos;habillage d&apos;un PDF : couleurs, polices, disposition des
            ingrédients et des étapes, fond de page, décor et couverture des cahiers. Quand tu
            télécharges le PDF d&apos;une recette, tu choisis le thème et tu vois l&apos;aperçu avant de
            télécharger.
            <br />
            <br />
            Clic droit (ou bouton à trois points) sur un thème pour l&apos;afficher, le modifier, le
            dupliquer ou le supprimer. Le thème « par défaut » est présélectionné.
          </Help>
        </h1>
        <p className="sub">
          {themes.length} thème{themes.length > 1 ? "s" : ""} · utilisés pour le PDF des recettes et
          applicables aux cahiers
        </p>
      </div>
      <ThemeList
        themes={themes.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          presetKey: t.presetKey,
          format: t.format,
          isDefault: t.isDefault,
          config: t.config,
        }))}
        recipes={recipes}
      />
    </div>
  );
}
