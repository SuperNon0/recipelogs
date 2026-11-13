import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Accès de service : les outils MCP (Claude, avec la clé secrète) passent par
 * les mêmes Server Actions que le site. Pendant une requête MCP dont la clé
 * est valide, getViewer() répond « tous les droits », comme avant les comptes.
 */
const store = new AsyncLocalStorage<{ service: string; origin?: string }>();

export function runAsService<T>(service: string, fn: () => Promise<T>, origin?: string): Promise<T> {
  return store.run({ service, origin }, fn);
}

/** Adresse publique du site vue par la requête en cours (https://…), pour les liens donnés par Claude. */
export function currentOrigin(): string | null {
  return store.getStore()?.origin ?? null;
}

export function currentService(): string | null {
  return store.getStore()?.service ?? null;
}
