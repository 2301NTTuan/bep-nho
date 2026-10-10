export type TasteDimensionKey = 'saltiness'|'sweetness'|'sourness'|'spiciness'|'umami'|'fat_richness'|'bitterness'|'softness'|'dryness_sauce'|'garlic_onion'|'herbal_aroma';
export const TASTE_DIMENSION_KEYS: TasteDimensionKey[] = ['saltiness','sweetness','sourness','spiciness','umami','fat_richness','bitterness','softness','dryness_sauce','garlic_onion','herbal_aroma'];
export type TasteDimensionState = { score:number; confidence:number; effectiveWeight:number; sampleCount:number; manualOverride?:number | null };
export const clampTaste=(v:number)=>Math.max(-1,Math.min(1,v));

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'other'] as const;
export type MealType = typeof MEAL_TYPES[number];

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function parseIsoCalendarDate(value: string): Date {
  if (!ISO_DATE_PATTERN.test(value)) throw new Error('Date must use YYYY-MM-DD format.');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) throw new Error('Date is not a valid calendar date.');
  return date;
}

export function validateMondayWeekStart(value: string): Date {
  const date = parseIsoCalendarDate(value);
  if (date.getUTCDay() !== 1) throw new Error('weekStart must be a Monday.');
  return date;
}

export function isDateInMealPlanWeek(weekStart: string, plannedDate: string): boolean {
  const start = validateMondayWeekStart(weekStart).getTime();
  const planned = parseIsoCalendarDate(plannedDate).getTime();
  return planned >= start && planned <= start + (6 * DAY_MS);
}

export function isMealType(value: string): value is MealType {
  return (MEAL_TYPES as readonly string[]).includes(value);
}

export function formatIsoCalendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export const FAMILY_MEAL_PLAN_ALGORITHM_VERSION = 'family-meal-plan-v1' as const;
export const SUGGESTION_MEAL_TYPES = ['lunch', 'dinner'] as const;
export type SuggestionMealType = typeof SUGGESTION_MEAL_TYPES[number];
export type FamilyMealPlanSlot = { plannedDate: string; mealType: SuggestionMealType };
export type FamilyMealPlanCandidate = { recipeId: string; recentUseCount: number };
export type FamilyMealPlanExistingEntry = { plannedDate: string; recipeId: string };

const suggestionMealTypeOrder: Record<SuggestionMealType, number> = { lunch: 0, dinner: 1 };

export function canonicalizeFamilyMealPlanSlots(slots: FamilyMealPlanSlot[]): FamilyMealPlanSlot[] {
  return [...slots].sort((left, right) => (
    left.plannedDate.localeCompare(right.plannedDate)
    || suggestionMealTypeOrder[left.mealType] - suggestionMealTypeOrder[right.mealType]
  ));
}

export type FamilyMealPlanSelection = FamilyMealPlanSlot & {
  recipeId: string;
  recentUseCount: number;
  alreadyUsedThisWeek: boolean;
  deterministicTieBreak: string;
};

export function selectFamilyMealPlanRecipes(input: {
  householdId: string;
  weekStart: string;
  slots: FamilyMealPlanSlot[];
  candidates: FamilyMealPlanCandidate[];
  currentWeekEntries: FamilyMealPlanExistingEntry[];
  tieBreak: (slot: FamilyMealPlanSlot, recipeId: string) => string;
}): FamilyMealPlanSelection[] {
  if (input.candidates.length === 0) throw new Error('No published recipe candidates are available.');
  const slots = canonicalizeFamilyMealPlanSlots(input.slots);
  const initialRecipeIds = new Set(input.currentWeekEntries.map((entry) => entry.recipeId));
  const usedRecipeIds = new Set(initialRecipeIds);
  const recipeDates = new Map<string, Set<string>>();
  for (const entry of input.currentWeekEntries) {
    const dates = recipeDates.get(entry.recipeId) ?? new Set<string>();
    dates.add(entry.plannedDate);
    recipeDates.set(entry.recipeId, dates);
  }
  const adjacent = (recipeId: string, plannedDate: string) => {
    const target = parseIsoCalendarDate(plannedDate).getTime();
    return [...(recipeDates.get(recipeId) ?? [])]
      .some((date) => Math.abs(parseIsoCalendarDate(date).getTime() - target) === DAY_MS);
  };
  const selections: FamilyMealPlanSelection[] = [];
  for (const slot of slots) {
    const ranked = input.candidates.map((candidate) => ({
      ...candidate,
      used: usedRecipeIds.has(candidate.recipeId),
      adjacent: adjacent(candidate.recipeId, slot.plannedDate),
      tieBreak: input.tieBreak(slot, candidate.recipeId),
    })).sort((left, right) => (
      Number(left.used) - Number(right.used)
      || left.recentUseCount - right.recentUseCount
      || Number(left.adjacent) - Number(right.adjacent)
      || left.tieBreak.localeCompare(right.tieBreak)
      || left.recipeId.localeCompare(right.recipeId)
    ));
    const chosen = ranked[0];
    selections.push({
      ...slot,
      recipeId: chosen.recipeId,
      recentUseCount: chosen.recentUseCount,
      alreadyUsedThisWeek: initialRecipeIds.has(chosen.recipeId),
      deterministicTieBreak: chosen.tieBreak,
    });
    usedRecipeIds.add(chosen.recipeId);
    const dates = recipeDates.get(chosen.recipeId) ?? new Set<string>();
    dates.add(slot.plannedDate);
    recipeDates.set(chosen.recipeId, dates);
  }
  return selections;
}

export type FamilyTasteInput = {
  dimensionKey: TasteDimensionKey;
  score: number;
  confidence: number;
  manualOverride: number | null;
};

export type FamilyTasteDimension = {
  key: TasteDimensionKey;
  score: number;
  confidence: number;
  activeMemberCount: number;
  contributingMemberCount: number;
};

export function aggregateFamilyTaste(
  activeMemberCount: number,
  rows: FamilyTasteInput[],
): FamilyTasteDimension[] {
  return TASTE_DIMENSION_KEYS.map((key) => {
    const values = rows.filter((row) => row.dimensionKey === key).map((row) => ({
      score: clampTaste(row.manualOverride === null ? row.score : row.manualOverride),
      confidence: row.manualOverride === null ? Math.max(0, Math.min(1, row.confidence)) : 1,
    }));
    const confidenceSum = values.reduce((sum, value) => sum + value.confidence, 0);
    const weightedScore = values.reduce((sum, value) => sum + value.score * value.confidence, 0);
    const stable = (value: number) => Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;
    return {
      key,
      score: confidenceSum > 0 ? stable(clampTaste(weightedScore / confidenceSum)) : 0,
      confidence: activeMemberCount > 0 ? stable(Math.max(0, Math.min(1, confidenceSum / activeMemberCount))) : 0,
      activeMemberCount,
      contributingMemberCount: values.filter((value) => value.confidence > 0).length,
    };
  });
}

export type ReplayableTasteSignal = {
  signalValue: number;
  baseWeight: number;
  qualityFactor: number;
  excludedReason?: string | null;
};

export function replayTasteSignals(signals: ReplayableTasteSignal[]): TasteDimensionState {
  let weightedTotal = 0;
  let effectiveWeight = 0;
  let sampleCount = 0;

  for (const signal of signals) {
    if (signal.excludedReason || signal.qualityFactor <= 0) continue;
    const weight = signal.baseWeight * signal.qualityFactor;
    if (!Number.isFinite(weight) || weight <= 0) continue;
    weightedTotal += clampTaste(signal.signalValue) * weight;
    effectiveWeight += weight;
    sampleCount += 1;
  }

  return {
    score: effectiveWeight === 0 ? 0 : clampTaste(weightedTotal / effectiveWeight),
    confidence: Math.min(1, sampleCount / 5),
    effectiveWeight,
    sampleCount,
  };
}

export function effectiveTasteState(state: TasteDimensionState): { score: number; confidence: number } {
  return state.manualOverride === null || state.manualOverride === undefined
    ? { score: state.score, confidence: state.confidence }
    : { score: clampTaste(state.manualOverride), confidence: 1 };
}

export type PersonalizedVersionIdentity = {
  id: string;
  originType: 'taste_engine' | 'user_edit';
};

export type PersonalizationVersionOverview<T extends PersonalizedVersionIdentity> = {
  latestEngine: T | null;
  latestAny: T | null;
  bestVersion: T | null;
};

export function selectDefaultPersonalizedVersion<T extends PersonalizedVersionIdentity>(
  overview: PersonalizationVersionOverview<T>,
): T | null {
  return overview.bestVersion ?? overview.latestAny ?? overview.latestEngine;
}

export type PersonalizedVersionChoice<T extends PersonalizedVersionIdentity> = {
  kind: 'best' | 'latest' | 'engine';
  label: string;
  version: T;
};

export function distinctPersonalizedVersionChoices<T extends PersonalizedVersionIdentity>(
  overview: PersonalizationVersionOverview<T>,
): Array<PersonalizedVersionChoice<T>> {
  const choices: Array<PersonalizedVersionChoice<T>> = [];
  const seen = new Set<string>();
  const add = (choice: PersonalizedVersionChoice<T> | null) => {
    if (!choice || seen.has(choice.version.id)) return;
    seen.add(choice.version.id);
    choices.push(choice);
  };

  add(overview.bestVersion ? { kind: 'best', label: 'Bản ngon nhất', version: overview.bestVersion } : null);
  add(overview.latestAny ? {
    kind: 'latest',
    label: overview.latestAny.originType === 'user_edit' ? 'Bản chỉnh gần nhất' : 'Bản cá nhân gần nhất',
    version: overview.latestAny,
  } : null);
  add(overview.latestEngine ? {
    kind: 'engine', label: 'Gợi ý mới nhất', version: overview.latestEngine,
  } : null);
  return choices;
}

export function decisionSourceVersionId(
  activeVersion: PersonalizedVersionIdentity | null,
): string | null {
  return activeVersion?.id ?? null;
}

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

export type EffectiveIngredientSource = ScalableIngredient & {
  ingredientId: string;
  slug: string;
  name: string;
  category: string | null;
  sortOrder: number;
};

export type PersonalizedIngredientSource = Partial<ScalableIngredient> & {
  ingredientId?: string;
  slug?: string;
  name?: string;
  category?: string | null;
  baseQuantity?: number;
  personalizationFactor?: number;
  sortOrder?: number;
};

export type EffectiveScaledIngredient = EffectiveIngredientSource & ScaledQuantity;

/**
 * Resolves an immutable personalized ingredient over its exact canonical base,
 * then applies the same serving scaling order used by Cook Mode.
 */
export function scaleEffectiveIngredient(
  canonical: EffectiveIngredientSource,
  personalized: PersonalizedIngredientSource | null,
  sourceServings: number,
  targetServings: number,
): EffectiveScaledIngredient {
  const canonicalQuantity = personalized?.baseQuantity ?? canonical.quantity;
  const personalizedQuantity = personalized?.quantity ?? canonicalQuantity;
  const personalizationFactor = personalized?.personalizationFactor
    ?? (canonicalQuantity === 0 ? 1 : personalizedQuantity / canonicalQuantity);
  const scalingMode = personalized?.scalingMode ?? canonical.scalingMode;
  const scalingExponent = personalized?.scalingExponent ?? canonical.scalingExponent;
  const roundingIncrement = personalized && Object.prototype.hasOwnProperty.call(personalized, 'roundingIncrement')
    ? personalized.roundingIncrement
    : canonical.roundingIncrement;
  const scaled = scaleIngredientQuantity({
    quantity: canonicalQuantity,
    // Preserve Cook Mode's canonical-unit rounding lookup. The output unit may
    // be personalized, but no unit conversion is performed here.
    unit: canonical.unit,
    scalingMode,
    scalingExponent,
    roundingIncrement,
  }, sourceServings, targetServings, personalizationFactor);

  return {
    ingredientId: canonical.ingredientId,
    slug: personalized?.slug ?? canonical.slug,
    name: personalized?.name ?? canonical.name,
    category: personalized?.category !== undefined ? personalized.category : canonical.category,
    quantity: scaled.quantity,
    canonicalQuantity: scaled.canonicalQuantity,
    scaledQuantity: scaled.scaledQuantity,
    personalizationFactor: scaled.personalizationFactor,
    unit: personalized?.unit ?? canonical.unit,
    sortOrder: personalized?.sortOrder ?? canonical.sortOrder,
    scalingMode,
    scalingExponent,
    roundingIncrement,
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

export type TimerStartedPayload = {
  stepNo: number;
  durationSeconds: number;
  startedAt: string;
};

export function nextClientSequence(serverEvents: SequencedCookEvent[], localEvents: SequencedCookEvent[]): number {
  return Math.max(0, ...serverEvents.map((event) => event.clientSeq), ...localEvents.map((event) => event.clientSeq)) + 1;
}

export type CookEventEmissionCoordinator = {
  run<T>(
    cookSessionId: string,
    serverEvents: SequencedCookEvent[],
    localEvents: SequencedCookEvent[],
    persist: (clientSeq: number) => Promise<T>,
  ): Promise<T>;
};

export function createCookEventEmissionCoordinator(): CookEventEmissionCoordinator {
  const tails = new Map<string, Promise<void>>();
  const highWaterMarks = new Map<string, number>();

  return {
    run(cookSessionId, serverEvents, localEvents, persist) {
      const previous = tails.get(cookSessionId) ?? Promise.resolve();
      const emission = previous
        .catch(() => undefined)
        .then(async () => {
          const observedMaximum = nextClientSequence(serverEvents, localEvents) - 1;
          const next = Math.max(observedMaximum, highWaterMarks.get(cookSessionId) ?? 0) + 1;
          highWaterMarks.set(cookSessionId, next);
          return persist(next);
        });

      tails.set(cookSessionId, emission.then(() => undefined));
      return emission;
    },
  };
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
  const payload = latestStart.payload as Partial<TimerStartedPayload>;
  const duration = payload.durationSeconds;
  if (typeof duration !== 'number' || duration <= 0) return null;
  const logicalStartedAt = typeof payload.startedAt === 'string'
    ? Date.parse(payload.startedAt)
    : Number.NaN;
  const startedAt = Number.isFinite(logicalStartedAt)
    ? logicalStartedAt
    : Date.parse(latestStart.serverTime ?? latestStart.clientTime);
  if (!Number.isFinite(startedAt)) return null;
  return Math.max(0, Math.ceil(duration - (nowMs - startedAt) / 1000));
}

export type QueuedCookEvent = SequencedCookEvent & {
  id: string;
  userId: string;
  cookSessionId: string;
  createdAt: string;
};

export type QueueSendResult = 'acknowledged' | 'duplicate' | 'retry' | 'auth' | 'rejected';

export function selectCookQueueEvents(
  events: QueuedCookEvent[],
  currentUserId: string,
  cookSessionId?: string,
): QueuedCookEvent[] {
  return orderCookEvents(events.filter((event) =>
    event.userId === currentUserId
    && (cookSessionId === undefined || event.cookSessionId === cookSessionId),
  ));
}

export async function reconcileCookQueue(
  events: QueuedCookEvent[],
  currentUserId: string,
  cookSessionId: string,
  send: (event: QueuedCookEvent) => Promise<QueueSendResult>,
  acknowledge: (event: QueuedCookEvent) => Promise<void>,
): Promise<{ acknowledged: number; retained: number; stopped: QueueSendResult | null }> {
  const owned = selectCookQueueEvents(events, currentUserId, cookSessionId);
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
