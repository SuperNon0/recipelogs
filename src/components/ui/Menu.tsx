"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, MoreVertical, type LucideIcon } from "lucide-react";
import { useEscape, useIsPhone } from "./useMedia";

/**
 * Menu d'actions façon clic droit Windows.
 *
 * - Ordinateur : clic droit sur l'élément OU bouton « ⋯ » → petit menu flottant,
 *   avec sous-menus (« Déplacer vers › »).
 * - Téléphone : appui long OU bouton « ⋯ » → feuille qui remonte du bas, avec
 *   de gros boutons d'actions rapides en haut.
 */

export type MenuAction = {
  label: string;
  icon?: LucideIcon;
  /** Pastille de couleur à la place de l'icône (dossiers). */
  dot?: string;
  /** Raccourci ou valeur affichée à droite (ordinateur uniquement). */
  hint?: string;
  href?: string;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Coché (choix exclusif, ex. mode de calcul). */
  checked?: boolean;
  submenu?: MenuEntry[];
};

export type MenuEntry = MenuAction | { separator: true } | { section: string };

export type MenuSpec = {
  /** Titre (ordinateur) / en-tête (téléphone). */
  title?: string;
  icon?: LucideIcon;
  /** En-tête riche de la feuille téléphone (vignette, sous-titre…). */
  head?: React.ReactNode;
  /** Grosses actions rapides en haut de la feuille téléphone (4 max). */
  quick?: MenuAction[];
  items: MenuEntry[];
};

type Anchor = { x: number; y: number; alignRight?: boolean; below?: number };

const isAction = (e: MenuEntry): e is MenuAction => "label" in e;

const stop = (e: React.SyntheticEvent) => e.stopPropagation();
/** Arrête la propagation (à travers les portails) des clics et gestes. */
export const STOP = {
  onClick: stop,
  onContextMenu: stop,
  onTouchStart: stop,
  onTouchEnd: stop,
  onMouseDown: stop,
};

// ─── Hook générique ──────────────────────────────────────────────────────────

export function useActionMenu(getSpec: () => MenuSpec) {
  const [state, setState] = useState<{ anchor: Anchor; spec: MenuSpec } | null>(null);
  const close = useCallback(() => setState(null), []);
  const openAt = useCallback(
    (anchor: Anchor) => setState({ anchor, spec: getSpec() }),
    [getSpec],
  );
  const element = state ? (
    <ActionMenuPopup spec={state.spec} anchor={state.anchor} onClose={close} />
  ) : null;
  return { open: !!state, openAt, close, element };
}

// ─── Bouton « ⋯ » ────────────────────────────────────────────────────────────

export function MoreButton({
  spec,
  label = "Plus d'actions",
  horizontal,
  className = "more-btn",
  size = 16,
}: {
  spec: MenuSpec | (() => MenuSpec);
  label?: string;
  horizontal?: boolean;
  className?: string;
  size?: number;
}) {
  const getSpec = useCallback(() => (typeof spec === "function" ? spec() : spec), [spec]);
  const menu = useActionMenu(getSpec);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={className}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (menu.open) return menu.close();
          const r = ref.current!.getBoundingClientRect();
          menu.openAt({ x: r.right, y: r.bottom + 6, alignRight: true, below: r.top });
        }}
      >
        {horizontal ? (
          <MoreVertical size={size} style={{ transform: "rotate(90deg)" }} />
        ) : (
          <MoreVertical size={size} />
        )}
      </button>
      {menu.element}
    </>
  );
}

// ─── Zone avec clic droit / appui long ───────────────────────────────────────

/**
 * Rend ses enfants dans un élément qui ouvre le menu au clic droit (souris) ou
 * à l'appui long (doigt). Le premier clic après un appui long est annulé pour
 * ne pas ouvrir la recette en même temps que le menu.
 */
export function ContextArea({
  spec,
  children,
  className,
  style,
  selected,
}: {
  spec: MenuSpec | (() => MenuSpec);
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  selected?: boolean;
}) {
  const getSpec = useCallback(() => (typeof spec === "function" ? spec() : spec), [spec]);
  const menu = useActionMenu(getSpec);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const swallowClick = useRef(false);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  return (
    <div
      className={className}
      style={{ ...style, WebkitTouchCallout: "none" } as React.CSSProperties}
      data-menu-open={menu.open || selected ? "true" : undefined}
      onContextMenu={(e) => {
        e.preventDefault();
        cancel();
        menu.openAt({ x: e.clientX, y: e.clientY });
      }}
      onTouchStart={(e) => {
        const t = e.touches[0];
        start.current = { x: t.clientX, y: t.clientY };
        cancel();
        timer.current = setTimeout(() => {
          swallowClick.current = true;
          if (navigator.vibrate) navigator.vibrate(10);
          menu.openAt({ x: t.clientX, y: t.clientY });
        }, 480);
      }}
      onTouchMove={(e) => {
        const t = e.touches[0];
        if (start.current && Math.hypot(t.clientX - start.current.x, t.clientY - start.current.y) > 10) cancel();
      }}
      onTouchEnd={cancel}
      onTouchCancel={cancel}
      onClickCapture={(e) => {
        if (swallowClick.current) {
          swallowClick.current = false;
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {children}
      {menu.element}
    </div>
  );
}

// ─── Rendu du menu ───────────────────────────────────────────────────────────

export function ActionMenuPopup({
  spec,
  anchor,
  onClose,
}: {
  spec: MenuSpec;
  anchor: Anchor;
  onClose: () => void;
}) {
  const phone = useIsPhone();
  const router = useRouter();
  useEscape(true, onClose);

  const run = useCallback(
    (a: MenuAction) => {
      if (a.disabled) return;
      onClose();
      if (a.href) router.push(a.href);
      else a.onSelect?.();
    },
    [onClose, router],
  );

  if (typeof document === "undefined") return null;
  // Les événements React traversent les portails : on les arrête ici pour
  // qu'un clic dans le menu n'active pas la ligne (ou le lien) qui l'a ouvert.
  return createPortal(
    <div style={{ display: "contents" }} {...STOP}>
      {phone ? (
        <PhoneSheet spec={spec} run={run} onClose={onClose} />
      ) : (
        <DesktopMenu spec={spec} anchor={anchor} run={run} onClose={onClose} />
      )}
    </div>,
    document.body,
  );
}

function DesktopMenu({
  spec,
  anchor,
  run,
  onClose,
}: {
  spec: MenuSpec;
  anchor: Anchor;
  run: (a: MenuAction) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [sub, setSub] = useState<{ index: number; top: number; left: number } | null>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const [subPos, setSubPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = anchor.alignRight ? anchor.x - w : anchor.x;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = anchor.y;
    if (top + h > window.innerHeight - 8) {
      top = anchor.below !== undefined ? anchor.below - h - 6 : anchor.y - h;
    }
    top = Math.max(8, top);
    setPos({ left, top });
  }, [anchor]);

  useLayoutEffect(() => {
    const el = subRef.current;
    if (!el || !sub) return setSubPos(null);
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = sub.left;
    if (left + w > window.innerWidth - 8) left = (pos?.left ?? 0) - w - 4;
    const top = Math.max(8, Math.min(sub.top - 6, window.innerHeight - h - 8));
    setSubPos({ left, top });
  }, [sub, pos]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || subRef.current?.contains(t)) return;
      onClose();
    };
    const onScroll = () => onClose();
    // Laisse passer le clic droit qui vient d'ouvrir le menu.
    const id = setTimeout(() => {
      document.addEventListener("mousedown", onDown);
      document.addEventListener("contextmenu", onDown);
    }, 0);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("contextmenu", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [onClose]);

  const subItems =
    sub && isAction(spec.items[sub.index]) ? (spec.items[sub.index] as MenuAction).submenu ?? [] : [];

  return (
    <>
      <div
        ref={ref}
        className="menu"
        role="menu"
        style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {spec.title && (
          <div className="menu-title">
            {spec.icon && <spec.icon size={14} />}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{spec.title}</span>
          </div>
        )}
        {spec.items.map((e, i) => (
          <Entry
            key={i}
            entry={e}
            active={sub?.index === i}
            onRun={run}
            onOpenSub={(el) => {
              const r = el.getBoundingClientRect();
              setSub({ index: i, top: r.top, left: r.right + 4 });
            }}
            onHover={(hasSub, el) => {
              if (hasSub && el) {
                const r = el.getBoundingClientRect();
                setSub({ index: i, top: r.top, left: r.right + 4 });
              } else setSub(null);
            }}
          />
        ))}
      </div>
      {sub && subItems.length > 0 && (
        <div
          ref={subRef}
          className="menu"
          role="menu"
          style={{ left: subPos?.left ?? -9999, top: subPos?.top ?? -9999, minWidth: 190 }}
        >
          {subItems.map((e, i) => (
            <Entry key={i} entry={e} onRun={run} />
          ))}
        </div>
      )}
    </>
  );
}

function Entry({
  entry,
  onRun,
  onOpenSub,
  onHover,
  active,
}: {
  entry: MenuEntry;
  onRun: (a: MenuAction) => void;
  onOpenSub?: (el: HTMLElement) => void;
  onHover?: (hasSub: boolean, el?: HTMLElement) => void;
  active?: boolean;
}) {
  if ("separator" in entry) return <hr className="menu-sep" />;
  if ("section" in entry) return <div className="menu-sect">{entry.section}</div>;
  const Icon = entry.icon;
  const hasSub = !!entry.submenu?.length;
  return (
    <button
      type="button"
      role="menuitem"
      className={`menu-item${entry.danger ? " danger" : ""}`}
      disabled={entry.disabled}
      data-active={active ? "true" : undefined}
      data-checked={entry.checked ? "true" : undefined}
      onMouseEnter={(e) => onHover?.(hasSub, e.currentTarget)}
      onClick={(e) => {
        if (hasSub) onOpenSub?.(e.currentTarget);
        else onRun(entry);
      }}
    >
      {Icon ? (
        <Icon />
      ) : entry.dot ? (
        <span className="dot" style={{ background: entry.dot, margin: "0 4px" }} />
      ) : entry.checked !== undefined ? (
        <span style={{ width: 16 }} />
      ) : null}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{entry.label}</span>
      {hasSub ? (
        <ChevronRight style={{ marginLeft: "auto", width: 14, height: 14 }} />
      ) : entry.checked ? (
        <Check style={{ marginLeft: "auto", width: 14, height: 14, color: "var(--accent)" }} />
      ) : entry.hint ? (
        <span className="hint">{entry.hint}</span>
      ) : null}
    </button>
  );
}

function PhoneSheet({
  spec,
  run,
  onClose,
}: {
  spec: MenuSpec;
  run: (a: MenuAction) => void;
  onClose: () => void;
}) {
  const [subOf, setSubOf] = useState<MenuAction | null>(null);
  const quick = subOf ? [] : (spec.quick ?? []).slice(0, 4);
  const items = subOf ? subOf.submenu ?? [] : spec.items;

  return (
    <>
      <div className="sheet-veil" onClick={onClose} />
      <div className="sheet" role="menu">
        <div className="sheet-grab" />
        {subOf ? (
          <button
            type="button"
            className="sheet-head"
            onClick={() => setSubOf(null)}
            style={{ width: "100%", background: "none", border: "none", borderBottom: "1px solid var(--border)", color: "var(--text)", textAlign: "left" }}
          >
            <ChevronLeft size={20} style={{ color: "var(--accent)" }} />
            <b>{subOf.label}</b>
          </button>
        ) : spec.head ? (
          <div className="sheet-head">{spec.head}</div>
        ) : spec.title ? (
          <div className="sheet-head">
            {spec.icon && <spec.icon size={18} style={{ color: "var(--muted)" }} />}
            <b>{spec.title}</b>
          </div>
        ) : null}
        {quick.length > 0 && (
          <div className="sheet-quick" style={{ gridTemplateColumns: `repeat(${quick.length}, 1fr)` }}>
            {quick.map((q, i) => {
              const Icon = q.icon;
              return (
                <button key={i} type="button" onClick={() => run(q)} disabled={q.disabled}>
                  {Icon && <Icon />}
                  {q.label}
                </button>
              );
            })}
          </div>
        )}
        <div style={{ marginTop: quick.length ? 6 : 0 }}>
          {items.map((e, i) => {
            if ("separator" in e) return null;
            if ("section" in e) return <div key={i} className="menu-sect">{e.section}</div>;
            const Icon = e.icon;
            const hasSub = !!e.submenu?.length;
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                className={`menu-item${e.danger ? " danger" : ""}`}
                disabled={e.disabled}
                data-checked={e.checked ? "true" : undefined}
                onClick={() => (hasSub ? setSubOf(e) : run(e))}
                style={i === 0 && !quick.length ? { borderTop: "none" } : undefined}
              >
                {Icon ? (
                  <Icon />
                ) : e.dot ? (
                  <span className="dot" style={{ background: e.dot, width: 10, height: 10, margin: "0 4.5px" }} />
                ) : (
                  <span style={{ width: 19 }} />
                )}
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{e.label}</span>
                {hasSub ? (
                  <ChevronRight style={{ color: "var(--muted)" }} />
                ) : e.checked ? (
                  <Check style={{ color: "var(--accent)" }} />
                ) : null}
              </button>
            );
          })}
        </div>
        <button type="button" className="sheet-cancel" onClick={onClose}>
          Annuler
        </button>
      </div>
    </>
  );
}
