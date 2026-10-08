'use client';

import type { QueuedCookEvent, QueueSendResult } from '@bep-nho/domain';
import { reconcileCookQueue } from '@bep-nho/domain';
import { ApiRequestError, apiRequest } from './api';

const DATABASE = 'bep-nho-cook-v1';
const STORE = 'events';
const DATABASE_VERSION = 2;
const USER_INDEX = 'userId';
const USER_SESSION_INDEX = 'userSession';

function openQueue(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const store = request.result.objectStoreNames.contains(STORE)
        ? request.transaction!.objectStore(STORE)
        : request.result.createObjectStore(STORE, { keyPath: 'id' });
      if (!store.indexNames.contains(USER_INDEX)) {
        store.createIndex(USER_INDEX, 'userId', { unique: false });
      }
      if (!store.indexNames.contains(USER_SESSION_INDEX)) {
        store.createIndex(USER_SESSION_INDEX, ['userId', 'cookSessionId'], { unique: false });
      }
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

export function queuedCookEvents(userId: string, cookSessionId: string): Promise<QueuedCookEvent[]> {
  return transact<QueuedCookEvent[]>('readonly', (store) =>
    store.index(USER_SESSION_INDEX).getAll(IDBKeyRange.only([userId, cookSessionId])),
  );
}

function queuedCookEventsForUser(userId: string): Promise<QueuedCookEvent[]> {
  return transact<QueuedCookEvent[]>('readonly', (store) =>
    store.index(USER_INDEX).getAll(IDBKeyRange.only(userId)),
  );
}

export async function clearCookQueue(userId: string): Promise<void> {
  const events = await queuedCookEventsForUser(userId);
  await Promise.all(events.map((event) => transact('readwrite', (store) => store.delete(event.id))));
}

export async function syncCookQueue(userId: string, cookSessionId: string) {
  const events = await queuedCookEvents(userId, cookSessionId);
  return reconcileCookQueue(
    events,
    userId,
    cookSessionId,
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
