-- Jours de commande et de livraison d'un fournisseur (« 1,3,5 », 1 = lundi), et ses numéros à appeler.
ALTER TABLE "suppliers" ADD COLUMN "order_days" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "delivery_days" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "contacts" JSONB;
