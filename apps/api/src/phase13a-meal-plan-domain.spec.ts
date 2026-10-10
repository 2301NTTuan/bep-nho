import {
  isDateInMealPlanWeek,
  isMealType,
  parseIsoCalendarDate,
  validateMondayWeekStart,
} from '@bep-nho/domain';

describe('Phase 13A meal-plan calendar rules', () => {
  it('accepts only real ISO calendar dates and Monday week starts', () => {
    expect(validateMondayWeekStart('2026-10-12').toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect(() => validateMondayWeekStart('2026-10-11')).toThrow('Monday');
    expect(() => parseIsoCalendarDate('2026-02-30')).toThrow('valid calendar date');
    expect(() => parseIsoCalendarDate('2026-1-02')).toThrow('YYYY-MM-DD');
  });

  it('uses inclusive UTC date boundaries for a seven-day week', () => {
    expect(isDateInMealPlanWeek('2026-10-12', '2026-10-12')).toBe(true);
    expect(isDateInMealPlanWeek('2026-10-12', '2026-10-18')).toBe(true);
    expect(isDateInMealPlanWeek('2026-10-12', '2026-10-11')).toBe(false);
    expect(isDateInMealPlanWeek('2026-10-12', '2026-10-19')).toBe(false);
    expect(isDateInMealPlanWeek('2026-12-28', '2027-01-03')).toBe(true);
    expect(isDateInMealPlanWeek('2026-12-28', '2027-01-04')).toBe(false);
    expect(isDateInMealPlanWeek('2026-08-31', '2026-09-06')).toBe(true);
  });

  it('does not depend on the process local timezone', () => {
    const original = process.env.TZ;
    try {
      const results = ['Asia/Ho_Chi_Minh', 'Etc/GMT+12', 'Pacific/Kiritimati', 'UTC'].map((timezone) => {
        process.env.TZ = timezone;
        return [
          validateMondayWeekStart('2026-10-12').getTime(),
          isDateInMealPlanWeek('2026-10-12', '2026-10-18'),
          isDateInMealPlanWeek('2026-10-12', '2026-10-19'),
        ];
      });
      expect(new Set(results.map((result) => JSON.stringify(result))).size).toBe(1);
    } finally {
      process.env.TZ = original;
    }
  });

  it('recognizes only the four supported meal types', () => {
    expect(['breakfast', 'lunch', 'dinner', 'other'].every(isMealType)).toBe(true);
    expect(isMealType('snack')).toBe(false);
  });
});
