import Papa from 'papaparse';
import { db } from '@/db/database';
import { folderDao } from '@/db/folder-dao';
import { cardDao } from '@/db/card-dao';
import type { Folder } from '@/lib/types';

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export const csvService = {
  async importCsv(csvContent: string, parentFolderId: string | null): Promise<ImportResult> {
    // Remove BOM
    const content = csvContent.replace(/^\uFEFF/, '');
    const parsed = Papa.parse<string[]>(content, { skipEmptyLines: true });

    const result: ImportResult = { imported: 0, skipped: 0, errors: [] };
    const folderCache = new Map<string, string>(); // path -> folderId
    const cardsToInsert: Array<{ front: string; back: string; folderId: string }> = [];

    for (let i = 0; i < parsed.data.length; i++) {
      const row = parsed.data[i];
      if (row.length < 2) {
        result.errors.push(`行${i + 1}: カラム不足`);
        result.skipped++;
        continue;
      }

      const front = row[0]?.trim();
      const back = row[1]?.trim();
      const folderPath = row[2]?.trim() || '';

      if (!front || !back) {
        result.errors.push(`行${i + 1}: 表面または裏面が空`);
        result.skipped++;
        continue;
      }

      let folderId: string;
      if (!folderPath) {
        if (parentFolderId) {
          folderId = parentFolderId;
        } else {
          result.errors.push(`行${i + 1}: フォルダパスが未指定`);
          result.skipped++;
          continue;
        }
      } else {
        folderId = await this.ensureFolderPath(folderPath, parentFolderId, folderCache);
      }

      cardsToInsert.push({ front, back, folderId });
    }

    if (cardsToInsert.length > 0) {
      await cardDao.insertBatch(cardsToInsert);
      result.imported = cardsToInsert.length;
    }

    return result;
  },

  async ensureFolderPath(
    path: string,
    parentFolderId: string | null,
    cache: Map<string, string>,
  ): Promise<string> {
    const cacheKey = `${parentFolderId || 'root'}/${path}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey)!;

    const parts = path.split('/').filter(Boolean);
    let currentParentId = parentFolderId;

    for (let i = 0; i < parts.length; i++) {
      const partName = parts[i];
      const partKey = `${currentParentId || 'root'}/${parts.slice(0, i + 1).join('/')}`;

      if (cache.has(partKey)) {
        currentParentId = cache.get(partKey)!;
        continue;
      }

      const children = await folderDao.getChildren(currentParentId);
      const existing = children.find(f => f.name === partName);

      if (existing) {
        currentParentId = existing.id;
      } else {
        const newFolder = await folderDao.insert(partName, currentParentId);
        currentParentId = newFolder.id;
      }

      cache.set(partKey, currentParentId);
    }

    cache.set(cacheKey, currentParentId!);
    return currentParentId!;
  },

  async exportCsv(folderIds: string[] | null): Promise<string> {
    // Build folder path cache
    const allFolders = await folderDao.getAll();
    const folderMap = new Map<string, Folder>(allFolders.map(f => [f.id, f]));

    const getPath = (folderId: string): string => {
      const parts: string[] = [];
      let current = folderMap.get(folderId);
      while (current) {
        parts.unshift(current.name);
        current = current.parentId ? folderMap.get(current.parentId) : undefined;
      }
      return parts.join('/');
    };

    let cards;
    if (folderIds) {
      const allFolderIds: string[] = [];
      for (const id of folderIds) {
        allFolderIds.push(...await folderDao.getSelfAndDescendantIds(id));
      }
      cards = await db.cards.where('folderId').anyOf(allFolderIds).toArray();
    } else {
      cards = await db.cards.toArray();
    }

    const rows = cards.map(c => [c.front, c.back, getPath(c.folderId)]);
    return Papa.unparse(rows);
  },
};
