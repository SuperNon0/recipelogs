import Link from "next/link";
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
    <div className="max-w-2xl mx-auto">
      <div className="flex items-baseline justify-between mb-5">
        <h1 className="fl-title-serif" style={{ fontSize: "1.6rem" }}>
          Nouvelle recette
        </h1>
        <Link href="/" className="fl-label hover:text-[color:var(--text)]">
          ← Retour
        </Link>
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
