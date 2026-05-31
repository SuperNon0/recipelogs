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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShow(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
          if (suggestions.length > 0) setShow(true);
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
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setShow(false);
                setNoMatch(false);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "0.45rem 0.75rem",
                fontSize: "0.875rem",
                fontFamily: "var(--font-mono)",
                color: "var(--accent)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
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
              + Ajouter « {value.trim()} »
            </button>
          )}
        </div>
      )}
    </div>
  );
}
