import { EmptyState } from "@/components/EmptyState";

export default function ShoppingPage() {
  return (
    <>
      <h1 className="fl-title-serif mb-5" style={{ fontSize: "1.6rem" }}>
        Listes de courses
      </h1>
      <EmptyState
        title="Phase 5 — à venir"
        description="Les listes de courses seront développées en phase 5 (génération automatique depuis les recettes, fusion des ingrédients identiques, mode courses avec cases à cocher)."
      />
    </>
  );
}
