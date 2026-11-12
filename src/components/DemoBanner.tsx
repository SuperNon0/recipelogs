import { FlaskConical } from "lucide-react";
import { Help } from "@/components/ui/Help";

/** Bandeau du site de démonstration (RECIPELOG_DEMO=1, voir lib/demo.ts). */
export function DemoBanner() {
  return (
    <div className="demo-banner" role="status">
      <FlaskConical size={16} />
      <span>
        <b>Site de démonstration</b> : essaie tout, tes changements sont effacés chaque nuit.
      </span>
      <Help title="Site de démonstration">
        Ce RecipeLog sert à découvrir l&apos;appli : tu peux ouvrir, modifier, multiplier ou imprimer les
        recettes, et en créer. Chaque nuit, le site revient aux recettes de démo d&apos;origine. Les comptes,
        l&apos;accès Claude (MCP) et la mise à jour du site sont coupés ici : ils servent sur un vrai RecipeLog
        installé chez soi.
      </Help>
    </div>
  );
}
