"use client";

import { useTransition } from "react";
import { deleteCookbook } from "@/app/actions/cookbooks";

export function DeleteCookbookButton({
  cookbookId,
  cookbookName,
}: {
  cookbookId: number;
  cookbookName: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (
          confirm(
            `Supprimer définitivement le cahier « ${cookbookName} » ? Cette action est irréversible.`,
          )
        ) {
          startTransition(() => deleteCookbook(cookbookId));
        }
      }}
      className="fl-btn fl-btn-danger"
    >
      {pending ? "Suppression…" : "Supprimer ce cahier"}
    </button>
  );
}
