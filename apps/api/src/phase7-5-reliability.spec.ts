import {
  createCookEventEmissionCoordinator,
  reconcileCookQueue,
  remainingTimerSeconds,
  scaleIngredientQuantity,
  selectCookQueueEvents,
} from '@bep-nho/domain';
import type { QueuedCookEvent, SequencedCookEvent, TimerStartedPayload } from '@bep-nho/domain';

describe('Phase 7.5 cooking reliability', () => {
  const t0 = '2026-01-01T12:00:00.000Z';
  const t5 = '2026-01-01T12:05:00.000Z';

  function timerStarted(serverTime = t0): SequencedCookEvent {
    const payload: TimerStartedPayload = { stepNo: 1, durationSeconds: 600, startedAt: t0 };
    return { clientSeq: 1, eventType: 'timer_started', clientTime: t0, serverTime, payload };
  }

  it('uses one logical timer start online, offline, after reconnect, refresh, and duplicate retry', () => {
    const online = timerStarted(t0);
    const receivedFiveMinutesLater = timerStarted(t5);
    const now = Date.parse(t5);

    expect(remainingTimerSeconds(1, [online], now)).toBe(300);
    expect(remainingTimerSeconds(1, [receivedFiveMinutesLater], now)).toBe(300);
    expect(remainingTimerSeconds(1, [receivedFiveMinutesLater], now)).toBe(300);
    expect(remainingTimerSeconds(1, [receivedFiveMinutesLater, receivedFiveMinutesLater], now)).toBe(300);
    expect(remainingTimerSeconds(1, [receivedFiveMinutesLater], Date.parse('2026-01-01T12:10:01.000Z'))).toBe(0);

    const completed = {
      clientSeq: 2,
      eventType: 'timer_completed',
      clientTime: '2026-01-01T12:10:01.000Z',
      serverTime: '2026-01-01T12:10:02.000Z',
      payload: { stepNo: 1 },
    } satisfies SequencedCookEvent;
    expect(remainingTimerSeconds(1, [receivedFiveMinutesLater, completed], now)).toBe(0);
    expect(remainingTimerSeconds(1, [receivedFiveMinutesLater, completed, completed], now)).toBe(0);
  });

  it('isolates reconciliation by user and cook session', async () => {
    const make = (id: string, userId: string, cookSessionId: string, clientSeq: number): QueuedCookEvent => ({
      id, userId, cookSessionId, clientSeq, eventType: 'step_completed',
      clientTime: t0, createdAt: t0, payload: { stepNo: clientSeq },
    });
    const events = [
      make('a1-1', 'user-a', 'session-a1', 1),
      make('a1-2', 'user-a', 'session-a1', 2),
      make('a2-1', 'user-a', 'session-a2', 1),
      make('b1-1', 'user-b', 'session-b1', 1),
    ];
    const sent: string[] = [];
    const removed: string[] = [];

    const failedA1 = await reconcileCookQueue(
      events, 'user-a', 'session-a1',
      async (event) => { sent.push(event.id); return 'retry'; },
      async (event) => { removed.push(event.id); },
    );
    expect(failedA1).toEqual({ acknowledged: 0, retained: 2, stopped: 'retry' });
    expect(sent).toEqual(['a1-1']);

    const successfulA2 = await reconcileCookQueue(
      events, 'user-a', 'session-a2',
      async (event) => { sent.push(event.id); return 'acknowledged'; },
      async (event) => { removed.push(event.id); },
    );
    expect(successfulA2).toEqual({ acknowledged: 1, retained: 0, stopped: null });
    expect(sent).toEqual(['a1-1', 'a2-1']);
    expect(removed).toEqual(['a2-1']);
    expect(sent).not.toContain('b1-1');

    const clearedForA = new Set(selectCookQueueEvents(events, 'user-a').map((event) => event.id));
    expect([...clearedForA].sort()).toEqual(['a1-1', 'a1-2', 'a2-1']);
    expect(events.filter((event) => !clearedForA.has(event.id)).map((event) => event.id)).toEqual(['b1-1']);
  });

  it('allocates unique monotonic sequences for concurrent timer and step emissions', async () => {
    const coordinator = createCookEventEmissionCoordinator();
    const server = [{ clientSeq: 0 }] as SequencedCookEvent[];
    const queued = new Map<number, string>();

    async function emit(eventType: string) {
      const local = [...queued].map(([clientSeq, type]) => ({
        clientSeq, eventType: type, clientTime: t0, payload: {},
      }));
      return coordinator.run('session-a', server, local, async (clientSeq) => {
        await Promise.resolve();
        queued.set(clientSeq, eventType);
        return clientSeq;
      });
    }

    const sequences = await Promise.all([
      emit('timer_completed'),
      emit('step_completed'),
    ]);
    expect(sequences).toEqual([1, 2]);
    expect([...queued.entries()]).toEqual([[1, 'timer_completed'], [2, 'step_completed']]);

    const afterRefresh = createCookEventEmissionCoordinator();
    expect(await afterRefresh.run('session-a', server, [...queued].map(([clientSeq, eventType]) => ({
      clientSeq, eventType, clientTime: t0, payload: {},
    })), async (clientSeq) => clientSeq)).toBe(3);
  });

  it('uses unit defaults for null increments and respects explicit increments', () => {
    expect(scaleIngredientQuantity({ quantity: 10.4, unit: 'ml', roundingIncrement: null }, 2, 2).quantity).toBe(10);
    expect(scaleIngredientQuantity({ quantity: 10.6, unit: 'g', roundingIncrement: null }, 2, 2).quantity).toBe(11);
    expect(scaleIngredientQuantity({ quantity: 1.74, unit: 'quả', roundingIncrement: null }, 2, 2).quantity).toBe(1.5);
    expect(scaleIngredientQuantity({ quantity: 10.4, unit: 'ml', roundingIncrement: 0.1 }, 2, 2).quantity).toBe(10.4);
    expect(scaleIngredientQuantity({ quantity: 10.4, unit: 'ml', roundingIncrement: null }, 2, 2, 1.2).quantity).toBe(12);
  });
});
