-- Additive first-party authentication storage. Existing users remain unchanged
-- and do not receive credentials automatically.

CREATE TABLE "user_credentials" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "normalized_email" VARCHAR(320) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_credentials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_credentials_user_id_key"
ON "user_credentials"("user_id");

CREATE UNIQUE INDEX "user_credentials_normalized_email_key"
ON "user_credentials"("normalized_email");

CREATE UNIQUE INDEX "auth_sessions_token_hash_key"
ON "auth_sessions"("token_hash");

CREATE INDEX "auth_sessions_user_id_expires_at_idx"
ON "auth_sessions"("user_id", "expires_at");

CREATE INDEX "auth_sessions_expires_at_revoked_at_idx"
ON "auth_sessions"("expires_at", "revoked_at");

ALTER TABLE "user_credentials"
ADD CONSTRAINT "user_credentials_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "auth_sessions"
ADD CONSTRAINT "auth_sessions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
