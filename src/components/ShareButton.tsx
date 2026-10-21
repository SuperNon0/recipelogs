"use client";

import { useState, useTransition } from "react";
import { Check, Link2 } from "lucide-react";
import { generateShareToken, revokeToken } from "@/app/actions/share";

export function ShareButton({
  entityType,
  entityId,
  existingToken,
}: {
  entityType: "recipe" | "cookbook";
  entityId: number;
  existingToken: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [token, setToken] = useState<string | null>(existingToken);
  const [copied, setCopied] = useState(false);

  const shareUrl = token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/${token}`
    : null;

  function handleGenerate() {
    void startTransition(async (): Promise<void> => {
      const result = await generateShareToken(entityType, entityId);
      if (result.ok) setToken(result.token);
    });
  }

  function handleRevoke() {
    if (!token) return;
    void startTransition(async (): Promise<void> => {
      await revokeToken(token, entityType, entityId);
      setToken(null);
    });
  }

  function handleCopy() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (!token) {
    return (
      <button
        type="button"
        onClick={handleGenerate}
        disabled={pending}
        className="fl-btn fl-btn-secondary"
        style={{ fontSize: "0.8rem" }}
      >
        {pending ? "…" : <><Link2 size={15} /> Partager</>}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          readOnly
          value={shareUrl ?? ""}
          className="fl-input flex-1"
          style={{ fontSize: "0.8rem", minWidth: 0 }}
          onFocus={(e) => e.target.select()}
        />
        <button
          type="button"
          onClick={handleCopy}
          className="fl-btn fl-btn-secondary"
          style={{ fontSize: "0.8rem", whiteSpace: "nowrap" }}
        >
          {copied ? <><Check size={15} /> Copié</> : "Copier"}
        </button>
        <button
          type="button"
          onClick={handleRevoke}
          disabled={pending}
          className="fl-btn fl-btn-danger"
          style={{ fontSize: "0.8rem" }}
        >
          Révoquer
        </button>
      </div>
    </div>
  );
}
