export type TasteDimensionKey = 'saltiness'|'sweetness'|'sourness'|'spiciness'|'umami'|'fat_richness'|'bitterness'|'softness'|'dryness_sauce'|'garlic_onion'|'herbal_aroma';
export type TasteDimensionState = { score:number; confidence:number; effectiveWeight:number; sampleCount:number; manualOverride?:number };
export const clampTaste=(v:number)=>Math.max(-1,Math.min(1,v));

export type RecipeStatus =
  | 'draft'
  | 'published'
  | 'archived';

export type RecipeIngredientValue = {
  ingredientSlug: string;
  quantity: number;
  unit: string;
  preparation?: string;
  note?: string;
};

export type RecipeStepValue = {
  stepNo: number;
  instruction: string;
  durationSeconds?: number;
  heatLevel?: string;
  tip?: string;
};
