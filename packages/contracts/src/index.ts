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
