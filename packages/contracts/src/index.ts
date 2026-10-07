export type ApiError = { code: string; message: string; request_id: string; details?: unknown };
export type ApiEnvelope<T> = { data: T; meta?: { request_id?: string; next_cursor?: string | null } };

export type RecipeListItem = {
  id: string;
  slug: string;
  title: string;
  cuisine: string;

  latestVersion: {
    versionNo: number;
    servings: number;

    prepTimeMinutes:
      number | null;

    cookTimeMinutes:
      number | null;

    summary:
      string | null;

    publishedAt:
      string | Date | null;
  } | null;
};

export type CookSessionEventResponse = {
  id: string;
  eventType: string;
  clientSeq: number;
  clientTime: string | Date;
  serverTime: string | Date;
  payload: unknown;
  schemaVersion: number;
};

export type CookSessionResponse = {
  id: string;
  userId: string;
  status: string;
  servings: number;
  syncVersion: number;
  startedAt: string | Date;
  completedAt: string | Date | null;

  recipe: {
    id: string;
    slug: string;
    title: string;
    versionId: string;
    versionNo: number;
  };

  events:
    CookSessionEventResponse[];
};

export type TasteFeedbackInput = {
  overallScore?: number;

  dimensions: Partial<
    Record<
      | 'saltiness'
      | 'sweetness'
      | 'sourness'
      | 'spiciness'
      | 'umami'
      | 'fat_richness'
      | 'bitterness'
      | 'softness'
      | 'dryness_sauce'
      | 'garlic_onion'
      | 'herbal_aroma',
      number
    >
  >;

  technicalFlags?: string[];
  privateNote?: string;
};

export type TasteDimensionResponse = {
  key: string;
  scopeType: string;
  scopeId: string;
  score: number;
  confidence: number;
  effectiveWeight: number;
  sampleCount: number;
  manualOverride: number | null;
};
