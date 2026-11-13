/** Amounts use only values recorded on the invoice, never the current product. */
export function purchaseLineAmounts(line: {
  quantity: number | null;
  packSize: number | null;
  packPrice: number | null;
  unitPrice: number;
  lineTotal: number | null;
}): { each: number | null; amount: number | null } {
  const each = line.packPrice ??
    (line.packSize != null ? line.unitPrice * line.packSize :
      line.lineTotal != null && line.quantity != null && line.quantity > 0 ? line.lineTotal / line.quantity : null);
  const amount = line.lineTotal ??
    (line.quantity != null && each != null ? Math.round(each * line.quantity * 100) / 100 : null);
  return { each, amount };
}
