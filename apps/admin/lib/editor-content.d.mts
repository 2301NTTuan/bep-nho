export function renumberIngredients<T extends object>(items: T[]): Array<T & { sortOrder: number }>;
export function renumberSteps<T extends object>(items: T[]): Array<T & { stepNo: number }>;
export function newIngredient(): {
  slug: string; canonicalName: string; category: null; createIfMissing: boolean;
  quantity: number; unit: string; preparation: null; note: null; sortOrder: number;
  scalingMode: string; scalingExponent: number; roundingIncrement: number;
};
export function newStep(): {
  stepNo: number; instruction: string; durationSeconds: null; heatLevel: null; tip: null;
};
