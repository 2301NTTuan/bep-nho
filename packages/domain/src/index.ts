export type TasteDimensionKey = 'saltiness'|'sweetness'|'sourness'|'spiciness'|'umami'|'fat_richness'|'bitterness'|'softness'|'dryness_sauce'|'garlic_onion'|'herbal_aroma';
export type TasteDimensionState = { score:number; confidence:number; effectiveWeight:number; sampleCount:number; manualOverride?:number };
export const clampTaste=(v:number)=>Math.max(-1,Math.min(1,v));

export type RecipeStatus = 'draft' | 'published' | 'archived';
export type ScalingMode = 'LINEAR' | 'CONSERVATIVE' | 'FIXED';

export type ScalableIngredient = {
  quantity: number;
  unit: string;
  scalingMode?: ScalingMode | string | null;
  scalingExponent?: number | null;
  roundingIncrement?: number | null;
};

export type ScaledQuantity = {
  canonicalQuantity: number;
  scaledQuantity: number;
  quantity: number;
  personalizationFactor: number;
};

const UNIT_DEFAULT_INCREMENTS: Record<string, number> = {
  'quả': 0.5,
  'củ': 0.5,
  'trái': 0.5,
  'miếng': 0.5,
  'bó': 0.25,
  'nhánh': 0.5,
  'tép': 1,
  'muỗng canh': 0.25,
  'muỗng cà phê': 0.25,
  'g': 1,
  'ml': 1,
};

function decimalPlaces(value: number): number {
  const text = value.toString();
  return text.includes('.') ? text.length - text.indexOf('.') - 1 : 0;
}

export function roundingIncrementFor(unit: string, configured?: number | null): number {
  if (configured !== null && configured !== undefined && configured > 0) return configured;
  return UNIT_DEFAULT_INCREMENTS[unit] ?? 0.001;
}

export function roundPractical(value: number, increment: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error('Quantity must be a finite non-negative number.');
  if (!Number.isFinite(increment) || increment <= 0) throw new Error('Rounding increment must be positive.');
  const rounded = Math.round((value + Number.EPSILON) / increment) * increment;
  return Number(rounded.toFixed(Math.min(6, Math.max(3, decimalPlaces(increment)))));
}

export function scaleIngredientQuantity(
  ingredient: ScalableIngredient,
  sourceServings: number,
  targetServings: number,
  personalizationFactor = 1,
): ScaledQuantity {
  if (!Number.isFinite(sourceServings) || sourceServings <= 0) throw new Error('Source servings must be positive.');
  if (!Number.isInteger(targetServings) || targetServings < 1 || targetServings > 8) {
    throw new Error('Target servings must be an integer from 1 to 8.');
  }
  if (!Number.isFinite(personalizationFactor) || personalizationFactor <= 0) {
    throw new Error('Personalization factor must be positive.');
  }

  const ratio = targetServings / sourceServings;
  const mode = ingredient.scalingMode ?? 'LINEAR';
  const exponent = ingredient.scalingExponent ?? 0.75;
  const servingFactor = mode === 'FIXED'
    ? 1
    : mode === 'CONSERVATIVE'
      ? Math.pow(ratio, exponent)
      : ratio;
  const increment = roundingIncrementFor(ingredient.unit, ingredient.roundingIncrement);
  const scaledQuantity = roundPractical(ingredient.quantity * servingFactor, increment);
  const quantity = roundPractical(ingredient.quantity * servingFactor * personalizationFactor, increment);

  return {
    canonicalQuantity: ingredient.quantity,
    scaledQuantity,
    quantity,
    personalizationFactor,
  };
}

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

export type CookSessionStatus = 'started' | 'completed' | 'cancelled';
export type CookEventType = 'session_started' | 'step_started' | 'step_completed' | 'timer_started' | 'timer_completed' | 'ingredient_adjusted' | 'note_added';
export type RecipeAdjustment = { ingredientSlug: string; dimension: string; baseQuantity: number; quantity: number; unit: string; deltaPercent: number };

export type SequencedCookEvent = {
  clientSeq: number;
  eventType: string;
  clientTime: string;
  serverTime?: string;
  payload: unknown;
};

export function nextClientSequence(serverEvents: SequencedCookEvent[], localEvents: SequencedCookEvent[]): number {
  return Math.max(0, ...serverEvents.map((event) => event.clientSeq), ...localEvents.map((event) => event.clientSeq)) + 1;
}

export function orderCookEvents<T extends SequencedCookEvent>(events: T[]): T[] {
  return [...events].sort((left, right) => left.clientSeq - right.clientSeq);
}

export function completedStepNumbers(events: SequencedCookEvent[]): Set<number> {
  return new Set(events
    .filter((event) => event.eventType === 'step_completed')
    .map((event) => (event.payload as { stepNo?: unknown })?.stepNo)
    .filter((stepNo): stepNo is number => Number.isInteger(stepNo)));
}

export function currentStepIndex(stepNumbers: number[], events: SequencedCookEvent[]): number {
  const completed = completedStepNumbers(events);
  const firstIncomplete = stepNumbers.findIndex((stepNo) => !completed.has(stepNo));
  return firstIncomplete < 0 ? Math.max(0, stepNumbers.length - 1) : firstIncomplete;
}

export function remainingTimerSeconds(
  stepNo: number,
  events: SequencedCookEvent[],
  nowMs: number,
): number | null {
  const ordered = orderCookEvents(events).filter((event) => {
    const payload = event.payload as { stepNo?: unknown };
    return payload?.stepNo === stepNo && (event.eventType === 'timer_started' || event.eventType === 'timer_completed');
  });
  const latestStart = [...ordered].reverse().find((event) => event.eventType === 'timer_started');
  if (!latestStart) return null;
  const completedAfterStart = ordered.some((event) => event.eventType === 'timer_completed' && event.clientSeq > latestStart.clientSeq);
  if (completedAfterStart) return 0;
  const duration = (latestStart.payload as { durationSeconds?: unknown }).durationSeconds;
  if (typeof duration !== 'number' || duration <= 0) return null;
  const startedAt = Date.parse(latestStart.serverTime ?? latestStart.clientTime);
  return Math.max(0, Math.ceil(duration - (nowMs - startedAt) / 1000));
}

export type QueuedCookEvent = SequencedCookEvent & {
  id: string;
  userId: string;
  cookSessionId: string;
  createdAt: string;
};

export type QueueSendResult = 'acknowledged' | 'duplicate' | 'retry' | 'auth' | 'rejected';

export async function reconcileCookQueue(
  events: QueuedCookEvent[],
  currentUserId: string,
  send: (event: QueuedCookEvent) => Promise<QueueSendResult>,
  acknowledge: (event: QueuedCookEvent) => Promise<void>,
): Promise<{ acknowledged: number; retained: number; stopped: QueueSendResult | null }> {
  const owned = orderCookEvents(events.filter((event) => event.userId === currentUserId));
  let acknowledged = 0;
  let stopped: QueueSendResult | null = null;

  for (const event of owned) {
    const result = await send(event);
    if (result === 'acknowledged' || result === 'duplicate') {
      await acknowledge(event);
      acknowledged += 1;
      continue;
    }
    stopped = result;
    break;
  }

  return { acknowledged, retained: owned.length - acknowledged, stopped };
}
