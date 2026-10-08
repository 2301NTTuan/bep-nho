export type ApiMeta = { requestId?: string; nextCursor?: string | null; count?: number };
export type ApiEnvelope<T> = { data: T; meta?: ApiMeta };
export type ApiErrorEnvelope = { error: { code: string; message: string; requestId: string; details?: unknown } };

export const COOK_EVENT_TYPES = [
  'step_started', 'step_completed', 'timer_started', 'timer_completed',
  'ingredient_adjusted', 'note_added',
] as const;
export type CookEventType = (typeof COOK_EVENT_TYPES)[number] | 'session_started';
export const TECHNICAL_FLAGS = ['burnt', 'undercooked', 'wrong_ingredient'] as const;

export type RecipeListItem = {
  id: string; slug: string; title: string; cuisine: string;
  latestVersion: {
    versionNo: number; servings: number; prepTimeMinutes: number | null;
    cookTimeMinutes: number | null; summary: string | null; publishedAt: string | null;
  } | null;
};
export type RecipeListResponse = ApiEnvelope<RecipeListItem[]> & { meta: ApiMeta & { count: number } };

export type RecipeIngredient = {
  id: string; slug: string; name: string; category: string | null; quantity: number;
  unit: string; preparation: string | null; note: string | null; sortOrder: number;
};
export type RecipeStep = {
  stepNo: number; instruction: string; durationSeconds: number | null;
  heatLevel: string | null; tip: string | null;
};
export type RecipeDetail = {
  id: string; slug: string; title: string; cuisine: string;
  version: {
    id: string; versionNo: number; servings: number; prepTimeMinutes: number | null;
    cookTimeMinutes: number | null; summary: string | null; publishedAt: string | null;
    ingredients: RecipeIngredient[]; steps: RecipeStep[];
  };
};
export type RecipeDetailResponse = ApiEnvelope<RecipeDetail>;

export type PersonalizedIngredient = RecipeIngredient & {
  baseQuantity: number; personalized: boolean; deltaPercent: number;
};
export type PersonalizedSnapshot = {
  recipe: Pick<RecipeDetail, 'id' | 'slug' | 'title' | 'cuisine'>;
  baseVersion: { id: string; versionNo: number };
  servings: number; prepTimeMinutes: number | null; cookTimeMinutes: number | null;
  summary: string | null; ingredients: PersonalizedIngredient[]; steps: RecipeStep[];
  adjustments: Array<{
    ingredientSlug: string; ingredientName: string; baseQuantity: number;
    quantity: number; unit: string; deltaPercent: number;
  }>;
  tasteEvidence: {
    tasteProfileId: string; algorithmVersion: string; sampleCount: number; maturityScore: number;
  };
};
export type PersonalizedVersion = {
  id: string; versionNo: number; algorithmVersion: string; createdAt: string;
  reused?: boolean; snapshot: PersonalizedSnapshot;
};
export type PersonalizedResponse = ApiEnvelope<PersonalizedVersion>;

export type CurrentUserContext = {
  environment?: string;
  user: { id: string; locale: string; timezone: string };
  tasteProfile: {
    id: string; sampleCount: number; maturityScore: number;
    dimensions: Array<{ key: string; score: number; confidence: number }>;
  } | null;
};
export type CurrentUserResponse = ApiEnvelope<CurrentUserContext>;
export type AuthCredentials = { email: string; password: string };
export type LogoutResponse = ApiEnvelope<{ loggedOut: boolean }>;

export type CookSessionEvent = {
  id: string; eventType: CookEventType; clientSeq: number; clientTime: string;
  serverTime: string; payload: unknown; schemaVersion: number;
};
export type CookSession = {
  id: string; userId: string; status: string; servings: number; syncVersion: number;
  startedAt: string; completedAt: string | null;
  recipe: {
    id: string; slug: string; title: string; source: 'canonical' | 'personalized';
    versionId: string; versionNo: number; personalizedVersionId: string | null;
    personalizedVersionNo: number | null; personalizationAlgorithm: string | null;
  };
  events: CookSessionEvent[];
};
export type CookSessionResponse = ApiEnvelope<CookSession>;

export type TasteDimensionKey =
  | 'saltiness' | 'sweetness' | 'sourness' | 'spiciness' | 'umami'
  | 'fat_richness' | 'bitterness' | 'softness' | 'dryness_sauce'
  | 'garlic_onion' | 'herbal_aroma';
export type TasteFeedbackInput = {
  overallScore?: number;
  dimensions: Partial<Record<TasteDimensionKey, number>>;
  technicalFlags?: string[];
  privateNote?: string;
};
export type TasteDimensionResponse = {
  key: string; scopeType: string; scopeId: string; score: number; confidence: number;
  effectiveWeight: number; sampleCount: number; manualOverride: number | null;
};
