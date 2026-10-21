"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Folder, FolderInput, FolderOpen, Inbox, Settings2 } from "lucide-react";
import { ContextArea, MoreButton, type MenuSpec } from "@/components/ui/Menu";
import { AddRecipesToFolderModal } from "@/components/AddRecipesToFolderModal";

type FolderTile = { id: number; name: string; color: string; count: number };

/** Tuiles des dossiers de l'accueil, chacune avec son menu d'actions. */
export function FolderTiles({ folders, noFolderCount }: { folders: FolderTile[]; noFolderCount: number }) {
  return (
    <div className="ftiles">
      {folders.map((f) => (
        <Tile key={f.id} f={f} />
      ))}
      {noFolderCount > 0 && (
        <div className="ftile" style={{ "--c": "#6f7a90" } as React.CSSProperties}>
          <Link href="/?folder=none">
            <span className="ico">
              <Inbox size={17} />
            </span>
            <span>
              <b>Sans dossier</b>
              <small>
                {noFolderCount} recette{noFolderCount > 1 ? "s" : ""}
              </small>
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}

function Tile({ f }: { f: FolderTile }) {
  const [adding, setAdding] = useState(false);
  const spec = (): MenuSpec => ({
    title: f.name,
    icon: Folder,
    items: [
      { label: "Ouvrir", icon: ExternalLink, href: `/?folder=${f.id}` },
      { label: "Ranger des recettes ici…", icon: FolderInput, onSelect: () => setAdding(true) },
      { separator: true },
      { label: "Renommer, couleur, supprimer…", icon: Settings2, href: "/settings/folders" },
    ],
  });
  return (
    <ContextArea spec={spec} className="ftile" style={{ "--c": f.color } as React.CSSProperties}>
      <Link href={`/?folder=${f.id}`}>
        <span className="ico">
          <FolderOpen size={17} />
        </span>
        <span style={{ minWidth: 0 }}>
          <b>{f.name}</b>
          <small>
            {f.count} recette{f.count > 1 ? "s" : ""}
          </small>
        </span>
      </Link>
      <MoreButton spec={spec} label={`Actions pour le dossier ${f.name}`} horizontal />
      {adding && <AddRecipesToFolderModal folder={f} onClose={() => setAdding(false)} />}
    </ContextArea>
  );
}
