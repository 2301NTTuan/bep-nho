'use client';

import type { QueuedCookEvent, QueueSendResult } from '@bep-nho/domain';
import { reconcileCookQueue } from '@bep-nho/domain';
import { ApiRequestError, apiRequest } from './api';

const DATABASE = 'bep-nho-cook-v1';
const STORE = 'events';

function openQueue(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('userId', 'userId', { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openQueue();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, mode);
    const request = operation(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error);
  });
}

export function queueCookEvent(event: QueuedCookEvent): Promise<IDBValidKey> {
  return transact('readwrite', (store) => store.put(event));
}

export async function queuedCookEvents(userId: string): Promise<QueuedCookEvent[]> {
  const all = await transact<QueuedCookEvent[]>('readonly', (store) => store.getAll());
  return all.filter((event) => event.userId === userId);
}

export async function clearCookQueue(userId: string): Promise<void> {
  const events = await queuedCookEvents(userId);
  await Promise.all(events.map((event) => transact('readwrite', (store) => store.delete(event.id))));
}

export async function syncCookQueue(userId: string) {
  const events = await queuedCookEvents(userId);
  return reconcileCookQueue(
    events,
    userId,
    async (event): Promise<QueueSendResult> => {
      try {
        const response = await apiRequest<{ data: { duplicate?: boolean } }>(`/cook-sessions/${event.cookSessionId}/events`, {
          method: 'POST',
          body: JSON.stringify({
            eventType: event.eventType,
            clientSeq: event.clientSeq,
            clientTime: event.clientTime,
            payload: event.payload,
          }),
        });
        return response.data.duplicate ? 'duplicate' : 'acknowledged';
      } catch (cause) {
        if (cause instanceof ApiRequestError) {
          if (cause.status === 401 || cause.status === 403) return 'auth';
          if (cause.status >= 400 && cause.status < 500) return 'rejected';
        }
        return 'retry';
      }
    },
    async (event) => {
      await transact('readwrite', (store) => store.delete(event.id));
    },
  );
}
