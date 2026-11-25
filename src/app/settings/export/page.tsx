import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePage } from "@/lib/auth/guard";
import { visibleRecipeWhere } from "@/lib/auth/visibility";
import { RecipeExport } from "@/components/RecipeExport";
import { Help } from "@/components/ui/Help";

export const dynamic = "force-dynamic";

export default async function ExportPage() {
  await requirePage("import.run");
  const vis = await visibleRecipeWhere();
  const recettes = await prisma.recipe.findMany({
    where: vis,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      folder: { select: { name: true, color: true } },
      categories: { select: { category: { select: { name: true } } } },
      _count: { select: { parentLinks: true } },
    },
  });
  return (
    <div className="set-page">
      <Link href="/settings" className="crumb">
        <ChevronLeft size={14} /> Réglages
      </Link>
      <div className="page-head">
        <h1>
          Exporter des recettes{" "}
          <Help
            title="Exporter des recettes"
            example="Coche « Tarte au citron », télécharge le fichier, puis dans l'autre RecipeLog : Réglages → Import JSON → choisis ce fichier → Importer."
          >
            Coche les recettes à copier, puis télécharge le fichier. Dans l&apos;autre RecipeLog, ouvre
            Réglages → Import JSON et choisis ce fichier : les recettes y sont recréées avec leurs
            ingrédients, étapes, notes, rendement, moule, prix de vente, dossier et catégories (créés
            s&apos;ils n&apos;existent pas là-bas). Une recette qui existe déjà là-bas sous le même nom
            est laissée telle quelle. Rien n&apos;est retiré d&apos;ici.
          </Help>
        </h1>
        <p className="sub">
          Choisis les recettes à copier dans un autre RecipeLog. Le fichier s&apos;importe là-bas avec
          Réglages → Import JSON.
        </p>
      </div>
      <RecipeExport
        recettes={recettes.map((r) => ({
          id: r.id,
          name: r.name,
          folder: r.folder,
          categories: r.categories.map((c) => c.category.name),
          sous: r._count.parentLinks,
        }))}
      />
    </div>
  );
}
