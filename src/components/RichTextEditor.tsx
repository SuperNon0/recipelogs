"use client";

import { useRef } from "react";
import { useEditor, EditorContent, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";

/**
 * Éditeur de texte riche (étapes de recette) — version simplifiée :
 * uniquement Gras / Italique / Souligné. Toutes les autres options
 * (titres, listes, couleurs, surlignage, barré…) ont été retirées.
 *
 * Le placeholder utilise l'extension officielle Tiptap pour s'afficher
 * correctement en haut de la zone d'édition.
 *
 * IMPORTANT (Tiptap v3) : on ne force PLUS de re-render React à chaque
 * transaction (l'ancien pattern `setTick` perturbait la saisie clavier sur
 * ordinateur — frappe perdue / format qui s'activait au clic). À la place :
 *   - l'état actif des boutons G / I / S vient de `useEditorState` (re-render
 *     uniquement quand un de ces états change) ;
 *   - le HTML est écrit dans le <input hidden> via `onUpdate` (ref, sans
 *     re-render), pour que le submit du formulaire envoie bien les étapes.
 */
export function RichTextEditor({
  name,
  initialHtml,
  placeholder,
}: {
  name: string;
  initialHtml?: string;
  placeholder?: string;
}) {
  // Champ caché non contrôlé : sa valeur est mise à jour impérativement
  // dans onUpdate, ce qui évite tout re-render pendant la frappe.
  const hiddenRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // On retire tout ce qui n'est pas pertinent pour des étapes
        // simples : titres, listes, code, blockquote, barré.
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        codeBlock: false,
        code: false,
        blockquote: false,
        strike: false,
        horizontalRule: false,
      }),
      Underline,
      Placeholder.configure({
        placeholder: placeholder ?? "",
        showOnlyWhenEditable: true,
        showOnlyCurrent: false,
      }),
    ],
    content: initialHtml || "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "rte-content",
      },
    },
    // Contenu modifié → on synchronise le champ caché (sans re-render React).
    onUpdate: ({ editor }) => {
      if (hiddenRef.current) hiddenRef.current.value = editor.getHTML();
    },
  });

  // Re-render uniquement quand l'état actif des boutons change.
  const toolbar = useEditorState({
    editor,
    selector: (ctx) => ({
      isBold: ctx.editor?.isActive("bold") ?? false,
      isItalic: ctx.editor?.isActive("italic") ?? false,
      isUnderline: ctx.editor?.isActive("underline") ?? false,
      canUndo: ctx.editor?.can().undo() ?? false,
      canRedo: ctx.editor?.can().redo() ?? false,
    }),
  });

  if (!editor) {
    return (
      <div className="fl-input" style={{ minHeight: 200, padding: 12 }}>
        Chargement de l&apos;éditeur…
        <input type="hidden" name={name} defaultValue={initialHtml ?? ""} />
      </div>
    );
  }

  const btn = (active: boolean): React.CSSProperties => ({
    padding: "0.3rem 0.6rem",
    background: active ? "var(--accent)" : "transparent",
    color: active ? "var(--bg)" : "var(--text)",
    border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: "0.8rem",
    fontWeight: active ? 700 : 500,
    minWidth: 32,
    transition: "background-color 100ms ease, color 100ms ease",
  });

  return (
    <div
      className="rte-wrapper"
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md, 12px)",
        background: "var(--card)",
        overflow: "hidden",
      }}
    >
      <div
        className="flex flex-wrap items-center gap-1 p-2"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}
      >
        <button
          type="button"
          style={btn(toolbar?.isBold ?? false)}
          onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }}
          aria-label="Gras"
          aria-pressed={toolbar?.isBold ?? false}
        >
          <b>G</b>
        </button>
        <button
          type="button"
          style={btn(toolbar?.isItalic ?? false)}
          onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }}
          aria-label="Italique"
          aria-pressed={toolbar?.isItalic ?? false}
        >
          <i>I</i>
        </button>
        <button
          type="button"
          style={btn(toolbar?.isUnderline ?? false)}
          onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleUnderline().run(); }}
          aria-label="Souligné"
          aria-pressed={toolbar?.isUnderline ?? false}
        >
          <u>S</u>
        </button>

        <span
          style={{
            width: 1,
            height: 22,
            background: "var(--border)",
            margin: "0 4px",
          }}
        />

        <button
          type="button"
          style={btn(false)}
          onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().undo().run(); }}
          disabled={!(toolbar?.canUndo ?? false)}
          aria-label="Annuler"
          title="Annuler"
        >
          ⤺
        </button>
        <button
          type="button"
          style={btn(false)}
          onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().redo().run(); }}
          disabled={!(toolbar?.canRedo ?? false)}
          aria-label="Rétablir"
          title="Rétablir"
        >
          ⤻
        </button>
      </div>

      <div className="rte-host" style={{ padding: "12px 14px", minHeight: 220 }}>
        <EditorContent editor={editor} />
      </div>

      <input type="hidden" name={name} ref={hiddenRef} defaultValue={initialHtml ?? ""} />

      <style jsx global>{`
        .rte-content {
          min-height: 200px;
          outline: none;
          font-family: inherit;
          color: inherit;
          line-height: 1.6;
        }
        .rte-content p {
          margin: 0 0 0.4em;
        }
        /* Placeholder via Tiptap : s'affiche au début de la 1ʳᵉ ligne vide. */
        .rte-content p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: var(--muted);
          font-style: italic;
          float: left;
          height: 0;
          pointer-events: none;
          white-space: pre-wrap;
        }
      `}</style>
    </div>
  );
}
