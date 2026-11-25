import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { RecipeForm } from "@/components/RecipeForm";
import { createRecipe } from "@/app/actions/recipes";
import { listAllCategories, listAllFolders } from "@/lib/recipes";
import { listPieceWeights } from "@/lib/ingredientInfo";
import { requirePage } from "@/lib/auth/guard";
import { placesRecettes } from "@/lib/limites";

export const dynamic = "force-dynamic";

export default async function NewRecipePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePage("recipes.edit");
  const sp = await searchParams;
  const preselectFolderId =
    typeof sp.folder === "string" && /^\d+$/.test(sp.folder)
      ? Number(sp.folder)
      : undefined;

  const [categories, folders, pieceWeights, places] = await Promise.all([
    listAllCategories(),
    listAllFolders(),
    listPieceWeights(),
    placesRecettes(),
  ]);

  return (
    <div>
      <Link href="/" className="crumb">
        <ChevronLeft size={14} /> Recettes
      </Link>
      <div className="page-head">
        <h1>Nouvelle recette</h1>
        <p className="sub">Le nom et au moins un ingrédient suffisent : tu pourras compléter plus tard.</p>
      </div>
      {places === 0 ? (
        <p className="set-note">
          Ton offre ne permet pas de recettes en plus : supprime une recette pour en ajouter une autre, ou demande à RecipeLog
          d&apos;agrandir ton offre.
        </p>
      ) : (
      <RecipeForm
        categories={categories}
        folders={folders}
        pieceWeights={pieceWeights}
        action={createRecipe}
        submitLabel="Créer la recette"
        initial={preselectFolderId ? { folderId: preselectFolderId } : undefined}
      />
      )}
    </div>
  );
}
