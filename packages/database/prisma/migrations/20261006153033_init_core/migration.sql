-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "auth_subject" VARCHAR(191) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'active',
    "locale" VARCHAR(16) NOT NULL DEFAULT 'vi-VN',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipes" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(180) NOT NULL,
    "canonical_title" VARCHAR(180) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_versions" (
    "id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "servings" DECIMAL(6,2) NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "published_at" TIMESTAMPTZ(6),

    CONSTRAINT "recipe_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cook_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "recipe_version_id" UUID NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'started',
    "servings" DECIMAL(6,2) NOT NULL,
    "sync_version" INTEGER NOT NULL DEFAULT 1,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "cook_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cook_events" (
    "id" UUID NOT NULL,
    "cook_session_id" UUID NOT NULL,
    "event_type" VARCHAR(64) NOT NULL,
    "client_seq" INTEGER NOT NULL,
    "client_time" TIMESTAMPTZ(6) NOT NULL,
    "server_time" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "cook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cook_feedback" (
    "id" UUID NOT NULL,
    "cook_session_id" UUID NOT NULL,
    "overall_score" DECIMAL(3,1),
    "dimension_json" JSONB NOT NULL,
    "technical_flags" JSONB NOT NULL,
    "private_note" TEXT,
    "revision_no" INTEGER NOT NULL DEFAULT 1,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cook_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taste_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "algorithm_version" VARCHAR(32) NOT NULL,
    "maturity_score" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "sample_count" INTEGER NOT NULL DEFAULT 0,
    "computed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "taste_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taste_dimensions" (
    "taste_profile_id" UUID NOT NULL,
    "dimension_key" VARCHAR(64) NOT NULL,
    "scope_type" VARCHAR(24) NOT NULL DEFAULT 'global',
    "scope_id" VARCHAR(191) NOT NULL DEFAULT '',
    "score" DECIMAL(6,5) NOT NULL DEFAULT 0,
    "confidence" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "effective_weight" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "sample_count" INTEGER NOT NULL DEFAULT 0,
    "manual_override" DECIMAL(6,5),

    CONSTRAINT "taste_dimensions_pkey" PRIMARY KEY ("taste_profile_id","dimension_key","scope_type","scope_id")
);

-- CreateTable
CREATE TABLE "taste_signals" (
    "id" UUID NOT NULL,
    "taste_profile_id" UUID NOT NULL,
    "dimension_key" VARCHAR(64) NOT NULL,
    "signal_value" DECIMAL(6,5) NOT NULL,
    "source_type" VARCHAR(32) NOT NULL,
    "base_weight" DECIMAL(7,4) NOT NULL,
    "quality_factor" DECIMAL(6,5) NOT NULL,
    "excluded_reason" VARCHAR(120),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "taste_signals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_subject_key" ON "users"("auth_subject");

-- CreateIndex
CREATE UNIQUE INDEX "recipes_slug_key" ON "recipes"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_versions_recipe_id_version_no_key" ON "recipe_versions"("recipe_id", "version_no");

-- CreateIndex
CREATE INDEX "cook_sessions_user_id_started_at_idx" ON "cook_sessions"("user_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "cook_events_cook_session_id_client_seq_key" ON "cook_events"("cook_session_id", "client_seq");

-- CreateIndex
CREATE UNIQUE INDEX "cook_feedback_cook_session_id_key" ON "cook_feedback"("cook_session_id");

-- CreateIndex
CREATE INDEX "taste_profiles_user_id_idx" ON "taste_profiles"("user_id");

-- CreateIndex
CREATE INDEX "taste_signals_taste_profile_id_dimension_key_created_at_idx" ON "taste_signals"("taste_profile_id", "dimension_key", "created_at");

-- AddForeignKey
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cook_sessions" ADD CONSTRAINT "cook_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cook_sessions" ADD CONSTRAINT "cook_sessions_recipe_version_id_fkey" FOREIGN KEY ("recipe_version_id") REFERENCES "recipe_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cook_events" ADD CONSTRAINT "cook_events_cook_session_id_fkey" FOREIGN KEY ("cook_session_id") REFERENCES "cook_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cook_feedback" ADD CONSTRAINT "cook_feedback_cook_session_id_fkey" FOREIGN KEY ("cook_session_id") REFERENCES "cook_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taste_profiles" ADD CONSTRAINT "taste_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taste_dimensions" ADD CONSTRAINT "taste_dimensions_taste_profile_id_fkey" FOREIGN KEY ("taste_profile_id") REFERENCES "taste_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taste_signals" ADD CONSTRAINT "taste_signals_taste_profile_id_fkey" FOREIGN KEY ("taste_profile_id") REFERENCES "taste_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
