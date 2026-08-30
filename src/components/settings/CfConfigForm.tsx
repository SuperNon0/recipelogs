"use client";

import { useRef, useState, useTransition } from "react";
import { saveCfConfig, testCfConfig } from "@/app/actions/accounts";
import type { CfConfig, CfTestResult } from "@/lib/auth/cloudflare";
import { Icon } from "@/components/Icon";

export function CfConfigForm({ initial }: { initial: CfConfig }) {
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [verifyJwt, setVerifyJwt] = useState(initial.verifyJwt);
  const [test, setTest] = useState<CfTestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function currentFormData(): FormData {
    const fd = new FormData(formRef.current ?? undefined);
    if (verifyJwt) fd.set("verifyJwt", "on");
    else fd.delete("verifyJwt");
    return fd;
  }

  function onSubmit() {
    setError(null);
    setOk(false);
    start(async () => {
      const r = await saveCfConfig(currentFormData());
      if (r.ok) setOk(true);
      else setError(r.error);
    });
  }

  function onTest() {
    setTest(null);
    setTestError(null);
    startTest(async () => {
      const r = await testCfConfig(currentFormData());
      if (r.ok) setTest(r.result);
      else setTestError(r.error);
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-3"
    >
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
        <span className="fl-label">Audience ID de l&apos;application (AUD)</span>
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

      {/* Résultat du test */}
      {(test || testError) && (
        <div
          className="flex flex-col gap-2 rounded-md p-3"
          style={{
            background: "var(--surface)",
            border: `1px solid ${
              testError || !test?.ok ? "var(--danger)" : "var(--accent-2)"
            }`,
          }}
        >
          {testError && (
            <div
              className="text-sm inline-flex items-center gap-2"
              style={{ color: "var(--danger)" }}
            >
              <Icon name="AlertCircle" size={16} tone="danger" />
              {testError}
            </div>
          )}
          {test && (
            <>
              <CheckLine
                ok={test.teamDomainOk}
                label="Team domain"
                detail={test.teamDomainOk ? "Format valide" : test.error}
              />
              <CheckLine
                ok={test.jwksReachable}
                label="Clés publiques Cloudflare"
                detail={
                  test.jwksReachable
                    ? `${test.jwksKeyCount} clé${test.jwksKeyCount > 1 ? "s" : ""} téléchargée${test.jwksKeyCount > 1 ? "s" : ""}`
                    : "Impossible de joindre /cdn-cgi/access/certs"
                }
              />
              <CheckLine
                ok={test.audValid}
                label="Audience ID"
                detail={
                  test.audValid
                    ? "Format valide"
                    : "Format inattendu (16-128 caractères hex)"
                }
              />
            </>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      {ok && (
        <p
          className="text-sm inline-flex items-center gap-2"
          style={{ color: "var(--accent-2)" }}
        >
          <Icon name="Check" size={14} tone="accent2" /> Enregistré
        </p>
      )}

      <div className="flex gap-2 flex-wrap">
        <button
          type="submit"
          className="fl-btn fl-btn-primary inline-flex items-center gap-2"
          disabled={pending || testing}
        >
          <Icon name="Save" size={14} />{" "}
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={onTest}
          className="fl-btn fl-btn-secondary inline-flex items-center gap-2"
          disabled={pending || testing}
          title="Vérifie que les clés publiques Cloudflare sont joignables et que l'AUD est bien formé"
        >
          <Icon
            name={testing ? "Loader2" : "PlugZap"}
            size={14}
            className={testing ? "animate-spin" : undefined}
          />{" "}
          {testing ? "Test en cours…" : "Tester la connexion"}
        </button>
      </div>
    </form>
  );
}

function CheckLine({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail?: string | null;
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          background: ok ? "var(--accent-2)" : "var(--danger)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        <Icon
          name={ok ? "Check" : "X"}
          size={12}
          strokeWidth={2.5}
          style={{ color: "var(--bg)" }}
        />
      </span>
      <div className="flex-1 min-w-0">
        <div style={{ color: "var(--text)" }}>{label}</div>
        {detail && (
          <div className="fl-label" style={{ fontSize: "0.7rem" }}>
            {detail}
          </div>
        )}
      </div>
    </div>
  );
}
