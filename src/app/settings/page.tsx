import { listAllCategories } from "@/lib/recipes";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const categories = await listAllCategories();

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <h1 className="fl-title-serif" style={{ fontSize: "1.6rem" }}>
        Paramètres
      </h1>

      <section className="fl-card">
        <h2 className="fl-title-serif mb-3" style={{ fontSize: "1.1rem" }}>
          Catégories
        </h2>
        <p className="text-[color:var(--muted)] text-sm mb-3">
          {categories.length} catégorie{categories.length > 1 ? "s" : ""}{" "}
          configurée{categories.length > 1 ? "s" : ""}. L&apos;édition fine
          arrivera avec les paramètres avancés.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <span
              key={c.id}
              className="fl-tag"
              style={{
                background: `${c.color}22`,
                color: c.color,
                borderColor: `${c.color}55`,
              }}
            >
              {c.name}
            </span>
          ))}
        </div>
      </section>

      <section className="fl-card">
        <h2 className="fl-title-serif mb-3" style={{ fontSize: "1.1rem" }}>
          À venir
        </h2>
        <ul className="flex flex-col gap-2 text-sm text-[color:var(--muted)]">
          <li>· Mode de saisie des ingrédients (A libre / B base réutilisable)</li>
          <li>· Logo personnel pour les cahiers PDF</li>
          <li>· Export & import JSON des données</li>
          <li>· Gestion fine des catégories (ajout, édition, suppression)</li>
          <li>· Partage public (tokens)</li>
        </ul>
      </section>
    </div>
  );
}
