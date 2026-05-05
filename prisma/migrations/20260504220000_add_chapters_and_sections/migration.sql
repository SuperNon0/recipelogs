-- AlterTable: section title on existing recipes
ALTER TABLE "cookbooks_recipes" ADD COLUMN "section_title" TEXT;

-- CreateTable: chapter pages
CREATE TABLE "cookbooks_chapters" (
    "id" SERIAL NOT NULL,
    "cookbook_id" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "intro" TEXT,
    "image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cookbooks_chapters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cookbooks_chapters_cookbook_id_position_idx" ON "cookbooks_chapters"("cookbook_id", "position");

-- AddForeignKey
ALTER TABLE "cookbooks_chapters" ADD CONSTRAINT "cookbooks_chapters_cookbook_id_fkey" FOREIGN KEY ("cookbook_id") REFERENCES "cookbooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
