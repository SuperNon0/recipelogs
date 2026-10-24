"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { SHORTCUT_PROMPT } from "@/lib/shortcutPrompt";

/** Bouton « Copier » pour la consigne du Raccourci. */
export function CopyPromptButton() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${SHORTCUT_PROMPT} `);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* presse-papiers refusé : le texte reste sélectionnable à la main */
    }
  };
  return (
    <button type="button" className="fl-btn fl-btn-secondary" onClick={copy}>
      {copied ? <Check size={15} /> : <Copy size={15} />}
      {copied ? "Copié" : "Copier"}
    </button>
  );
}
