"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
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
 * IMPORTANT : on force un re-render React à chaque transaction de l'éditeur
 * Tiptap (frappe, sélection, format) via `setTick`. Sans ça :
 *   - les boutons G / I / S ne mettent pas à jour leur état actif
 *   - le <input hidden> qui contient le HTML reste avec l'ancienne valeur,
 *     et au moment du submit du formulaire les étapes ne sont pas envoyées.
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
  // Compteur incrémenté à chaque transaction pour forcer un re-render.
  const [, setTick] = useState(0);

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
    // Toute transaction (frappe, mise en forme, sélection) → re-render React.
    onTransaction: () => setTick((t) => t + 1),
  });

  useEffect(() => {
    if (!editor) return;
    return () => {
      editor.destroy();
    };
  }, [editor]);

  const html = editor?.getHTML() ?? initialHtml ?? "";

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
          style={btn(editor.isActive("bold"))}
          onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }}
          aria-label="Gras"
          aria-pressed={editor.isActive("bold")}
        >
          <b>G</b>
        </button>
        <button
          type="button"
          style={btn(editor.isActive("italic"))}
          onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }}
          aria-label="Italique"
          aria-pressed={editor.isActive("italic")}
        >
          <i>I</i>
        </button>
        <button
          type="button"
          style={btn(editor.isActive("underline"))}
          onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleUnderline().run(); }}
          aria-label="Souligné"
          aria-pressed={editor.isActive("underline")}
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
          disabled={!editor.can().undo()}
          aria-label="Annuler"
          title="Annuler"
        >
          ⤺
        </button>
        <button
          type="button"
          style={btn(false)}
          onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().redo().run(); }}
          disabled={!editor.can().redo()}
          aria-label="Rétablir"
          title="Rétablir"
        >
          ⤻
        </button>
      </div>

      <div className="rte-host" style={{ padding: "12px 14px", minHeight: 220 }}>
        <EditorContent editor={editor} />
      </div>

      <input type="hidden" name={name} value={html} readOnly />

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
