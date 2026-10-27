"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Timer } from "lucide-react";
import { formatClock } from "@/lib/durations";

/**
 * Minuteurs du mode labo, tenus par la fiche (et non par le mode labo) : ils
 * continuent et sonnent même quand le mode labo est fermé. Gardés sur le
 * téléphone jusqu'à la fermeture de l'onglet.
 */

export type TimerState = { id: string; label: string; total: number; endsAt: number | null; left: number };

export function loadStored<T>(key: string, fallback: T): T {
  try {
    const v = sessionStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function saveStored(key: string, v: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* navigation privée : rien n'est gardé */
  }
}

// Un seul contexte audio pour la page : il survit à la fermeture du mode labo.
let audio: AudioContext | null = null;

/** À appeler sur un geste (toucher un bouton) : iPhone n'autorise le son qu'après. */
export function unlockSound() {
  if (!audio) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) audio = new AC();
  }
  void audio?.resume().catch(() => undefined);
}

/** Trois bips et une vibration, sans fichier audio. */
function ring() {
  const c = audio;
  if (c) {
    void c.resume().catch(() => undefined);
    for (let i = 0; i < 3; i++) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, c.currentTime + i * 0.45);
      g.gain.exponentialRampToValueAtTime(0.4, c.currentTime + i * 0.45 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + i * 0.45 + 0.3);
      o.connect(g).connect(c.destination);
      o.start(c.currentTime + i * 0.45);
      o.stop(c.currentTime + i * 0.45 + 0.32);
    }
  }
  navigator.vibrate?.([300, 150, 300, 150, 300]);
}

export function useLabTimers(recipeId: number) {
  const key = `labo:${recipeId}:timers`;
  const [timers, setTimers] = useState<TimerState[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const loaded = useRef(false);
  // Minuteurs déjà finis au chargement : pas de nouvelle sonnerie.
  const rang = useRef<Set<string>>(new Set());

  useEffect(() => {
    const stored = loadStored<TimerState[]>(key, []);
    rang.current = new Set(stored.filter((t) => t.endsAt && t.endsAt <= Date.now()).map((t) => t.id));
    setTimers(stored);
    loaded.current = true;
  }, [key]);
  useEffect(() => {
    if (loaded.current) saveStored(key, timers);
  }, [key, timers]);

  // Horloge.
  const running = timers.some((t) => t.endsAt);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);
  useEffect(() => {
    for (const t of timers) {
      if (t.endsAt && t.endsAt <= now && !rang.current.has(t.id)) {
        rang.current.add(t.id);
        ring();
      }
    }
  }, [now, timers]);

  // Retour sur l'appli : iPhone coupe le son en arrière-plan, on le relance.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      void audio?.resume().catch(() => undefined);
      setNow(Date.now());
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const start = useCallback((label: string, seconds: number) => {
    unlockSound();
    const id = `${Date.now()}`;
    setTimers((ts) => [...ts, { id, label, total: seconds, endsAt: Date.now() + seconds * 1000, left: seconds }]);
    setNow(Date.now());
  }, []);
  const left = useCallback((t: TimerState) => (t.endsAt ? Math.max(0, (t.endsAt - now) / 1000) : t.left), [now]);
  const toggle = useCallback(
    (id: string) =>
      setTimers((ts) =>
        ts.map((x) => (x.id !== id ? x : x.endsAt ? { ...x, endsAt: null, left: Math.max(0, (x.endsAt - Date.now()) / 1000) } : { ...x, endsAt: Date.now() + x.left * 1000 })),
      ),
    [],
  );
  const stop = useCallback((id: string) => setTimers((ts) => ts.filter((x) => x.id !== id)), []);

  return { timers, now, start, left, toggle, stop };
}

export type LabTimers = ReturnType<typeof useLabTimers>;

/** Minuteurs en cours quand le mode labo est fermé : toucher pour y revenir. */
export function LabTimerPill({ lab, onOpen }: { lab: LabTimers; onOpen: () => void }) {
  if (!lab.timers.length) return null;
  const next = [...lab.timers].sort((a, b) => lab.left(a) - lab.left(b))[0];
  const over = lab.timers.some((t) => lab.left(t) <= 0);
  return (
    <button type="button" className="lab-pill" data-over={over ? "true" : undefined} onClick={onOpen} aria-label="Revenir au mode labo (minuteurs)">
      <Timer size={16} />
      <span className="num">{over ? "Minuteur terminé" : formatClock(lab.left(next))}</span>
      {lab.timers.length > 1 && <small>+{lab.timers.length - 1}</small>}
    </button>
  );
}
