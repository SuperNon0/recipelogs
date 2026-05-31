"use client";

import { useState, useRef, useEffect } from "react";

type Suggestion = { id: number; name: string };

export function IngredientNameInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [noMatch, setNoMatch] = useState(false);
  const [show, setShow] = useState(false);
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
        const res = await fetch(
          `/api/ingredient-bases?q=${encodeURIComponent(q)}`,
        );
        const data: Suggestion[] = await res.json();
        setSuggestions(data);
        setNoMatch(data.length === 0);
        setShow(true);
      } catch {
        setSuggestions([]);
        setNoMatch(false);
      }
    }, 200);
  };

  const closeDropdown = () => setShow(false);

  useEffect(() => {
    // mousedown : desktop, touchstart : mobile
    function handleOutside(e: Event) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
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

  return (
    <div ref={containerRef} style={{ position: "relative", flex: 1 }}>
      <input
        name="ingredientName"
        placeholder={placeholder ?? "Ingrédient"}
        className="fl-input"
        style={{ width: "100%" }}
        value={value}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          fetchSuggestions(e.target.value);
        }}
        onFocus={() => {
          if (suggestions.length > 0 || noMatch) setShow(true);
        }}
        onBlur={() => {
          // Fermeture différée pour laisser le onMouseDown/onTouchEnd des items s'exécuter
          setTimeout(closeDropdown, 150);
        }}
      />
      {show && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 2px)",
            left: 0,
            right: 0,
            zIndex: 50,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            maxHeight: 220,
            overflowY: "auto",
          }}
        >
          {suggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(s.name);
                setShow(false);
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                onChange(s.name);
                setShow(false);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "0.45rem 0.75rem",
                fontSize: "0.875rem",
                fontFamily: "var(--font-mono)",
                color: "var(--text)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                borderBottom: "1px solid var(--border)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "var(--border)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "transparent";
              }}
            >
              {s.name}
            </button>
          ))}
          {noMatch && value.trim().length >= 2 && (
            <div
              style={{
                padding: "0.45rem 0.75rem",
                fontSize: "0.82rem",
                fontFamily: "var(--font-mono)",
                color: "var(--accent)",
                borderTop: suggestions.length > 0 ? "1px solid var(--border)" : "none",
              }}
            >
              ✦ Nouvel ingrédient — sera ajouté à la base à l&apos;enregistrement
            </div>
          )}
        </div>
      )}
    </div>
  );
}
