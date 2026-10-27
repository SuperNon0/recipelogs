"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  ClipboardList,
  FileText,
  FolderOpen,
  Library,
  Palette,
  Plus,
  Search,
  Settings2,
  ShoppingBasket,
  Star,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import { STOP } from "./Menu";

/** Événement global pour ouvrir la recherche depuis n'importe quel bouton. */
export const OPEN_SEARCH_EVENT = "recipelog:search";

export function openSearch() {
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
}

type Item = {
  key: string;
  group: string;
  label: string;
  href: string;
  icon: LucideIcon;
  side?: string;
  color?: string | null;
};

type Results = {
  recipes: { id: number; name: string; folder: string | null; color: string | null }[];
  folders: { id: number; name: string; color: string; count: number }[];
  ingredients: { id: number; name: string; uses: number }[];
  cookbooks: { id: number; name: string }[];
  lists: { id: number; name: string }[];
};

const ACTIONS: Item[] = [
  { key: "a-new", group: "Actions", label: "Nouvelle recette", href: "/recipes/new", icon: Plus },
  { key: "a-fav", group: "Actions", label: "Favoris", href: "/favorites", icon: Star },
  { key: "a-cb", group: "Actions", label: "Nouveau cahier", href: "/cookbooks/new", icon: Library },
  { key: "a-sh", group: "Actions", label: "Nouvelle liste de courses", href: "/shopping/new", icon: ShoppingBasket },
  { key: "a-prod", group: "Actions", label: "Fiche de production", href: "/production", icon: ClipboardList },
  { key: "a-th", group: "Actions", label: "Thèmes PDF", href: "/settings/themes", icon: Palette },
  { key: "a-set", group: "Actions", label: "Réglages", href: "/settings", icon: Settings2 },
];

/** Fenêtre de recherche globale, ouverte par Ctrl K (ou ⌘ K sur Mac). */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Results | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setRes(null);
    setActive(0);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setRes(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d: Results) => {
          setRes(d);
          setActive(0);
        })
        .catch(() => {});
    }, 120);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const items = useMemo<Item[]>(() => {
    const term = q.trim().toLowerCase();
    const actions = term ? ACTIONS.filter((a) => a.label.toLowerCase().includes(term)) : ACTIONS;
    if (!res) return actions;
    return [
      ...res.recipes.map((r) => ({
        key: `r${r.id}`, group: "Recettes", label: r.name, href: `/recipes/${r.id}`,
        icon: BookOpen, side: r.folder ?? undefined, color: r.color,
      })),
      ...res.folders.map((f) => ({
        key: `f${f.id}`, group: "Dossiers", label: f.name, href: `/?folder=${f.id}`,
        icon: FolderOpen, side: `${f.count} recette${f.count > 1 ? "s" : ""}`, color: f.color,
      })),
      ...res.ingredients.map((i) => ({
        key: `i${i.id}`, group: "Ingrédients", label: i.name, href: `/settings/ingredients/${i.id}`,
        icon: Wheat, side: `${i.uses} recette${i.uses > 1 ? "s" : ""}`,
      })),
      ...res.cookbooks.map((c) => ({
        key: `c${c.id}`, group: "Cahiers", label: c.name, href: `/cookbooks/${c.id}`, icon: FileText,
      })),
      ...res.lists.map((l) => ({
        key: `l${l.id}`, group: "Courses", label: l.name, href: `/shopping/${l.id}`, icon: ShoppingBasket,
      })),
      ...actions,
    ];
  }, [res, q]);

  const go = (it: Item | undefined) => {
    if (!it) return;
    close();
    router.push(it.href);
  };

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open || typeof document === "undefined") return null;

  let lastGroup = "";
  return createPortal(
    <div style={{ display: "contents" }} {...STOP}>
      <div className="sheet-veil" style={{ zIndex: 89 }} onClick={close} />
      <div className="cmdk" role="dialog" aria-label="Rechercher">
        <div className="cmdk-in">
          <button type="button" className="mob-only" onClick={close} aria-label="Fermer" style={{ background: "none", border: "none", color: "var(--accent)", display: "grid" }}>
            <ArrowLeft size={20} />
          </button>
          <Search size={18} className="desk-only" style={{ color: "var(--muted)" }} />
          <input
            ref={inputRef}
            value={q}
            placeholder="Rechercher une recette, un ingrédient, un cahier…"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(items[active]);
              }
            }}
            autoComplete="off"
            spellCheck={false}
          />
          <span className="fl-kbd desk-only">Échap</span>
        </div>
        <div className="cmdk-list" ref={listRef}>
          {q.trim() && res && items.length === 0 && (
            <div style={{ padding: "22px 18px", color: "var(--muted)", fontSize: 13.5 }}>
              Aucun résultat pour « {q.trim()} ».
            </div>
          )}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            const Icon = it.icon;
            return (
              <div key={it.key}>
                {header && <div className="cmdk-grp">{header}</div>}
                <button
                  type="button"
                  className="cmdk-it"
                  data-active={i === active ? "true" : undefined}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(it)}
                >
                  <Icon size={17} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <Highlight text={it.label} term={q.trim()} />
                  </span>
                  {it.side && (
                    <small style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {it.color && <span className="dot" style={{ background: it.color }} />}
                      {it.side}
                    </small>
                  )}
                </button>
              </div>
            );
          })}
        </div>
        <div className="cmdk-foot">
          <span>Flèches : naviguer</span>
          <span>Entrée : ouvrir</span>
          <span>Ctrl K : ouvrir / fermer</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Highlight({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const i = norm(text).indexOf(norm(term));
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + term.length)}</mark>
      {text.slice(i + term.length)}
    </>
  );
}
