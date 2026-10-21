import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { RecipeForm } from "@/components/RecipeForm";
import { createRecipe } from "@/app/actions/recipes";
import { listAllCategories, listAllFolders } from "@/lib/recipes";

export const dynamic = "force-dynamic";

export default async function NewRecipePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const preselectFolderId =
    typeof sp.folder === "string" && /^\d+$/.test(sp.folder)
      ? Number(sp.folder)
      : undefined;

  const [categories, folders] = await Promise.all([
    listAllCategories(),
    listAllFolders(),
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
      <RecipeForm
        categories={categories}
        folders={folders}
        action={createRecipe}
        submitLabel="Créer la recette"
        initial={preselectFolderId ? { folderId: preselectFolderId } : undefined}
      />
    </div>
  );
}
