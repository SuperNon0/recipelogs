"use client";

import { useState, type ReactNode } from "react";

type TabKey = "recipes" | "apparence";

export function CookbookTabs({
  recipes,
  apparence,
}: {
  recipes: ReactNode;
  apparence: ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>("recipes");

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex rounded-md overflow-hidden border self-start"
        style={{ borderColor: "var(--border)" }}
        role="tablist"
      >
        <TabButton current={tab} value="recipes" onClick={setTab}>
          📋 Recettes
        </TabButton>
        <TabButton current={tab} value="apparence" onClick={setTab}>
          🎨 Apparence
        </TabButton>
      </div>

      <div role="tabpanel" hidden={tab !== "recipes"}>
        {tab === "recipes" && recipes}
      </div>
      <div role="tabpanel" hidden={tab !== "apparence"}>
        {tab === "apparence" && apparence}
      </div>
    </div>
  );
}

function TabButton({
  current,
  value,
  onClick,
  children,
}: {
  current: TabKey;
  value: TabKey;
  onClick: (v: TabKey) => void;
  children: ReactNode;
}) {
  const selected = current === value;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      role="tab"
      aria-selected={selected}
      className="px-4 py-2 text-sm transition-colors"
      style={{
        background: selected ? "var(--accent)" : "transparent",
        color: selected ? "var(--bg)" : "var(--text)",
        fontWeight: selected ? 700 : 500,
        borderRight: "1px solid var(--border)",
      }}
    >
      {children}
    </button>
  );
}
