export function renumberIngredients(items) {
  return items.map((item, index) => ({ ...item, sortOrder: index + 1 }));
}

export function renumberSteps(items) {
  return items.map((item, index) => ({ ...item, stepNo: index + 1 }));
}

export function newIngredient() {
  return {
    slug: '', canonicalName: '', category: null, createIfMissing: true,
    quantity: 1, unit: 'g', preparation: null, note: null, sortOrder: 1,
    scalingMode: 'LINEAR', scalingExponent: 1, roundingIncrement: 1,
  };
}

export function newStep() {
  return { stepNo: 1, instruction: '', durationSeconds: null, heatLevel: null, tip: null };
}
