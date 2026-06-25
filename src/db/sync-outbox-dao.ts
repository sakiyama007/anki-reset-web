import { db } from './database';
import type { SyncOutboxItem } from '@/lib/types';

function outboxIdForRevlog(revlogId: string): string {
  return `revlog:${revlogId}`;
}

async function getUnsentItems(): Promise<SyncOutboxItem[]> {
  const [pending, failed] = await Promise.all([
    db.syncOutbox.where('status').equals('pending').toArray(),
    db.syncOutbox.where('status').equals('failed').toArray(),
  ]);
  return [...pending, ...failed];
}

export const syncOutboxDao = {
  async enqueueRevlog(revlogId: string, nowIso: string): Promise<void> {
    await db.syncOutbox.put({
      id: outboxIdForRevlog(revlogId),
      itemType: 'revlog',
      itemId: revlogId,
      status: 'pending',
      attemptCount: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  },

  async hasUnsent(): Promise<boolean> {
    return (await db.syncOutbox.where('status').anyOf('pending', 'failed').count()) > 0;
  },

  async markUnsentSynced(nowIso: string): Promise<void> {
    const items = await getUnsentItems();
    if (items.length === 0) return;

    await db.syncOutbox.bulkPut(
      items.map((item) => ({
        ...item,
        status: 'synced',
        updatedAt: nowIso,
        lastError: undefined,
      })),
    );
  },

  async markUnsentFailed(error: unknown, nowIso: string): Promise<void> {
    const items = await getUnsentItems();
    if (items.length === 0) return;

    const message = error instanceof Error ? error.message : String(error);
    await db.syncOutbox.bulkPut(
      items.map((item) => ({
        ...item,
        status: 'failed',
        attemptCount: item.attemptCount + 1,
        updatedAt: nowIso,
        lastError: message,
      })),
    );
  },
};
