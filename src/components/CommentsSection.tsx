"use client";

import { useRef, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { addComment, deleteComment } from "@/app/actions/recipes";
import { Help } from "./ui/Help";

type CommentItem = {
  id: number;
  content: string;
  createdAt: Date | string;
};

/** Journal d'essais : notes datées ajoutées au fil des réalisations. */
export function CommentsSection({
  recipeId,
  comments,
}: {
  recipeId: number;
  comments: CommentItem[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [, startTransition] = useTransition();
  const [value, setValue] = useState("");

  const onSubmit = async (formData: FormData) => {
    await addComment(recipeId, formData);
    setValue("");
    formRef.current?.reset();
  };

  return (
    <section className="fl-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 className="fl-label" style={{ display: "flex", alignItems: "center" }}>
        Journal d&apos;essais
        <Help title="Journal d'essais">
          Note ce que tu as changé et ce que ça a donné à chaque fois que tu réalises la recette
          (cuisson, texture, ajustements). Chaque note est datée automatiquement.
        </Help>
      </h2>

      <form ref={formRef} action={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <textarea
          name="content"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="fl-input"
          rows={3}
          placeholder="Ex. biscuit cuit 12 min au lieu de 14 : plus moelleux."
          maxLength={5000}
        />
        <button type="submit" disabled={!value.trim()} className="fl-btn fl-btn-primary" style={{ alignSelf: "flex-start" }}>
          Ajouter la note
        </button>
      </form>

      {comments.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: 13 }}>Aucune note pour l&apos;instant.</p>
      ) : (
        <div>
          {comments.map((c) => (
            <div key={c.id} style={{ display: "flex", gap: 12, padding: "10px 0", borderTop: "1px solid var(--border)" }}>
              <span className="num" style={{ color: "var(--muted)", fontSize: 12, width: 64, flex: "none", paddingTop: 2 }}>
                {new Date(c.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" })}
              </span>
              <p style={{ whiteSpace: "pre-wrap", flex: 1, color: "var(--soft)", fontSize: 13.5 }}>{c.content}</p>
              <button
                type="button"
                className="fl-btn fl-btn-ghost fl-btn-icon"
                style={{ width: 30, height: 30 }}
                aria-label="Supprimer la note"
                onClick={() => {
                  if (confirm("Supprimer cette note ?")) startTransition(() => deleteComment(c.id, recipeId));
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
