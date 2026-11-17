-- Factures prises en photo, en attente de lecture (« À traiter »).
CREATE TABLE "pending_invoices" (
    "id" SERIAL NOT NULL,
    "files" TEXT[],
    "note" TEXT,
    "added_by" TEXT,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_invoices_pkey" PRIMARY KEY ("id")
);
