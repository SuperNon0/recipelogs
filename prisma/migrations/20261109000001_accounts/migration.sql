-- Comptes et rôles personnalisés (Apprenti, Chef…) avec leurs permissions,
-- et journal des comptes. Tant que les comptes ne sont pas activés dans
-- Réglages → Comptes, le site marche comme avant.

CREATE TYPE "AccountStatus" AS ENUM ('pending', 'active', 'refused', 'blocked');

CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category_ids" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- Rôle Administrateur intégré : toutes les permissions.
INSERT INTO "roles" ("name", "is_admin") VALUES ('Administrateur', true);

CREATE TABLE "accounts" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "role_id" INTEGER,
    "status" "AccountStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3),
    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "accounts_email_key" ON "accounts"("email");
CREATE INDEX "accounts_status_idx" ON "accounts"("status");
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_email" TEXT,
    "action" VARCHAR(40) NOT NULL,
    "target_email" TEXT,
    "detail" TEXT,
    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_log_at_idx" ON "audit_log"("at" DESC);
