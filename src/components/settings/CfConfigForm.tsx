"use client";

import { useState, useTransition } from "react";
import { saveCfConfig } from "@/app/actions/accounts";
import type { CfConfig } from "@/lib/auth/cloudflare";

export function CfConfigForm({ initial }: { initial: CfConfig }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [verifyJwt, setVerifyJwt] = useState(initial.verifyJwt);

  function onSubmit(fd: FormData) {
    setError(null);
    setOk(false);
    if (verifyJwt) fd.set("verifyJwt", "on");
    else fd.delete("verifyJwt");
    start(async () => {
      const r = await saveCfConfig(fd);
      if (r.ok) setOk(true);
      else setError(r.error);
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="fl-label">
          Team domain (ex : super-nono.cloudflareaccess.com)
        </span>
        <input
          type="text"
          name="teamDomain"
          defaultValue={initial.teamDomain}
          placeholder="super-nono.cloudflareaccess.com"
          className="fl-input"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="fl-label">
          Audience ID de l&apos;application (AUD)
        </span>
        <input
          type="text"
          name="aud"
          defaultValue={initial.aud}
          placeholder="ex : e8f65…d3b2"
          className="fl-input"
        />
      </label>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={verifyJwt}
          onChange={(e) => setVerifyJwt(e.target.checked)}
          className="accent-[color:var(--accent)]"
        />
        <span className="fl-label" style={{ color: "var(--text)" }}>
          Vérifier le JWT Cloudflare (recommandé en production)
        </span>
      </label>

      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      {ok && (
        <p className="text-sm" style={{ color: "var(--accent-2)" }}>
          Enregistré.
        </p>
      )}

      <div>
        <button
          type="submit"
          className="fl-btn fl-btn-primary"
          disabled={pending}
        >
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
