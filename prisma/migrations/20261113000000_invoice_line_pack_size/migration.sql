ALTER TABLE "purchase_order_lines" ADD COLUMN "pack_size" DECIMAL(12,4);

-- Recover only from values saved on the invoice itself. The current product's
-- packaging is not evidence of the historical packaging. Unrecoverable rows
-- intentionally remain NULL and are displayed as unknown.
UPDATE "purchase_order_lines"
SET "pack_size" = ROUND("pack_price" / "unit_price", 4)
WHERE "unit_price" > 0 AND "pack_price" > 0
  AND ROUND("pack_price" / "unit_price", 4) BETWEEN 0.0001 AND 99999999.9999;

UPDATE "purchase_order_lines"
SET "pack_size" = ROUND("line_total" / ("quantity" * "unit_price"), 4)
WHERE "pack_size" IS NULL AND "unit_price" > 0
  AND "quantity" > 0 AND "line_total" > 0
  AND ROUND("line_total" / ("quantity" * "unit_price"), 4) BETWEEN 0.0001 AND 99999999.9999;
