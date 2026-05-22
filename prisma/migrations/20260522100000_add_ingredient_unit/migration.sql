-- Add unit column to ingredients table (default 'g' for all existing rows)
ALTER TABLE "ingredients" ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'g';
