ALTER TABLE "users"
ADD COLUMN "role" VARCHAR(16) NOT NULL DEFAULT 'user';

ALTER TABLE "users"
ADD CONSTRAINT "users_role_check" CHECK ("role" IN ('user', 'admin'));

CREATE TABLE "media_assets" (
  "id" UUID NOT NULL,
  "object_key" VARCHAR(255) NOT NULL,
  "sha256" CHAR(64) NOT NULL,
  "mime_type" VARCHAR(64) NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "status" VARCHAR(24) NOT NULL DEFAULT 'active',
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "media_assets_status_check" CHECK ("status" IN ('active', 'deleted')),
  CONSTRAINT "media_assets_byte_size_check" CHECK ("byte_size" > 0)
);

CREATE UNIQUE INDEX "media_assets_object_key_key" ON "media_assets"("object_key");
CREATE INDEX "media_assets_status_created_at_idx" ON "media_assets"("status", "created_at");
CREATE INDEX "media_assets_created_by_user_id_idx" ON "media_assets"("created_by_user_id");
CREATE INDEX "media_assets_sha256_idx" ON "media_assets"("sha256");

ALTER TABLE "media_assets"
ADD CONSTRAINT "media_assets_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "recipe_versions"
ADD COLUMN "hero_media_asset_id" UUID,
ADD COLUMN "hero_media_alt" VARCHAR(320),
ADD COLUMN "published_by_user_id" UUID;

CREATE INDEX "recipe_versions_hero_media_asset_id_idx" ON "recipe_versions"("hero_media_asset_id");
CREATE INDEX "recipe_versions_published_by_user_id_idx" ON "recipe_versions"("published_by_user_id");

ALTER TABLE "recipe_versions"
ADD CONSTRAINT "recipe_versions_hero_media_asset_id_fkey"
FOREIGN KEY ("hero_media_asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recipe_versions"
ADD CONSTRAINT "recipe_versions_published_by_user_id_fkey"
FOREIGN KEY ("published_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "recipe_drafts" (
  "id" UUID NOT NULL,
  "recipe_id" UUID NOT NULL,
  "base_recipe_version_id" UUID,
  "status" VARCHAR(24) NOT NULL DEFAULT 'draft',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "content_json" JSONB NOT NULL,
  "created_by_user_id" UUID,
  "updated_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "recipe_drafts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "recipe_drafts_status_check" CHECK ("status" IN ('draft', 'published', 'abandoned')),
  CONSTRAINT "recipe_drafts_revision_check" CHECK ("revision" > 0)
);

CREATE INDEX "recipe_drafts_recipe_id_status_updated_at_idx" ON "recipe_drafts"("recipe_id", "status", "updated_at");
CREATE INDEX "recipe_drafts_base_recipe_version_id_idx" ON "recipe_drafts"("base_recipe_version_id");
CREATE INDEX "recipe_drafts_created_by_user_id_idx" ON "recipe_drafts"("created_by_user_id");
CREATE INDEX "recipe_drafts_updated_by_user_id_idx" ON "recipe_drafts"("updated_by_user_id");

ALTER TABLE "recipe_drafts"
ADD CONSTRAINT "recipe_drafts_recipe_id_fkey"
FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recipe_drafts"
ADD CONSTRAINT "recipe_drafts_base_recipe_version_id_fkey"
FOREIGN KEY ("base_recipe_version_id") REFERENCES "recipe_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "recipe_drafts"
ADD CONSTRAINT "recipe_drafts_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "recipe_drafts"
ADD CONSTRAINT "recipe_drafts_updated_by_user_id_fkey"
FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
