export type ApiMeta = { requestId?: string; nextCursor?: string | null; count?: number };
export type ApiEnvelope<T> = { data: T; meta?: ApiMeta };
export type ApiErrorEnvelope = { error: { code: string; message: string; requestId: string; details?: unknown } };

export const COOK_EVENT_TYPES = [
  'step_started', 'step_completed', 'timer_started', 'timer_completed',
  'ingredient_adjusted', 'note_added',
] as const;
export type CookEventType = (typeof COOK_EVENT_TYPES)[number] | 'session_started';
export const TECHNICAL_FLAGS = ['burnt', 'undercooked', 'wrong_ingredient'] as const;
export const SCALING_MODES = ['LINEAR', 'CONSERVATIVE', 'FIXED'] as const;
export type ScalingMode = (typeof SCALING_MODES)[number];

export type RecipeListItem = {
  id: string; slug: string; title: string; cuisine: string;
  latestVersion: {
    id: string; versionNo: number; servings: number; prepTimeMinutes: number | null;
    cookTimeMinutes: number | null; summary: string | null; publishedAt: string | null;
    heroMedia: RecipeHeroMedia | null;
  } | null;
};
export type RecipeListResponse = ApiEnvelope<RecipeListItem[]> & { meta: ApiMeta & { count: number } };

export type RecipeIngredient = {
  id: string; slug: string; name: string; category: string | null; quantity: number;
  unit: string; preparation: string | null; note: string | null; sortOrder: number;
  scalingMode: ScalingMode; scalingExponent: number; roundingIncrement: number | null;
};
export type RecipeStep = {
  stepNo: number; instruction: string; durationSeconds: number | null;
  heatLevel: string | null; tip: string | null;
};
export type RecipeHeroMedia = {
  id: string; url: string; alt: string | null; width: number | null; height: number | null;
};
export type RecipeDetail = {
  id: string; slug: string; title: string; cuisine: string;
  version: {
    id: string; versionNo: number; servings: number; prepTimeMinutes: number | null;
    cookTimeMinutes: number | null; summary: string | null; publishedAt: string | null;
    heroMedia: RecipeHeroMedia | null;
    ingredients: RecipeIngredient[]; steps: RecipeStep[];
  };
};
export type RecipeDetailResponse = ApiEnvelope<RecipeDetail>;

export type PersonalizedIngredient = RecipeIngredient & {
  baseQuantity: number; personalized: boolean; deltaPercent: number;
  personalizationFactor: number;
  appliedRules?: Array<Record<string, unknown>>;
};
export type PersonalizedSnapshot = {
  recipe: Pick<RecipeDetail, 'id' | 'slug' | 'title' | 'cuisine'>;
  baseVersion: { id: string; versionNo: number };
  servings: number; prepTimeMinutes: number | null; cookTimeMinutes: number | null;
  summary: string | null; ingredients: PersonalizedIngredient[]; steps: RecipeStep[];
  adjustments: Array<{
    ingredientSlug: string; ingredientName: string; baseQuantity: number;
    quantity: number; unit: string; deltaPercent: number;
    reviewStatus?: 'pending' | 'accepted' | 'edited';
    originType?: 'taste_engine' | 'user_edit';
  }>;
  tasteEvidence: {
    tasteProfileId: string; algorithmVersion: string; sampleCount: number; maturityScore: number;
  };
};
export type PersonalizedVersion = {
  id: string; versionNo: number; algorithmVersion: string; createdAt: string;
  originType: 'taste_engine' | 'user_edit'; parentPersonalizedRecipeVersionId: string | null;
  reused?: boolean; snapshot: PersonalizedSnapshot;
};
export type PersonalizedResponse = ApiEnvelope<PersonalizedVersion>;
export type PersonalizationOverview = {
  latestEngine: PersonalizedVersion | null;
  latestAny: PersonalizedVersion | null;
  bestVersion: PersonalizedVersion | null;
};
export type PersonalizationOverviewResponse = ApiEnvelope<PersonalizationOverview>;
export type MyBestVersionPreference = {
  recipeId: string;
  bestPersonalizedRecipeVersionId: string | null;
  bestVersion: PersonalizedVersion | null;
};
export const PERSONALIZED_ADJUSTMENT_ACTIONS = ['ACCEPT', 'REJECT', 'EDIT'] as const;
export type PersonalizedAdjustmentAction = (typeof PERSONALIZED_ADJUSTMENT_ACTIONS)[number];
export type PersonalizedAdjustmentDecision = {
  id: string; action: PersonalizedAdjustmentAction; ingredientId: string;
  ingredientSlug: string; sourcePersonalizedRecipeVersionId: string;
  resultPersonalizedRecipeVersionId: string | null; editedQuantity: number | null;
  createdAt: string; resultVersion: PersonalizedVersion | null;
};
export type PersonalizedAdjustmentDecisionResponse = ApiEnvelope<PersonalizedAdjustmentDecision>;
export type PersonalizedAdjustmentDecisionsResponse = ApiEnvelope<PersonalizedAdjustmentDecision[]>;

export type CurrentUserContext = {
  environment?: string;
  user: {
    id: string;
    locale: string;
    timezone: string;
    role: 'user' | 'admin';
    email: string | null;
    emailVerified: boolean;
    emailVerifiedAt: string | null;
  };
  tasteProfile: {
    id: string; sampleCount: number; maturityScore: number;
    dimensions: Array<{ key: string; score: number; confidence: number }>;
  } | null;
};
export type CurrentUserResponse = ApiEnvelope<CurrentUserContext>;
export type AuthCredentials = { email: string; password: string };
export type LogoutResponse = ApiEnvelope<{ loggedOut: boolean }>;
export type LifecycleRequestResponse = ApiEnvelope<{ accepted: true }>;
export type EmailVerificationResponse = ApiEnvelope<{
  verified: true;
  emailVerifiedAt: string;
}>;
export type PasswordResetResponse = ApiEnvelope<{
  passwordReset: true;
  loginRequired: true;
}>;
export type ChangePasswordResponse = ApiEnvelope<{
  passwordChanged: true;
  revokedOtherSessions: number;
}>;
export type AccountSession = {
  id: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  current: boolean;
};
export type AccountSessionsResponse = ApiEnvelope<AccountSession[]>;
export type RevokeSessionResponse = ApiEnvelope<{
  revoked: true;
  currentSessionRevoked: boolean;
}>;
export type RevokeOtherSessionsResponse = ApiEnvelope<{ revoked: number }>;
export type DeleteAccountResponse = ApiEnvelope<{ deleted: true }>;

export type CookSessionEvent = {
  id: string; eventType: CookEventType; clientSeq: number; clientTime: string;
  serverTime: string; payload: unknown; schemaVersion: number;
};
export type CookSnapshotIngredient = RecipeIngredient & {
  canonicalQuantity: number;
  scaledQuantity: number;
  personalizationFactor: number;
  personalized: boolean;
};
export type CookSnapshot = {
  schemaVersion: 1;
  recipe: { id: string; slug: string; title: string; cuisine: string };
  canonicalVersion: { id: string; versionNo: number; servings: number };
  personalizedVersion: {
    id: string; versionNo: number; algorithmVersion: string;
  } | null;
  householdPersonalizedVersion: {
    id: string; versionNo: number; algorithmVersion: string; householdId: string;
  } | null;
  servings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  summary: string | null;
  ingredients: CookSnapshotIngredient[];
  steps: RecipeStep[];
  adjustments: Array<Record<string, unknown>>;
  scaling: { sourceServings: number; targetServings: number; order: 'serving_then_taste_then_round' };
  legacyFallback?: boolean;
};
export type CookSession = {
  id: string; userId: string; status: string; servings: number; syncVersion: number;
  startedAt: string; completedAt: string | null;
  recipe: {
    id: string; slug: string; title: string; source: 'canonical' | 'personalized' | 'household';
    versionId: string; versionNo: number; personalizedVersionId: string | null;
    personalizedVersionNo: number | null; personalizationAlgorithm: string | null;
    householdPersonalizedVersionId: string | null;
    householdPersonalizedVersionNo: number | null;
  };
  snapshot: CookSnapshot;
  events: CookSessionEvent[];
};
export type CookSessionResponse = ApiEnvelope<CookSession>;
export type ActiveCookSessionResponse = CookSessionResponse;

export const TASTE_DIMENSION_KEYS = [
  'saltiness', 'sweetness', 'sourness', 'spiciness', 'umami',
  'fat_richness', 'bitterness', 'softness', 'dryness_sauce',
  'garlic_onion', 'herbal_aroma',
] as const;
export type TasteDimensionKey = (typeof TASTE_DIMENSION_KEYS)[number];
export type TasteFeedbackInput = {
  overallScore?: number;
  dimensions: Partial<Record<TasteDimensionKey, number>>;
  technicalFlags?: string[];
  privateNote?: string;
};
export type TasteDimensionResponse = {
  key: string; scopeType: string; scopeId: string; score: number; confidence: number;
  effectiveWeight: number; sampleCount: number; manualOverride: number | null;
  effectiveScore: number; effectiveConfidence: number;
  explanation: string;
};
export type TasteProfile = {
  id: string; userId: string; algorithmVersion: string; maturityScore: number;
  sampleCount: number; computedAt: string; dimensions: TasteDimensionResponse[];
};
export type TasteProfileResponse = ApiEnvelope<TasteProfile>;
export const TASTE_CONTROL_ACTIONS = [
  'manual_override_set', 'manual_override_cleared', 'learning_reset',
] as const;
export type TasteControlAction = (typeof TASTE_CONTROL_ACTIONS)[number];
export type TasteHistoryEvent = {
  id: string; kind: 'signal' | 'control'; dimensionKey: string; createdAt: string;
  signal?: {
    value: number; sourceType: string; baseWeight: number; qualityFactor: number;
    excludedReason: string | null; cookFeedbackId: string | null;
    cookSessionId: string | null; recipeSlug: string | null; recipeTitle: string | null;
    canonicalRecipeVersionId: string | null; canonicalRecipeVersionNo: number | null;
    personalizedRecipeVersionId: string | null; personalizedRecipeVersionNo: number | null;
    personalizationAlgorithm: string | null; overallScore: number | null;
    dimensions: unknown; technicalFlags: unknown; privateNote: string | null;
  };
  control?: { action: TasteControlAction; value: number | null };
};
export type TasteHistoryResponse = ApiEnvelope<TasteHistoryEvent[]> & {
  meta: ApiMeta & { count: number; nextCursor: string | null };
};
