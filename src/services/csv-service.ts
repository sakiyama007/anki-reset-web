import Papa from 'papaparse';
import { db } from '@/db/database';
import { folderDao } from '@/db/folder-dao';
import { cardDao } from '@/db/card-dao';
import type { FlashCard, Folder } from '@/lib/types';

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export interface ImportOptions {
  parentFolderId: string | null;
  skipHeader?: boolean;
}

type CsvExportInput = {
  folders: Folder[];
  cards: FlashCard[];
  folderIds: string[] | null;
};

function normalizeHeaderCell(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

function isHeaderRow(row: string[]): boolean {
  const first = normalizeHeaderCell(row[0]);
  const second = normalizeHeaderCell(row[1]);
  const third = normalizeHeaderCell(row[2]);

  const frontHeaders = new Set(['front', 'question', '表面', '問題', 'おもて']);
  const backHeaders = new Set(['back', 'answer', '裏面', '答え', '解答', 'うら']);
  const folderHeaders = new Set(['folder', 'folderpath', 'path', 'フォルダ', 'フォルダパス']);

  return frontHeaders.has(first)
    && backHeaders.has(second)
    && (!third || folderHeaders.has(third));
}

export function exportCsvFromData({ folders, cards, folderIds }: CsvExportInput): string {
  const activeFolders = folders.filter((folder) => !folder.isDeleted);
  const folderMap = new Map<string, Folder>(activeFolders.map((folder) => [folder.id, folder]));

  const getPath = (folderId: string): string => {
    const parts: string[] = [];
    let current = folderMap.get(folderId);
    while (current) {
      parts.unshift(current.name);
      current = current.parentId ? folderMap.get(current.parentId) : undefined;
    }
    return parts.join('/');
  };

  const selectedFolderIds = folderIds
    ? new Set<string>(folderIds)
    : null;
  if (selectedFolderIds) {
    const queue = [...selectedFolderIds];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      for (const folder of activeFolders) {
        if (folder.parentId === currentId && !selectedFolderIds.has(folder.id)) {
          selectedFolderIds.add(folder.id);
          queue.push(folder.id);
        }
      }
    }
  }

  const rows = cards
    .filter((card) => !card.isDeleted)
    .filter((card) => !selectedFolderIds || selectedFolderIds.has(card.folderId))
    .map((card) => [card.front, card.back, getPath(card.folderId)]);

  return Papa.unparse(rows);
}

export const csvService = {
  async importCsv(
    csvContent: string,
    parentFolderIdOrOptions: string | null | ImportOptions,
  ): Promise<ImportResult> {
    const options: ImportOptions = parentFolderIdOrOptions !== null && typeof parentFolderIdOrOptions === 'object'
      ? parentFolderIdOrOptions
      : { parentFolderId: parentFolderIdOrOptions };
    const { parentFolderId, skipHeader = true } = options;

    const content = csvContent.replace(/^\uFEFF/, '');
    const parsed = Papa.parse<string[]>(content, { skipEmptyLines: true });

    const result: ImportResult = { imported: 0, skipped: 0, errors: [] };
    const folderCache = new Map<string, string>();
    const cardsToInsert: Array<{ front: string; back: string; folderId: string }> = [];

    for (let i = 0; i < parsed.data.length; i++) {
      const row = parsed.data[i];
      if (i === 0 && skipHeader && isHeaderRow(row)) {
        continue;
      }

      if (row.length < 2) {
        result.errors.push(`行${i + 1}: 列が不足しています`);
        result.skipped++;
        continue;
      }

      const front = row[0]?.trim();
      const back = row[1]?.trim();
      const folderPath = row[2]?.trim() || '';

      if (!front || !back) {
        result.errors.push(`行${i + 1}: 表面または裏面が空です`);
        result.skipped++;
        continue;
      }

      let folderId: string;
      if (!folderPath) {
        if (parentFolderId) {
          folderId = parentFolderId;
        } else {
          result.errors.push(`行${i + 1}: フォルダパスが未指定です`);
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
      const existing = children.find((folder) => folder.name === partName);

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
    const [folders, cards] = await Promise.all([
      db.folders.toArray(),
      db.cards.toArray(),
    ]);
    return exportCsvFromData({ folders, cards, folderIds });
  },
};
