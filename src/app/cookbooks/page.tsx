import Link from "next/link";
import { Plus } from "lucide-react";
import { listCookbooks } from "@/lib/cookbooks";
import { allPdfFontsHref, parseTheme } from "@/lib/pdf/theme";
import { EmptyState } from "@/components/EmptyState";
import { CookbookGrid } from "@/components/CookbookMenu";
import { Help } from "@/components/ui/Help";

export const dynamic = "force-dynamic";

export default async function CookbooksPage() {
  const cookbooks = await listCookbooks();
  const fonts = allPdfFontsHref();

  return (
    <>
      {fonts && <link rel="stylesheet" href={fonts} />}
      <div className="page-head">
        <h1 style={{ display: "flex", alignItems: "center" }}>
          Cahiers
          <Help title="Cahiers">
            Un cahier rassemble plusieurs recettes dans un seul PDF, avec une couverture, un sommaire
            et des chapitres si tu le souhaites. Son apparence vient d&apos;un thème PDF, que tu peux
            ensuite ajuster.
            <br />
            <br />
            Clic droit (ou bouton à trois points) sur un cahier pour télécharger son PDF, ajouter ses
            recettes aux courses ou le supprimer.
          </Help>
        </h1>
        <Link href="/cookbooks/new" className="fl-btn fl-btn-primary desk-only">
          <Plus size={16} /> Nouveau cahier
        </Link>
        <p className="sub">
          {cookbooks.length} cahier{cookbooks.length > 1 ? "s" : ""}
        </p>
      </div>

      {cookbooks.length === 0 ? (
        <EmptyState
          title="Aucun cahier"
          description="Crée un cahier pour assembler tes recettes et en faire un PDF à imprimer."
          ctaHref="/cookbooks/new"
          ctaLabel="Créer un cahier"
        />
      ) : (
        <CookbookGrid
          cookbooks={cookbooks.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description,
            format: c.format,
            recipeCount: c._count.entries,
            hasCover: c.hasCover,
            hasToc: c.hasToc,
            // L'image de couverture (parfois lourde) est inutile pour la vignette.
            theme: { ...parseTheme(c.coverConfig), coverBgImageUrl: "" },
            updatedAt: c.updatedAt.toISOString(),
          }))}
        />
      )}

      <Link href="/cookbooks/new" className="fab" aria-label="Créer un cahier">
        <Plus size={24} />
      </Link>
    </>
  );
}
