import { effectiveTasteState, replayTasteSignals } from '@bep-nho/domain';

describe('Phase 8 deterministic Taste replay', () => {
  it('replays weighted valid signals and excludes technical failures', () => {
    expect(replayTasteSignals([
      { signalValue: 1, baseWeight: 1, qualityFactor: 1 },
      { signalValue: -1, baseWeight: 2, qualityFactor: 0.5 },
      { signalValue: 1, baseWeight: 10, qualityFactor: 0, excludedReason: '["burnt"]' },
      { signalValue: 1, baseWeight: 10, qualityFactor: 1, excludedReason: '["undercooked"]' },
    ])).toEqual({ score: 0, confidence: 0.4, effectiveWeight: 2, sampleCount: 2 });
  });

  it('treats an explicit zero override as authoritative at zero learned confidence', () => {
    expect(effectiveTasteState({
      score: 0.8,
      confidence: 0,
      effectiveWeight: 0,
      sampleCount: 0,
      manualOverride: 0,
    })).toEqual({ score: 0, confidence: 1 });
    expect(effectiveTasteState({
      score: -0.4,
      confidence: 0.2,
      effectiveWeight: 1,
      sampleCount: 1,
      manualOverride: null,
    })).toEqual({ score: -0.4, confidence: 0.2 });
  });
});
