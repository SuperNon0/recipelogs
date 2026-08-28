-- Auth v2 : Comptes multi-utilisateurs (bibliothèque partagée), journal d'audit
-- et réglages système (AppSetting). Idempotent (IF NOT EXISTS partout).

-- ─── Types énumérés ───────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE "AccountRole" AS ENUM ('super_admin', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "AccountState" AS ENUM ('pending', 'active', 'refused', 'blocked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "AuditAction" AS ENUM (
        'login_local', 'login_cf', 'logout', 'request_access',
        'validate', 'refuse', 'block', 'unblock', 'delete',
        'add_super_admin', 'remove_super_admin',
        'password_change', 'settings_change', 'denied_access'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── accounts ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "accounts" (
    "id"            SERIAL PRIMARY KEY,
    "email"         TEXT,
    "role"          "AccountRole"  NOT NULL DEFAULT 'member',
    "state"         "AccountState" NOT NULL DEFAULT 'pending',
    "password_hash" TEXT,
    "created_at"    TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validated_at"  TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3)
);

CREATE UNIQUE INDEX IF NOT EXISTS "accounts_email_key"   ON "accounts"("email");
CREATE INDEX        IF NOT EXISTS "accounts_email_idx"   ON "accounts"("email");
CREATE INDEX        IF NOT EXISTS "accounts_state_idx"   ON "accounts"("state");

-- ─── audit_log ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "audit_log" (
    "id"                SERIAL PRIMARY KEY,
    "account_id"        INTEGER,
    "action"            "AuditAction" NOT NULL,
    "target_account_id" INTEGER,
    "metadata"          JSONB,
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "audit_log_created_at_idx" ON "audit_log"("created_at" DESC);
CREATE INDEX IF NOT EXISTS "audit_log_action_idx"     ON "audit_log"("action");

DO $$ BEGIN
    ALTER TABLE "audit_log"
        ADD CONSTRAINT "audit_log_account_id_fkey"
        FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "audit_log"
        ADD CONSTRAINT "audit_log_target_account_id_fkey"
        FOREIGN KEY ("target_account_id") REFERENCES "accounts"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── app_settings ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "app_settings" (
    "key"   TEXT NOT NULL PRIMARY KEY,
    "value" JSONB NOT NULL
);
