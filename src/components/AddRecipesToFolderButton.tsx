"use client";

import { useState } from "react";
import { AddRecipesToFolderModal } from "./AddRecipesToFolderModal";

/**
 * Bouton qui ouvre la modal d'ajout de recettes au dossier.
 * Utilisé sur la vue d'un dossier (/?folder=:id).
 */
export function AddRecipesToFolderButton({
  folder,
}: {
  folder: { id: number; name: string; color: string };
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fl-btn fl-btn-primary"
        style={{ fontSize: "0.8rem" }}
        title="Ranger des recettes existantes dans ce dossier"
      >
        + Ranger des recettes ici
      </button>
      {open && (
        <AddRecipesToFolderModal
          folder={folder}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
