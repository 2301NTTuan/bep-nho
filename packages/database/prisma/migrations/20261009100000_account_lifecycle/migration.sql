-- Add nullable verification state without changing existing credentials.
ALTER TABLE "user_credentials"
ADD COLUMN "email_verified_at" TIMESTAMPTZ(6);

-- Raw lifecycle tokens are never persisted; only SHA-256 hashes are stored.
CREATE TABLE "email_verification_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_verification_tokens_token_hash_key"
ON "email_verification_tokens"("token_hash");
CREATE INDEX "email_verification_tokens_user_id_expires_at_idx"
ON "email_verification_tokens"("user_id", "expires_at");
CREATE INDEX "email_verification_tokens_expires_at_used_at_idx"
ON "email_verification_tokens"("expires_at", "used_at");

CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key"
ON "password_reset_tokens"("token_hash");
CREATE INDEX "password_reset_tokens_user_id_expires_at_idx"
ON "password_reset_tokens"("user_id", "expires_at");
CREATE INDEX "password_reset_tokens_expires_at_used_at_idx"
ON "password_reset_tokens"("expires_at", "used_at");

ALTER TABLE "email_verification_tokens"
ADD CONSTRAINT "email_verification_tokens_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "password_reset_tokens"
ADD CONSTRAINT "password_reset_tokens_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Account deletion removes only user-owned history. Canonical recipe data keeps
-- its existing constraints and is intentionally not part of this cascade graph.
ALTER TABLE "cook_sessions" DROP CONSTRAINT "cook_sessions_user_id_fkey";
ALTER TABLE "cook_sessions" ADD CONSTRAINT "cook_sessions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cook_events" DROP CONSTRAINT "cook_events_cook_session_id_fkey";
ALTER TABLE "cook_events" ADD CONSTRAINT "cook_events_cook_session_id_fkey"
FOREIGN KEY ("cook_session_id") REFERENCES "cook_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cook_feedback" DROP CONSTRAINT "cook_feedback_cook_session_id_fkey";
ALTER TABLE "cook_feedback" ADD CONSTRAINT "cook_feedback_cook_session_id_fkey"
FOREIGN KEY ("cook_session_id") REFERENCES "cook_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "taste_profiles" DROP CONSTRAINT "taste_profiles_user_id_fkey";
ALTER TABLE "taste_profiles" ADD CONSTRAINT "taste_profiles_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "taste_dimensions" DROP CONSTRAINT "taste_dimensions_taste_profile_id_fkey";
ALTER TABLE "taste_dimensions" ADD CONSTRAINT "taste_dimensions_taste_profile_id_fkey"
FOREIGN KEY ("taste_profile_id") REFERENCES "taste_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "taste_signals" DROP CONSTRAINT "taste_signals_taste_profile_id_fkey";
ALTER TABLE "taste_signals" ADD CONSTRAINT "taste_signals_taste_profile_id_fkey"
FOREIGN KEY ("taste_profile_id") REFERENCES "taste_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "taste_signals" DROP CONSTRAINT "taste_signals_cook_feedback_id_fkey";
ALTER TABLE "taste_signals" ADD CONSTRAINT "taste_signals_cook_feedback_id_fkey"
FOREIGN KEY ("cook_feedback_id") REFERENCES "cook_feedback"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "taste_control_events" DROP CONSTRAINT "taste_control_events_taste_profile_id_fkey";
ALTER TABLE "taste_control_events" ADD CONSTRAINT "taste_control_events_taste_profile_id_fkey"
FOREIGN KEY ("taste_profile_id") REFERENCES "taste_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "personalized_recipe_versions" DROP CONSTRAINT "personalized_recipe_versions_taste_profile_id_fkey";
ALTER TABLE "personalized_recipe_versions" ADD CONSTRAINT "personalized_recipe_versions_taste_profile_id_fkey"
FOREIGN KEY ("taste_profile_id") REFERENCES "taste_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "personalized_recipe_versions" DROP CONSTRAINT "personalized_recipe_versions_parent_version_id_fkey";
ALTER TABLE "personalized_recipe_versions" ADD CONSTRAINT "personalized_recipe_versions_parent_version_id_fkey"
FOREIGN KEY ("parent_personalized_recipe_version_id") REFERENCES "personalized_recipe_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cook_sessions" DROP CONSTRAINT "cook_sessions_personalized_recipe_version_id_fkey";
ALTER TABLE "cook_sessions" ADD CONSTRAINT "cook_sessions_personalized_recipe_version_id_fkey"
FOREIGN KEY ("personalized_recipe_version_id") REFERENCES "personalized_recipe_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "personalized_adjustment_decisions" DROP CONSTRAINT "personalized_adjustment_decisions_source_version_id_fkey";
ALTER TABLE "personalized_adjustment_decisions" ADD CONSTRAINT "personalized_adjustment_decisions_source_version_id_fkey"
FOREIGN KEY ("source_personalized_recipe_version_id") REFERENCES "personalized_recipe_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "personalized_adjustment_decisions" DROP CONSTRAINT "personalized_adjustment_decisions_result_version_id_fkey";
ALTER TABLE "personalized_adjustment_decisions" ADD CONSTRAINT "personalized_adjustment_decisions_result_version_id_fkey"
FOREIGN KEY ("result_personalized_recipe_version_id") REFERENCES "personalized_recipe_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_recipe_preferences" DROP CONSTRAINT "user_recipe_preferences_best_version_id_fkey";
ALTER TABLE "user_recipe_preferences" ADD CONSTRAINT "user_recipe_preferences_best_version_id_fkey"
FOREIGN KEY ("best_personalized_recipe_version_id") REFERENCES "personalized_recipe_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
