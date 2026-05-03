"use client";

import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";

const COLORS = [
  "#111111", "#a02020", "#cc2828", "#e85c47",
  "#e6a83a", "#3aa83a", "#2868b8", "#902a4a",
];

const HIGHLIGHTS = [
  "#fff59d", "#a8ecd0", "#f0a0c8", "#bfe055",
];

/**
 * Éditeur de texte riche pour les étapes de recette.
 *
 * - Stocke le contenu en HTML (champ caché `name`).
 * - Toolbar : gras, italique, souligné, barré, listes, titre,
 *   couleur de texte, surlignage.
 * - Le contenu produit est compatible avec le rendu PDF
 *   (cf. renderHtmlSteps dans src/lib/pdf/template.ts).
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
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [3] },
      }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
    ],
    content: initialHtml || "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "rte-content",
      },
    },
  });

  // Garde un input caché synchronisé pour soumettre la valeur via FormData
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
        Chargement de l'éditeur…
        <input type="hidden" name={name} defaultValue={initialHtml ?? ""} />
      </div>
    );
  }

  const btn = (active: boolean): React.CSSProperties => ({
    padding: "0.3rem 0.6rem",
    background: active ? "var(--accent)" : "transparent",
    color: active ? "var(--bg)" : "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: "0.8rem",
    fontWeight: active ? 700 : 500,
    minWidth: 32,
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
      {/* Toolbar */}
      <div
        className="flex flex-wrap items-center gap-1 p-2"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}
      >
        <button
          type="button"
          style={btn(editor.isActive("bold"))}
          onClick={() => editor.chain().focus().toggleBold().run()}
          aria-label="Gras"
        >
          <b>G</b>
        </button>
        <button
          type="button"
          style={btn(editor.isActive("italic"))}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          aria-label="Italique"
        >
          <i>I</i>
        </button>
        <button
          type="button"
          style={btn(editor.isActive("underline"))}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          aria-label="Souligné"
        >
          <u>S</u>
        </button>
        <button
          type="button"
          style={btn(editor.isActive("strike"))}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          aria-label="Barré"
        >
          <s>B</s>
        </button>

        <Sep />

        <button
          type="button"
          style={btn(editor.isActive("heading", { level: 3 }))}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          aria-label="Sous-titre"
        >
          T
        </button>
        <button
          type="button"
          style={btn(editor.isActive("bulletList"))}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          aria-label="Liste à puces"
        >
          •
        </button>
        <button
          type="button"
          style={btn(editor.isActive("orderedList"))}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          aria-label="Liste numérotée"
        >
          1.
        </button>

        <Sep />

        {/* Couleur de texte */}
        <span className="text-xs" style={{ color: "var(--muted)", marginRight: 4 }}>A</span>
        {COLORS.map((c) => (
          <button
            key={`c-${c}`}
            type="button"
            onClick={() => editor.chain().focus().setColor(c).run()}
            aria-label={`Couleur ${c}`}
            style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              background: c,
              border: editor.isActive("textStyle", { color: c })
                ? "2px solid var(--text)"
                : "1px solid var(--border)",
              cursor: "pointer",
            }}
          />
        ))}
        <button
          type="button"
          style={btn(false)}
          onClick={() => editor.chain().focus().unsetColor().run()}
          aria-label="Couleur par défaut"
          title="Couleur par défaut"
        >
          ↺
        </button>

        <Sep />

        {/* Surlignage */}
        <span className="text-xs" style={{ color: "var(--muted)", marginRight: 4 }}>⬛</span>
        {HIGHLIGHTS.map((c) => (
          <button
            key={`h-${c}`}
            type="button"
            onClick={() => editor.chain().focus().toggleHighlight({ color: c }).run()}
            aria-label={`Surligné ${c}`}
            style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              background: c,
              border: editor.isActive("highlight", { color: c })
                ? "2px solid var(--text)"
                : "1px solid var(--border)",
              cursor: "pointer",
            }}
          />
        ))}
        <button
          type="button"
          style={btn(false)}
          onClick={() => editor.chain().focus().unsetHighlight().run()}
          aria-label="Pas de surlignage"
          title="Retirer le surlignage"
        >
          ↺
        </button>

        <Sep />

        <button
          type="button"
          style={btn(false)}
          onClick={() => editor.chain().focus().undo().run()}
          aria-label="Annuler"
          title="Annuler"
        >
          ⤺
        </button>
        <button
          type="button"
          style={btn(false)}
          onClick={() => editor.chain().focus().redo().run()}
          aria-label="Rétablir"
          title="Rétablir"
        >
          ⤻
        </button>
      </div>

      {/* Zone d'édition */}
      <div className="rte-host" style={{ padding: "12px 14px", minHeight: 220 }}>
        <EditorContent editor={editor} />
        {placeholder && editor.isEmpty && (
          <div
            style={{
              position: "absolute",
              pointerEvents: "none",
              color: "var(--muted)",
              fontStyle: "italic",
              transform: "translateY(-1.4em)",
              padding: "0 14px",
              whiteSpace: "pre-wrap",
            }}
          >
            {placeholder}
          </div>
        )}
      </div>

      {/* Champ caché pour soumission via FormData */}
      <input type="hidden" name={name} value={html} readOnly />

      {/* Styles globaux ProseMirror minimum */}
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
        .rte-content h3 {
          font-size: 1.05rem;
          font-weight: 700;
          margin: 0.6em 0 0.3em;
          color: var(--accent);
        }
        .rte-content ul,
        .rte-content ol {
          padding-left: 1.4rem;
          margin: 0.3em 0;
        }
        .rte-content li {
          margin-bottom: 0.2em;
        }
        .rte-content mark {
          padding: 0 0.15em;
          border-radius: 2px;
        }
      `}</style>
    </div>
  );
}

function Sep() {
  return (
    <span
      style={{
        width: 1,
        height: 22,
        background: "var(--border)",
        margin: "0 4px",
      }}
    />
  );
}
