-- Mercuriales déposées depuis la fiche d'un fournisseur, en attente (« À traiter »).
ALTER TABLE "pending_invoices" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'facture';
ALTER TABLE "pending_invoices" ADD COLUMN "supplier_id" INTEGER;
