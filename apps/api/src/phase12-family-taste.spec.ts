import { aggregateFamilyTaste, type FamilyTasteInput } from '@bep-nho/domain';

const salt = (score: number, confidence: number, manualOverride: number | null = null): FamilyTasteInput => ({
  dimensionKey: 'saltiness', score, confidence, manualOverride,
});

describe('Phase 12 deterministic Family Taste', () => {
  it('weights equal-confidence members and reports exact confidence', () => {
    const value = aggregateFamilyTaste(2, [salt(0.8, 0.5), salt(-0.2, 0.5)])[0];
    expect(value).toEqual(expect.objectContaining({ score: 0.3, confidence: 0.5, activeMemberCount: 2, contributingMemberCount: 2 }));
  });

  it('weights unequal confidence', () => {
    const value = aggregateFamilyTaste(2, [salt(1, 0.75), salt(-1, 0.25)])[0];
    expect(value.score).toBe(0.5);
    expect(value.confidence).toBe(0.5);
  });

  it('treats a manual override as confidence one', () => {
    const value = aggregateFamilyTaste(2, [salt(-0.8, 0.1, 0.6), salt(0, 0.5)])[0];
    expect(value.score).toBeCloseTo(0.4, 12);
    expect(value.confidence).toBe(0.75);
  });

  it('keeps a missing member in the confidence denominator', () => {
    const value = aggregateFamilyTaste(2, [salt(0.4, 0.8)])[0];
    expect(value.score).toBe(0.4);
    expect(value.confidence).toBe(0.4);
    expect(value.contributingMemberCount).toBe(1);
  });

  it('returns zero score and confidence when all members lack evidence', () => {
    expect(aggregateFamilyTaste(3, [])[0]).toEqual(expect.objectContaining({ score: 0, confidence: 0, activeMemberCount: 3, contributingMemberCount: 0 }));
  });

  it('preserves an explicit zero manual override as real evidence', () => {
    const value = aggregateFamilyTaste(1, [salt(0.9, 0.1, 0)])[0];
    expect(value.score).toBe(0);
    expect(value.confidence).toBe(1);
    expect(value.contributingMemberCount).toBe(1);
  });

  it('is independent of database row ordering and byte-stable for identical inputs', () => {
    const rows = [salt(0.8, 0.4), salt(-0.2, 0.6)];
    const first = aggregateFamilyTaste(2, rows);
    const second = aggregateFamilyTaste(2, [...rows].reverse());
    expect(second).toEqual(first);
    expect(JSON.stringify(aggregateFamilyTaste(2, rows))).toBe(JSON.stringify(first));
  });
});
