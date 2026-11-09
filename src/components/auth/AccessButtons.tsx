"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { requestAccess, stopViewAs } from "@/app/actions/accounts";

export function RequestAccessButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="fl-btn fl-btn-primary access-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await requestAccess();
            if (!r.ok) setError(r.error);
            router.refresh();
          })
        }
      >
        {pending ? "Envoi…" : "Demander un accès"}
      </button>
      {error && <p className="access-note" style={{ color: "var(--danger)" }}>{error}</p>}
    </>
  );
}

export function RefreshButton() {
  return (
    <button type="button" className="fl-btn fl-btn-secondary access-full" onClick={() => window.location.reload()}>
      Rafraîchir
    </button>
  );
}

/** Bandeau permanent pendant « Voir comme » (maquette 7 de Site-base). */
export function ViewAsBanner({ email, role }: { email: string; role: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="imp-banner" role="status">
      <Eye size={16} />
      <span>
        Tu vois le site comme <b>{email}</b> ({role})
      </span>
      <button
        type="button"
        className="fl-btn imp-btn"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await stopViewAs();
            window.location.href = "/settings/comptes";
          })
        }
      >
        Revenir à mon compte
      </button>
    </div>
  );
}
