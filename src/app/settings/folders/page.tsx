import Link from "next/link";
import { listAllFolders } from "@/lib/recipes";
import { FolderManager } from "@/components/FolderManager";

export const dynamic = "force-dynamic";

export default async function FoldersSettingsPage() {
  const folders = await listAllFolders();

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <Link
          href="/settings"
          className="fl-label hover:text-[color:var(--text)]"
          style={{ fontSize: "0.75rem" }}
        >
          ← Paramètres
        </Link>
        <h1 className="fl-title-serif mt-1" style={{ fontSize: "1.6rem" }}>
          📁 Dossiers
        </h1>
        <p className="fl-label mt-1">
          {folders.length} dossier{folders.length > 1 ? "s" : ""} · une recette
          peut être rangée dans 0 ou 1 dossier
        </p>
      </div>

      <section className="fl-card flex flex-col gap-4">
        <FolderManager folders={folders} />
      </section>
    </div>
  );
}
