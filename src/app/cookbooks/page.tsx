import { EmptyState } from "@/components/EmptyState";

export default function CookbooksPage() {
  return (
    <>
      <h1 className="fl-title-serif mb-5" style={{ fontSize: "1.6rem" }}>
        Cahiers
      </h1>
      <EmptyState
        title="Phase 4 — à venir"
        description="Les cahiers PDF personnalisables seront développés en phase 4 (création, templates, liaison dynamique 🔗 ou figée 📌, intégration des sous-recettes)."
      />
    </>
  );
}
