import { z } from "zod";
import type { McpTool, McpToolResult } from "../protocol";

/** Résultat texte (JSON lisible) renvoyé à Claude. */
export function text(data: unknown): McpToolResult {
  return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
}

/** Lit les arguments ; une erreur de saisie devient un message lisible pour Claude. */
export function parseArgs<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, args: Record<string, unknown>): T {
  const r = schema.safeParse(args);
  if (!r.success) {
    throw new Error(r.error.issues.map((i) => `${i.path.join(".") || "arguments"} : ${i.message}`).join(" ; "));
  }
  return r.data;
}

/**
 * Appelle une Server Action de l'appli (mêmes règles que l'interface).
 * - `{ ok: false, error }` devient une erreur pour Claude ;
 * - une redirection (après création, suppression…) n'est pas une erreur :
 *   on renvoie l'adresse visée, qui contient souvent l'id créé.
 */
export async function runAction<T>(
  action: () => Promise<T>,
): Promise<{ result?: Exclude<T, { ok: false }>; redirectTo?: string }> {
  try {
    const result = await action();
    if (result && typeof result === "object" && "ok" in result && result.ok === false) {
      throw new Error(String((result as { error?: unknown }).error ?? "action refusée"));
    }
    return { result: result as Exclude<T, { ok: false }> };
  } catch (e) {
    const digest = (e as { digest?: unknown })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      return { redirectTo: digest.split(";")[2] };
    }
    throw e;
  }
}

/** Id numérique à la fin d'une adresse (« /recipes/12 » → 12). */
export function idFromPath(path: string | undefined): number | null {
  const m = path?.match(/\/(\d+)$/);
  return m ? Number(m[1]) : null;
}

export function formData(entries: Record<string, string | number | boolean | null | undefined | (string | number)[]>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    if (v === undefined || v === null || v === false) continue;
    if (Array.isArray(v)) for (const item of v) fd.append(k, String(item));
    else fd.append(k, v === true ? "on" : String(v));
  }
  return fd;
}

/** Schémas réutilisés. */
export const id = z.number().int().positive();
export const ids = z.array(id).min(1).max(500);
export const color = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "couleur au format #rrggbb")
  .optional();

/** Raccourcis pour les schémas JSON envoyés à Claude. */
export const js = {
  int: (description: string) => ({ type: "integer", description }),
  num: (description: string) => ({ type: "number", description }),
  str: (description: string) => ({ type: "string", description }),
  bool: (description: string) => ({ type: "boolean", description }),
  ints: (description: string) => ({ type: "array", items: { type: "integer" }, description }),
  strs: (description: string) => ({ type: "array", items: { type: "string" }, description }),
  enum: (values: readonly string[], description: string) => ({ type: "string", enum: [...values], description }),
};

export const READ = { readOnlyHint: true } as const;
export const WRITE = { readOnlyHint: false, destructiveHint: false } as const;
export const DELETE = { readOnlyHint: false, destructiveHint: true } as const;

export type { McpTool };
