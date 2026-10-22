/** Clé de comparaison pour repérer les doublons : sans casse, accents ni pluriel. */
export function duplicateKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w.length > 3 ? w.replace(/[sx]$/, "") : w))
    .join(" ");
}
