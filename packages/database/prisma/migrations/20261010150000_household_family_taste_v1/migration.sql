CREATE TABLE "households" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "households_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "households_status_check" CHECK ("status" IN ('active', 'closed'))
);

CREATE TABLE "household_members" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" VARCHAR(16) NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "household_members_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "household_members_role_check" CHECK ("role" IN ('owner', 'member'))
);

CREATE TABLE "household_invites" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "household_invites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "household_personalized_recipe_versions" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "base_recipe_version_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "algorithm_version" VARCHAR(32) NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "family_taste_snapshot_json" JSONB NOT NULL,
    "snapshot_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "household_personalized_recipe_versions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "cook_sessions"
ADD COLUMN "household_personalized_recipe_version_id" UUID;

CREATE UNIQUE INDEX "household_members_user_id_key" ON "household_members"("user_id");
CREATE UNIQUE INDEX "household_members_household_id_user_id_key" ON "household_members"("household_id", "user_id");
CREATE UNIQUE INDEX "household_members_one_owner_key" ON "household_members"("household_id") WHERE "role" = 'owner';
CREATE INDEX "household_members_household_id_joined_at_id_idx" ON "household_members"("household_id", "joined_at", "id");
CREATE INDEX "households_status_created_at_idx" ON "households"("status", "created_at");
CREATE UNIQUE INDEX "household_invites_token_hash_key" ON "household_invites"("token_hash");
CREATE INDEX "household_invites_household_id_expires_at_used_at_idx" ON "household_invites"("household_id", "expires_at", "used_at");
CREATE INDEX "household_invites_created_by_user_id_idx" ON "household_invites"("created_by_user_id");
CREATE UNIQUE INDEX "household_versions_household_recipe_version_key" ON "household_personalized_recipe_versions"("household_id", "recipe_id", "version_no");
CREATE UNIQUE INDEX "household_versions_household_recipe_hash_key" ON "household_personalized_recipe_versions"("household_id", "recipe_id", "content_hash");
CREATE INDEX "household_personalized_recipe_versions_household_recipe_created_idx" ON "household_personalized_recipe_versions"("household_id", "recipe_id", "created_at");
CREATE INDEX "household_personalized_recipe_versions_base_version_idx" ON "household_personalized_recipe_versions"("base_recipe_version_id");
CREATE INDEX "cook_sessions_household_personalized_recipe_version_id_idx" ON "cook_sessions"("household_personalized_recipe_version_id");

ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "household_invites" ADD CONSTRAINT "household_invites_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "household_invites" ADD CONSTRAINT "household_invites_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "household_personalized_recipe_versions" ADD CONSTRAINT "household_personalized_recipe_versions_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "household_personalized_recipe_versions" ADD CONSTRAINT "household_personalized_recipe_versions_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "household_personalized_recipe_versions" ADD CONSTRAINT "household_personalized_recipe_versions_base_version_id_fkey" FOREIGN KEY ("base_recipe_version_id") REFERENCES "recipe_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cook_sessions" ADD CONSTRAINT "cook_sessions_household_personalized_recipe_version_id_fkey" FOREIGN KEY ("household_personalized_recipe_version_id") REFERENCES "household_personalized_recipe_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cook_sessions" ADD CONSTRAINT "cook_sessions_personalization_source_check" CHECK (NOT ("personalized_recipe_version_id" IS NOT NULL AND "household_personalized_recipe_version_id" IS NOT NULL));
