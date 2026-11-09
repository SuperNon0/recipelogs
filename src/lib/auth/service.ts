import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Accès de service : les outils MCP (Claude, avec la clé secrète) passent par
 * les mêmes Server Actions que le site. Pendant une requête MCP dont la clé
 * est valide, getViewer() répond « tous les droits », comme avant les comptes.
 */
const store = new AsyncLocalStorage<{ service: string }>();

export function runAsService<T>(service: string, fn: () => Promise<T>): Promise<T> {
  return store.run({ service }, fn);
}

export function currentService(): string | null {
  return store.getStore()?.service ?? null;
}
