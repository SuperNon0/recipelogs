-- Thèmes PDF enregistrés (V2.0)
CREATE TABLE "pdf_themes" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" TEXT,
    "preset_key" TEXT,
    "format" "PaperFormat" NOT NULL DEFAULT 'A4',
    "config" JSONB NOT NULL DEFAULT '{}',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pdf_themes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pdf_themes_preset_key_key" ON "pdf_themes"("preset_key");
CREATE INDEX "pdf_themes_position_idx" ON "pdf_themes"("position");
