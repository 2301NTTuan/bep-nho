export type TasteDimensionKey = 'saltiness'|'sweetness'|'sourness'|'spiciness'|'umami'|'fat_richness'|'bitterness'|'softness'|'dryness_sauce'|'garlic_onion'|'herbal_aroma';
export type TasteDimensionState = { score:number; confidence:number; effectiveWeight:number; sampleCount:number; manualOverride?:number };
export const clampTaste=(v:number)=>Math.max(-1,Math.min(1,v));
