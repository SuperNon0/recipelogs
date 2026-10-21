"use client";

import { useState, useRef, useEffect } from "react";
import { Plus } from "lucide-react";

type Suggestion = { id: number; name: string };

/**
 * Champ « nom d'ingrédient » avec autocomplétion sur la base d'ingrédients.
 * Flèches haut / bas + Entrée pour choisir une suggestion au clavier.
 */
export function IngredientNameInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [noMatch, setNoMatch] = useState(false);
  const [show, setShow] = useState(false);
  const [active, setActive] = useState(-1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchSuggestions = (q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.length < 2) {
      setSuggestions([]);
      setNoMatch(false);
      setShow(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ingredient-bases?q=${encodeURIComponent(q)}`);
        const data: Suggestion[] = await res.json();
        setSuggestions(data);
        setNoMatch(data.length === 0);
        setActive(-1);
        setShow(true);
      } catch {
        setSuggestions([]);
        setNoMatch(false);
      }
    }, 200);
  };

  const closeDropdown = () => setShow(false);

  const pick = (name: string) => {
    onChange(name);
    setShow(false);
  };

  useEffect(() => {
    // mousedown : ordinateur, touchstart : téléphone
    function handleOutside(e: Event) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!show || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? suggestions.length - 1 : a - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(suggestions[active].name);
    } else if (e.key === "Escape") {
      closeDropdown();
    }
  };

  return (
    <div ref={containerRef} style={{ position: "relative", minWidth: 0 }}>
      <input
        placeholder={placeholder ?? "Ingrédient"}
        aria-label={ariaLabel ?? "Nom de l'ingrédient"}
        className="fl-input"
        value={value}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          fetchSuggestions(e.target.value);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (suggestions.length > 0 || noMatch) setShow(true);
        }}
        onBlur={() => {
          // Fermeture différée pour laisser le choix d'une suggestion s'exécuter
          setTimeout(closeDropdown, 150);
        }}
      />
      {show && (suggestions.length > 0 || (noMatch && value.trim().length >= 2)) && (
        <div className="rf-pop" role="listbox">
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={i === active}
              data-active={i === active}
              className="rf-pop-item"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s.name);
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                pick(s.name);
              }}
            >
              {s.name}
            </button>
          ))}
          {noMatch && value.trim().length >= 2 && (
            <div className="rf-pop-note">
              <Plus size={14} />
              Nouvel ingrédient : il sera ajouté à ta base à l&apos;enregistrement.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
