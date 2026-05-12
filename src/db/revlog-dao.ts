import { db } from './database';
import type { Revlog } from '@/lib/types';
import { jstDayStart } from '@/lib/utils';

export const revlogDao = {
  async insert(log: Revlog): Promise<void> {
    await db.revlogs.add(log);
  },

  async getDailyLogs(folderIds: string[], now: Date): Promise<Revlog[]> {
    const folderSet = new Set(folderIds);
    const dayStart = jstDayStart(now).toISOString();
    return (await db.revlogs.where('reviewedAt').aboveOrEqual(dayStart).toArray())
      .filter((log) => folderSet.has(log.folderId));
  },
};
