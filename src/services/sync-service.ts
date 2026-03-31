import { db } from '@/db/database';
import { findSyncFile, downloadSyncFile, uploadSyncFile } from '@/lib/google-drive';
import type { SyncPayload, Folder, FlashCard, CardState } from '@/lib/types';

function getDeviceId(): string {
  if (typeof window === 'undefined') return 'unknown';
  let id = localStorage.getItem('anki-reset-device-id');
  if (!id) {
    id = 'web-' + crypto.randomUUID();
    localStorage.setItem('anki-reset-device-id', id);
  }
  return id;
}

async function exportLocal(): Promise<SyncPayload> {
  const [folders, cards, cardStates] = await Promise.all([
    db.folders.toArray(),
    db.cards.toArray(),
    db.cardStates.toArray(),
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    deviceId: getDeviceId(),
    data: { folders, cards, cardStates },
  };
}

function mergeRecords<T extends { updatedAt: string }>(
  local: T[],
  remote: T[],
  getKey: (item: T) => string,
): T[] {
  const map = new Map<string, T>();

  // Add all local records
  for (const item of local) {
    map.set(getKey(item), item);
  }

  // Merge remote records (last-write-wins)
  for (const item of remote) {
    const key = getKey(item);
    const existing = map.get(key);
    if (!existing || item.updatedAt > existing.updatedAt) {
      map.set(key, item);
    }
  }

  return Array.from(map.values());
}

async function mergeAndPersist(remote: SyncPayload): Promise<void> {
  const local = await exportLocal();

  // Union merge: all records from both sides are kept.
  // For the same ID, the record with the newer updatedAt wins.
  // Records are never deleted — data is only added or updated.
  const mergedFolders = mergeRecords(
    local.data.folders,
    remote.data.folders,
    (f: Folder) => f.id,
  );
  const mergedCards = mergeRecords(
    local.data.cards,
    remote.data.cards,
    (c: FlashCard) => c.id,
  );
  const mergedStates = mergeRecords(
    local.data.cardStates,
    remote.data.cardStates,
    (s: CardState) => s.cardId,
  );

  // Use bulkPut (upsert) instead of clear + bulkAdd so that
  // no existing record is ever wiped before the merged data is written.
  await db.transaction('rw', [db.folders, db.cards, db.cardStates], async () => {
    await db.folders.bulkPut(mergedFolders);
    await db.cards.bulkPut(mergedCards);
    await db.cardStates.bulkPut(mergedStates);
  });
}

export const syncService = {
  async sync(token: string): Promise<{ pulled: boolean; pushed: boolean }> {
    let pulled = false;
    let pushed = false;

    // Pull
    const fileId = await findSyncFile(token);
    if (fileId) {
      const content = await downloadSyncFile(token, fileId);
      const remote: SyncPayload = JSON.parse(content);
      if (remote.version === 1) {
        await mergeAndPersist(remote);
        pulled = true;
      }
    }

    // Push
    const payload = await exportLocal();
    const jsonStr = JSON.stringify(payload);
    await uploadSyncFile(token, jsonStr, fileId ?? undefined);
    pushed = true;

    return { pulled, pushed };
  },
};
