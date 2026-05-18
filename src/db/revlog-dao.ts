import { db } from './database';
import type { Revlog } from '@/lib/types';
import { jstDayStart } from '@/lib/utils';

export const revlogDao = {
  async insert(log: Revlog): Promise<void> {
    await db.revlogs.add(log);
  },

  async getByCardId(cardId: string): Promise<Revlog[]> {
    const logs = await db.revlogs.where('cardId').equals(cardId).toArray();
    return logs.sort((a, b) => {
      const reviewedAt = b.reviewedAt.localeCompare(a.reviewedAt);
      if (reviewedAt !== 0) return reviewedAt;
      return b.id.localeCompare(a.id);
    });
  },

  async getDailyLogs(folderIds: string[], now: Date): Promise<Revlog[]> {
    const folderSet = new Set(folderIds);
    const dayStart = jstDayStart(now).toISOString();
    return (await db.revlogs.where('reviewedAt').aboveOrEqual(dayStart).toArray())
      .filter((log) => folderSet.has(log.folderId));
  },
};
