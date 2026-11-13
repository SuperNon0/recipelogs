/** Rendement Recipe Keeper : un nombre de pièces, ou le texte d'origine dans les notes. */
export function importYield(raw: string | null | undefined, notesTips: string | null) {
  const text = raw?.trim() ?? "";
  const match = text.match(/^(?:(?:pour|serves|makes)\s+)?(\d+)\s*([\p{L}][\p{L}\s'’.-]*)?$/iu);
  const count = match ? Number(match[1]) : 0;
  const label = match?.[2]?.trim() ?? "";
  // Une masse ou un volume n'est pas un nombre de pièces (ex. « 1080g »).
  const measured = /^(?:g|gr|grammes?|grams?|kg|kilogrammes?|kilograms?|mg|ml|cl|dl|l|litres?|liters?|oz|ounces?|lbs?|pounds?)(?:\s|$)/i.test(label);
  if (match && Number.isInteger(count) && count > 0 && count <= 100_000 && !measured) {
    return { yieldCount: count, yieldLabel: label || null, notesTips };
  }
  return {
    yieldCount: null,
    yieldLabel: null,
    notesTips: text ? [notesTips, `Rendement : ${text}`].filter(Boolean).join("\n") : notesTips,
  };
}
