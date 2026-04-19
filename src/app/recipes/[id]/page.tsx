import Link from "next/link";
import { notFound } from "next/navigation";
import { getRecipeDetail } from "@/lib/recipes";
import { RecipeActions } from "@/components/RecipeActions";
import { CommentsSection } from "@/components/CommentsSection";

export const dynamic = "force-dynamic";

function formatG(value: number): string {
  if (value >= 1000) {
    return (
      (value / 1000).toLocaleString("fr-FR", {
        maximumFractionDigits: 2,
      }) + " kg"
    );
  }
  return (
    value.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " g"
  );
}

export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recipeId = Number(id);
  if (!Number.isFinite(recipeId)) notFound();

  const recipe = await getRecipeDetail(recipeId);
  if (!recipe) notFound();

  const totalG = recipe.ingredients.reduce(
    (s, i) => s + Number(i.quantityG),
    0,
  );

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

      <section className="fl-card flex items-end justify-between">
        <div>
          <div className="fl-label">Masse totale</div>
          <div className="fl-value-serif" style={{ fontSize: "2.25rem" }}>
            {formatG(totalG)}
          </div>
        </div>
        <div className="flex flex-col items-end">
          <div className="fl-label">Ingrédients</div>
          <div className="fl-value-serif" style={{ fontSize: "1.5rem" }}>
            {recipe.ingredients.length}
          </div>
        </div>
      </section>

      <section className="fl-card">
        <h2 className="fl-title-serif mb-3" style={{ fontSize: "1.1rem" }}>
          Ingrédients
        </h2>
        <table className="w-full">
          <tbody>
            {recipe.ingredients.map((ing, idx) => (
              <tr
                key={ing.id}
                style={{
                  background:
                    idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                }}
              >
                <td
                  className="py-1.5 pr-3 text-right"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.9rem",
                    color: "var(--text)",
                    width: "110px",
                  }}
                >
                  {Number(ing.quantityG).toLocaleString("fr-FR", {
                    maximumFractionDigits: 2,
                  })}{" "}
                  <span style={{ color: "var(--muted)" }}>g</span>
                </td>
                <td className="py-1.5" style={{ color: "var(--text)" }}>
                  {ing.name ?? ing.ingredientBase?.name ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td
                className="pt-3 text-right fl-value-serif"
                style={{ fontSize: "1.1rem" }}
              >
                {formatG(totalG)}
              </td>
              <td className="pt-3 fl-label">Total</td>
            </tr>
          </tfoot>
        </table>
      </section>

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
