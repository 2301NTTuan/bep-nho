import {
  nextClientSequence,
  reconcileCookQueue,
  remainingTimerSeconds,
  scaleIngredientQuantity,
} from '@bep-nho/domain';
import type { QueuedCookEvent, SequencedCookEvent } from '@bep-nho/domain';

describe('Phase 7 pure scaling, sequencing, timers, and queue reconciliation', () => {
  it('supports linear, conservative, and fixed scaling with one final practical rounding', () => {
    expect(scaleIngredientQuantity({ quantity: 3, unit: 'quả', scalingMode: 'LINEAR', roundingIncrement: 0.5 }, 2, 2)).toMatchObject({ scaledQuantity: 3, quantity: 3 });
    expect(scaleIngredientQuantity({ quantity: 3, unit: 'quả', scalingMode: 'LINEAR', roundingIncrement: 0.5 }, 2, 4)).toMatchObject({ scaledQuantity: 6, quantity: 6 });
    expect(scaleIngredientQuantity({ quantity: 3, unit: 'quả', scalingMode: 'LINEAR', roundingIncrement: 0.5 }, 2, 1)).toMatchObject({ scaledQuantity: 1.5, quantity: 1.5 });
    expect(scaleIngredientQuantity({ quantity: 10, unit: 'ml', scalingMode: 'CONSERVATIVE', scalingExponent: 0.75, roundingIncrement: 1 }, 2, 4, 1.2)).toMatchObject({ scaledQuantity: 17, quantity: 20 });
    expect(scaleIngredientQuantity({ quantity: 2, unit: 'g', scalingMode: 'FIXED', roundingIncrement: 0.1 }, 2, 8)).toMatchObject({ scaledQuantity: 2, quantity: 2 });
    expect(() => scaleIngredientQuantity({ quantity: 2, unit: 'g' }, 2, 0)).toThrow('integer from 1 to 8');
    expect(scaleIngredientQuantity({ quantity: 7, unit: 'ml', scalingMode: 'CONSERVATIVE', scalingExponent: 0.75, roundingIncrement: 1 }, 2, 5, 0.9))
      .toEqual(scaleIngredientQuantity({ quantity: 7, unit: 'ml', scalingMode: 'CONSERVATIVE', scalingExponent: 0.75, roundingIncrement: 1 }, 2, 5, 0.9));
  });

  it('uses max server/local sequence and restores timestamp-based timer state', () => {
    const server = [{ clientSeq: 4 }, { clientSeq: 2 }] as SequencedCookEvent[];
    const local = [{ clientSeq: 7 }] as SequencedCookEvent[];
    expect(nextClientSequence(server, local)).toBe(8);
    expect(remainingTimerSeconds(2, [{
      clientSeq: 5,
      eventType: 'timer_started',
      clientTime: '2026-01-01T00:00:00.000Z',
      serverTime: '2026-01-01T00:00:02.000Z',
      payload: { stepNo: 2, durationSeconds: 60 },
    }], Date.parse('2026-01-01T00:00:32.000Z'))).toBe(30);
  });

  it('flushes owned events in sequence and retains the failed event plus its tail', async () => {
    const make = (clientSeq: number): QueuedCookEvent => ({
      id: `${clientSeq}`, userId: 'user-a', cookSessionId: 'session-a', clientSeq,
      eventType: 'step_completed', clientTime: '2026-01-01T00:00:00.000Z',
      payload: { stepNo: clientSeq }, createdAt: '2026-01-01T00:00:00.000Z',
    });
    const sent: number[] = [];
    const removed: number[] = [];
    const result = await reconcileCookQueue(
      [make(3), make(1), make(2), { ...make(0), id: 'foreign', userId: 'user-b' }],
      'user-a',
      async (event) => { sent.push(event.clientSeq); return event.clientSeq === 1 ? 'duplicate' : event.clientSeq === 2 ? 'retry' : 'acknowledged'; },
      async (event) => { removed.push(event.clientSeq); },
    );
    expect(sent).toEqual([1, 2]);
    expect(removed).toEqual([1]);
    expect(result).toEqual({ acknowledged: 1, retained: 2, stopped: 'retry' });
  });
});
