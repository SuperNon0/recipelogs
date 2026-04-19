"use client";

import { useRef, useState, useTransition } from "react";
import { addComment, deleteComment } from "@/app/actions/recipes";

type CommentItem = {
  id: number;
  content: string;
  createdAt: Date;
};

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
    <section className="fl-card flex flex-col gap-3">
      <h2 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
        Journal d&apos;essais
      </h2>

      <form ref={formRef} action={onSubmit} className="flex flex-col gap-2">
        <textarea
          name="content"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="fl-input"
          rows={3}
          placeholder="Ajouter une note, un ressenti, une variation..."
          maxLength={5000}
        />
        <button
          type="submit"
          disabled={!value.trim()}
          className="fl-btn fl-btn-primary self-start"
        >
          Ajouter
        </button>
      </form>

      {comments.length === 0 ? (
        <p className="text-[color:var(--muted)] text-sm">
          Aucun commentaire pour l&apos;instant.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {comments.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-1 p-3 rounded-lg"
              style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-center justify-between">
                <span className="fl-label">
                  {new Date(c.createdAt).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <button
                  type="button"
                  className="fl-btn fl-btn-danger"
                  style={{ padding: "0.25rem 0.55rem", fontSize: "0.65rem" }}
                  onClick={() =>
                    startTransition(() => deleteComment(c.id, recipeId))
                  }
                >
                  ✕
                </button>
              </div>
              <p style={{ whiteSpace: "pre-wrap" }}>{c.content}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
