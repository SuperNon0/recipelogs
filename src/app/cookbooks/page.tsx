import Link from "next/link";
import { listCookbooks } from "@/lib/cookbooks";
import { Fab } from "@/components/Fab";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function CookbooksPage() {
  const cookbooks = await listCookbooks();

  return (
    <>
      <div className="flex items-baseline justify-between mb-5">
        <h1 className="fl-title-serif" style={{ fontSize: "1.6rem" }}>
          Cahiers
        </h1>
        <span className="fl-label">
          {cookbooks.length} cahier{cookbooks.length > 1 ? "s" : ""}
        </span>
      </div>

      {cookbooks.length === 0 ? (
        <EmptyState
          title="Aucun cahier"
          description="Créez un cahier pour assembler vos recettes et générer un PDF personnalisé."
          ctaHref="/cookbooks/new"
          ctaLabel="Créer un cahier"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cookbooks.map((c) => (
            <Link
              key={c.id}
              href={`/cookbooks/${c.id}`}
              className="fl-card flex flex-col gap-3 hover:border-[color:var(--muted)] transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <h3
                  className="fl-title-serif"
                  style={{ fontSize: "1.15rem" }}
                >
                  {c.name}
                </h3>
                <span className="fl-tag">{c.format}</span>
              </div>
              {c.description && (
                <p className="text-[color:var(--muted)] text-sm line-clamp-3">
                  {c.description}
                </p>
              )}
              <div className="flex items-end justify-between mt-auto">
                <div>
                  <span className="fl-label">Recettes</span>
                  <div
                    className="fl-value-serif"
                    style={{ fontSize: "1.55rem" }}
                  >
                    {c._count.entries}
                  </div>
                </div>
                {c.template && (
                  <span className="fl-tag">{c.template.name}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      <Fab href="/cookbooks/new" label="Créer un cahier" />
    </>
  );
}
