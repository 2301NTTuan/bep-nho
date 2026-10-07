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
      string | null;
  } | null;
};

export type RecipeListResponse = {
  data:
    RecipeListItem[];

  meta: {
    count: number;
  };
};

export type RecipeIngredient = {
  id: string;
  slug: string;
  name: string;
  category:
    string | null;

  quantity: number;
  unit: string;

  preparation:
    string | null;

  note:
    string | null;

  sortOrder: number;
};

export type RecipeStep = {
  stepNo: number;

  instruction:
    string;

  durationSeconds:
    number | null;

  heatLevel:
    string | null;

  tip:
    string | null;
};

export type RecipeDetailResponse = {
  data: {
    id: string;
    slug: string;
    title: string;
    cuisine: string;

    version: {
      id: string;
      versionNo: number;
      servings: number;

      prepTimeMinutes:
        number | null;

      cookTimeMinutes:
        number | null;

      summary:
        string | null;

      publishedAt:
        string | null;

      ingredients:
        RecipeIngredient[];

      steps:
        RecipeStep[];
    };
  };
};

export type PersonalizedIngredient = {
  id: string;
  slug: string;
  name: string;

  category:
    string | null;

  baseQuantity: number;
  quantity: number;

  unit: string;

  preparation:
    string | null;

  note:
    string | null;

  sortOrder: number;

  personalized:
    boolean;

  deltaPercent:
    number;
};

export type PersonalizedSnapshot = {
  recipe: {
    id: string;
    slug: string;
    title: string;
    cuisine: string;
  };

  baseVersion: {
    id: string;
    versionNo: number;
  };

  servings: number;

  prepTimeMinutes:
    number | null;

  cookTimeMinutes:
    number | null;

  summary:
    string | null;

  ingredients:
    PersonalizedIngredient[];

  steps:
    RecipeStep[];

  adjustments:
    Array<{
      ingredientSlug:
        string;

      ingredientName:
        string;

      baseQuantity:
        number;

      quantity:
        number;

      unit:
        string;

      deltaPercent:
        number;
    }>;

  tasteEvidence: {
    tasteProfileId:
      string;

    algorithmVersion:
      string;

    sampleCount:
      number;

    maturityScore:
      number;
  };
};

export type PersonalizedVersion = {
  id: string;
  versionNo: number;

  algorithmVersion:
    string;

  createdAt:
    string;

  reused?:
    boolean;

  snapshot:
    PersonalizedSnapshot;
};

export type PersonalizedResponse = {
  data:
    PersonalizedVersion;
};

export type DevBootstrapResponse = {
  data: {
    environment:
      string;

    user: {
      id:
        string;

      locale:
        string;

      timezone:
        string;
    };

    tasteProfile: {
      id:
        string;

      sampleCount:
        number;

      maturityScore:
        number;

      dimensions:
        Array<{
          key:
            string;

          score:
            number;

          confidence:
            number;
        }>;
    } | null;
  };
};

export type CookSessionResponse = {
  data: {
    id: string;
    userId: string;
    status: string;
    servings: number;
    syncVersion: number;

    startedAt:
      string;

    completedAt:
      string | null;

    recipe: {
      id: string;
      slug: string;
      title: string;

      source:
        | 'canonical'
        | 'personalized';

      versionId:
        string;

      versionNo:
        number;

      personalizedVersionId:
        string | null;

      personalizedVersionNo:
        number | null;

      personalizationAlgorithm:
        string | null;
    };
  };
};
