import { notFound } from "next/navigation";
import { resolveShareToken, getPublicRecipeData, getPublicCookbookData } from "@/lib/share";

export const dynamic = "force-dynamic";

function formatG(g: number): string {
  if (g >= 1000) return (g / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " kg";
  return g.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " g";
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const row = await resolveShareToken(token);
  if (!row) notFound();

  if (row.entityType === "recipe") {
    const snap = await getPublicRecipeData(row.entityId);
    if (!snap) notFound();

    return (
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <header>
          <p className="fl-label mb-1">Recette partagée</p>
          <h1 className="fl-title-serif" style={{ fontSize: "2rem", color: "var(--accent)" }}>
            {snap.name}
          </h1>
          {snap.source && (
            <p className="fl-label mt-1">Source : {snap.source}</p>
          )}
        </header>

        {snap.ingredients.length > 0 && (
          <section className="fl-card">
            <h2 className="fl-title-serif mb-3" style={{ fontSize: "1.1rem" }}>
              Ingrédients
            </h2>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th className="fl-label" style={{ textAlign: "left", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>Ingrédient</th>
                  <th className="fl-label" style={{ textAlign: "right", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>Quantité</th>
                  <th className="fl-label" style={{ textAlign: "right", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>%</th>
                </tr>
              </thead>
              <tbody>
                {snap.ingredients.map((ing, i) => (
                  <tr key={i}>
                    <td style={{ padding: "4px 0", borderBottom: "1px solid var(--border)", fontSize: "0.9rem" }}>{ing.name}</td>
                    <td style={{ padding: "4px 0", borderBottom: "1px solid var(--border)", textAlign: "right", fontSize: "0.9rem" }}>{formatG(ing.quantityG)}</td>
                    <td style={{ padding: "4px 0", borderBottom: "1px solid var(--border)", textAlign: "right", fontSize: "0.85rem", color: "var(--muted)" }}>
                      {snap.totalMassG > 0 ? ((ing.quantityG / snap.totalMassG) * 100).toFixed(1) + " %" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="fl-label" style={{ padding: "6px 0" }}>Total</td>
                  <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 600 }}>{formatG(snap.totalMassG)}</td>
                  <td style={{ padding: "6px 0", textAlign: "right", color: "var(--muted)", fontSize: "0.85rem" }}>100 %</td>
                </tr>
              </tfoot>
            </table>
          </section>
        )}

        {snap.subRecipes.map((sr, i) => (
          <section key={i} className="fl-card">
            <h2 className="fl-title-serif mb-3" style={{ fontSize: "1.1rem" }}>
              {sr.label ?? sr.childName}
            </h2>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {sr.ingredients.map((ing, j) => (
                  <tr key={j}>
                    <td style={{ padding: "3px 0", borderBottom: "1px solid var(--border)", fontSize: "0.9rem" }}>{ing.name}</td>
                    <td style={{ padding: "3px 0", borderBottom: "1px solid var(--border)", textAlign: "right", fontSize: "0.9rem" }}>{formatG(ing.quantityG)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sr.steps && (
              <pre style={{ marginTop: 12, whiteSpace: "pre-wrap", fontSize: "0.85rem", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                {sr.steps}
              </pre>
            )}
          </section>
        ))}

        {snap.steps && (
          <section className="fl-card">
            <h2 className="fl-title-serif mb-3" style={{ fontSize: "1.1rem" }}>Étapes</h2>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.88rem", lineHeight: 1.6, fontFamily: "var(--font-mono)" }}>
              {snap.steps}
            </pre>
          </section>
        )}

        {snap.notesTips && (
          <section className="fl-card">
            <h2 className="fl-title-serif mb-3" style={{ fontSize: "1.1rem" }}>Notes & astuces</h2>
            <p style={{ whiteSpace: "pre-wrap", fontSize: "0.9rem" }}>{snap.notesTips}</p>
          </section>
        )}

        <footer className="fl-label text-center pb-4">
          Partagé depuis RecipeLog
        </footer>
      </div>
    );
  }

  // entityType === "cookbook"
  const cookbook = await getPublicCookbookData(row.entityId);
  if (!cookbook) notFound();

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <header>
        <p className="fl-label mb-1">Cahier partagé</p>
        <h1 className="fl-title-serif" style={{ fontSize: "2rem", color: "var(--accent)" }}>
          {cookbook.name}
        </h1>
        {cookbook.description && (
          <p className="text-[color:var(--muted)] text-sm mt-1">{cookbook.description}</p>
        )}
      </header>

      <section className="fl-card flex flex-col gap-3">
        <h2 className="fl-title-serif mb-1" style={{ fontSize: "1.1rem" }}>
          Recettes ({cookbook.entries.length})
        </h2>
        {cookbook.entries.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-3 py-2 border-b border-[color:var(--border)]">
            <span className="text-sm">{e.recipe.name}</span>
            <span className="fl-tag">{e.linkMode === "linked" ? "🔗" : "📌"}</span>
          </div>
        ))}
      </section>

      <footer className="fl-label text-center pb-4">
        Partagé depuis RecipeLog
      </footer>
    </div>
  );
}
