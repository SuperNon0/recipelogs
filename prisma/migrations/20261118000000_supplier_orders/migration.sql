-- Commandes aux fournisseurs, conditionnement commandé, case « Produit vendu ».
ALTER TABLE "recipes" ADD COLUMN "sold" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "recipes_sold_idx" ON "recipes"("sold");

ALTER TABLE "supplier_products" ADD COLUMN "pack_name" TEXT;

CREATE TABLE "supplier_orders" (
    "id" SERIAL NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "delivery_date" DATE,
    "place" TEXT,
    "note" TEXT,
    "added_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_order_lines" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "product_id" INTEGER,
    "label" TEXT NOT NULL,
    "reference" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "unit_price" DECIMAL(12,4),
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "supplier_order_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplier_orders_supplier_id_date_idx" ON "supplier_orders"("supplier_id", "date" DESC);
CREATE INDEX "supplier_orders_date_idx" ON "supplier_orders"("date" DESC);
CREATE INDEX "supplier_order_lines_order_id_idx" ON "supplier_order_lines"("order_id");
CREATE INDEX "supplier_order_lines_product_id_idx" ON "supplier_order_lines"("product_id");

ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_order_lines" ADD CONSTRAINT "supplier_order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "supplier_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_order_lines" ADD CONSTRAINT "supplier_order_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "supplier_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
