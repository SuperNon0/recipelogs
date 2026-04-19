import Link from "next/link";
import { notFound } from "next/navigation";
import { getRecipeDetail, listRecipesMinimal } from "@/lib/recipes";
import { RecipeActions } from "@/components/RecipeActions";
import { CommentsSection } from "@/components/CommentsSection";
import { RecipeBody, type SubRecipeRow } from "@/components/RecipeBody";
import { AddSubRecipeButton } from "@/components/AddSubRecipeModal";

export const dynamic = "force-dynamic";

export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recipeId = Number(id);
  if (!Number.isFinite(recipeId)) notFound();

  const [recipe, available] = await Promise.all([
    getRecipeDetail(recipeId),
    listRecipesMinimal(recipeId),
  ]);
  if (!recipe) notFound();

  const ingredients = recipe.ingredients.map((i) => ({
    id: i.id,
    name: i.name ?? i.ingredientBase?.name ?? "—",
    quantityG: Number(i.quantityG),
  }));

  const subRecipes: SubRecipeRow[] = recipe.parentLinks.map((link) => ({
    id: link.id,
    childId: link.childId,
    childName: link.child.name,
    label: link.label,
    calcMode: link.calcMode,
    calcValue: Number(link.calcValue),
    pivotIngredientId: link.pivotIngredientId,
    isLocked: link.isLocked,
    childIngredients: link.child.ingredients.map((i) => ({
      id: i.id,
      name: i.name ?? i.ingredientBase?.name ?? "—",
      quantityG: Number(i.quantityG),
    })),
    childSteps: link.child.stepsBlock?.content ?? null,
  }));

  return (
    <article className="flex flex-col gap-5 max-w-3xl mx-auto">
      <div className="flex items-baseline justify-between gap-3">
        <Link href="/" className="fl-label hover:text-[color:var(--text)]">
          ← Recettes
        </Link>
        <RecipeActions recipeId={recipe.id} favorite={recipe.favorite} />
      </div>

      <header className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <h1
            className="fl-title-serif flex-1"
            style={{ fontSize: "2rem", color: "var(--accent)" }}
          >
            {recipe.name}
          </h1>
          {recipe.favorite && (
            <span style={{ color: "var(--accent)", fontSize: "1.5rem" }}>
              ★
            </span>
          )}
        </div>

        {(recipe.categories.length > 0 || recipe.tags.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {recipe.categories.map((c) => (
              <span
                key={c.categoryId}
                className="fl-tag"
                style={{
                  background: `${c.category.color}22`,
                  color: c.category.color,
                  borderColor: `${c.category.color}55`,
                }}
              >
                {c.category.name}
              </span>
            ))}
            {recipe.tags.map((t) => (
              <span key={t.id} className="fl-tag">
                #{t.name}
              </span>
            ))}
          </div>
        )}

        {recipe.rating && (
          <div style={{ color: "var(--accent)", fontSize: "1.1rem" }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                style={{ opacity: i < (recipe.rating ?? 0) ? 1 : 0.2 }}
              >
                ★
              </span>
            ))}
          </div>
        )}
      </header>

      <RecipeBody
        recipeId={recipe.id}
        ingredients={ingredients}
        subRecipes={subRecipes}
      />

      <div className="flex">
        <AddSubRecipeButton
          parentId={recipe.id}
          availableRecipes={available}
        />
      </div>

      {recipe.stepsBlock?.content && (
        <section className="fl-card">
          <h2 className="fl-title-serif mb-3" style={{ fontSize: "1.1rem" }}>
            Étapes
          </h2>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontFamily: "var(--font-mono)",
              fontSize: "0.88rem",
              lineHeight: 1.6,
            }}
          >
            {recipe.stepsBlock.content}
          </pre>
        </section>
      )}

      {recipe.notesTips && (
        <section className="fl-card">
          <h2 className="fl-title-serif mb-3" style={{ fontSize: "1.1rem" }}>
            Notes & astuces
          </h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{recipe.notesTips}</p>
        </section>
      )}

      {recipe.source && (
        <section className="fl-card flex items-center gap-3">
          <span className="fl-label">Source</span>
          <span>{recipe.source}</span>
        </section>
      )}

      <CommentsSection
        recipeId={recipe.id}
        comments={recipe.comments.map((c) => ({
          id: c.id,
          content: c.content,
          createdAt: c.createdAt,
        }))}
      />

      <footer className="fl-label text-center pt-2">
        Créée le{" "}
        {new Date(recipe.createdAt).toLocaleDateString("fr-FR")} · Modifiée le{" "}
        {new Date(recipe.updatedAt).toLocaleDateString("fr-FR")}
      </footer>
    </article>
  );
}
