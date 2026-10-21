import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { listAllFolders } from "@/lib/recipes";
import { FolderManager } from "@/components/FolderManager";

export const dynamic = "force-dynamic";

export default async function FoldersSettingsPage() {
  const folders = await listAllFolders();

  return (
    <div className="set-page">
      <Link href="/settings" className="crumb">
        <ChevronLeft size={14} /> Réglages
      </Link>
      <FolderManager folders={folders} />
    </div>
  );
}
