export type ScalingMode = 'LINEAR' | 'CONSERVATIVE' | 'FIXED';

export type AlphaIngredient = {
  slug: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  preparation: string | null;
  note: string | null;
  scalingMode: ScalingMode;
  scalingExponent: number;
  roundingIncrement: number;
  adjustments?: Array<{
    dimensionKey: string;
    sensitivity: number;
    minFactor: number;
    maxFactor: number;
  }>;
};

export type AlphaStep = {
  stepNo: number;
  instruction: string;
  durationSeconds: number | null;
  heatLevel: string | null;
  tip: string | null;
};

export type AlphaRecipe = {
  slug: string;
  title: string;
  version: number;
  servings: number;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  summary: string;
  ingredients: AlphaIngredient[];
  steps: AlphaStep[];
};
