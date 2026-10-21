import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { RecipeKeeperImport } from "@/components/RecipeKeeperImport";

export const dynamic = "force-dynamic";

export default function ImportRecipeKeeperPage() {
  return (
    <div className="set-page">
      <Link href="/settings" className="crumb">
        <ChevronLeft size={14} /> Réglages
      </Link>
      <div className="page-head">
        <h1>Import Recipe Keeper</h1>
        <p className="sub">
          Récupère tes recettes depuis l&apos;application Recipe Keeper. Les recettes déjà présentes
          (même nom) sont ignorées.
        </p>
      </div>
      <RecipeKeeperImport />
    </div>
  );
}
