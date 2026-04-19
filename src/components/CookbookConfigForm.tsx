"use client";

import { useTransition, useState } from "react";
import { updateCookbookConfig } from "@/app/actions/cookbooks";

type Template = { id: number; name: string };

export function CookbookConfigForm({
  cookbookId,
  defaultValues,
  templates,
}: {
  cookbookId: number;
  defaultValues: {
    name: string;
    description: string;
    format: string;
    templateId: number | null;
    hasToc: boolean;
    hasCover: boolean;
    hasLogo: boolean;
    footer: string;
  };
  templates: Template[];
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateCookbookConfig(cookbookId, fd);
      if (result.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="fl-card flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="fl-label">Nom *</span>
        <input
          name="name"
          required
          maxLength={200}
          defaultValue={defaultValues.name}
          className="fl-input"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="fl-label">Description</span>
        <textarea
          name="description"
          rows={3}
          maxLength={2000}
          defaultValue={defaultValues.description}
          className="fl-input"
        />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="fl-label">Format</span>
          <select
            name="format"
            defaultValue={defaultValues.format}
            className="fl-input"
          >
            <option value="A4">A4</option>
            <option value="A5">A5</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="fl-label">Template</span>
          <select
            name="templateId"
            defaultValue={defaultValues.templateId ?? ""}
            className="fl-input"
          >
            <option value="">— Aucun —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            name="hasToc"
            defaultChecked={defaultValues.hasToc}
            className="accent-[color:var(--accent)]"
          />
          <span className="fl-label">Table des matières</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            name="hasCover"
            defaultChecked={defaultValues.hasCover}
            className="accent-[color:var(--accent)]"
          />
          <span className="fl-label">Page de couverture</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            name="hasLogo"
            defaultChecked={defaultValues.hasLogo}
            className="accent-[color:var(--accent)]"
          />
          <span className="fl-label">Logo</span>
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="fl-label">Pied de page</span>
        <input
          name="footer"
          maxLength={500}
          defaultValue={defaultValues.footer}
          className="fl-input"
          placeholder="Ex : © Ma Pâtisserie 2025"
        />
      </label>

      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="fl-btn fl-btn-primary"
        >
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        {saved && (
          <span className="fl-label" style={{ color: "var(--accent-2)" }}>
            ✓ Enregistré
          </span>
        )}
      </div>
    </form>
  );
}
