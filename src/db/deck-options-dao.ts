import { db } from './database';
import type { DeckOptions, Folder } from '@/lib/types';
import { AppConstants } from '@/lib/constants';
import { nowISO } from '@/lib/utils';

function normalizeDeckOptions(folderId: string, partial?: Partial<DeckOptions>): DeckOptions {
  return {
    folderId,
    updatedAt: partial?.updatedAt ?? nowISO(),
    learningStepsMinutes: partial?.learningStepsMinutes ?? [...AppConstants.learningStepsMinutes],
    graduatingInterval: partial?.graduatingInterval ?? AppConstants.graduatingInterval,
    easyGraduationInterval: partial?.easyGraduationInterval ?? AppConstants.easyGraduationInterval,
    initialEaseFactor: partial?.initialEaseFactor ?? AppConstants.initialEaseFactor,
    hardMultiplier: partial?.hardMultiplier ?? AppConstants.hardMultiplier,
    easyBonus: partial?.easyBonus ?? AppConstants.easyBonus,
    intervalModifier: partial?.intervalModifier ?? AppConstants.intervalModifier,
    maximumInterval: partial?.maximumInterval ?? AppConstants.maximumInterval,
    relearningStepsMinutes: partial?.relearningStepsMinutes ?? [...AppConstants.relearningStepsMinutes],
    lapseNewInterval: partial?.lapseNewInterval ?? AppConstants.lapseNewInterval,
    minimumLapseInterval: partial?.minimumLapseInterval ?? AppConstants.minimumLapseInterval,
    minEaseFactor: partial?.minEaseFactor ?? AppConstants.minEaseFactor,
    newCardsPerDay: partial?.newCardsPerDay ?? AppConstants.defaultNewCardsPerDay,
    maxReviewsPerDay: partial?.maxReviewsPerDay ?? AppConstants.defaultMaxReviewsPerDay,
    newCardInsertionOrder: partial?.newCardInsertionOrder ?? AppConstants.defaultNewCardInsertionOrder,
    reviewSortOrder: partial?.reviewSortOrder ?? AppConstants.defaultReviewSortOrder,
    leechThreshold: partial?.leechThreshold ?? AppConstants.defaultLeechThreshold,
  };
}

function resolveEffective(
  folderId: string,
  folderMap: Map<string, Folder>,
  optionMap: Map<string, DeckOptions>,
  memo: Map<string, DeckOptions>,
): DeckOptions {
  const cached = memo.get(folderId);
  if (cached) return cached;

  const own = optionMap.get(folderId);
  if (own) {
    const normalized = normalizeDeckOptions(folderId, own);
    memo.set(folderId, normalized);
    return normalized;
  }

  const folder = folderMap.get(folderId);
  if (!folder?.parentId) {
    const normalized = normalizeDeckOptions(folderId);
    memo.set(folderId, normalized);
    return normalized;
  }

  const inherited = resolveEffective(folder.parentId, folderMap, optionMap, memo);
  const normalized = {
    ...inherited,
    folderId,
  };
  memo.set(folderId, normalized);
  return normalized;
}

export function getEffectiveDeckOptionsMapFromData(
  folders: Folder[],
  options: DeckOptions[],
  folderIds: string[],
): Map<string, DeckOptions> {
  const uniqueIds = [...new Set(folderIds)];
  const folderMap = new Map(folders.map((folder) => [folder.id, folder]));
  const optionMap = new Map(options.map((option) => [option.folderId, option]));
  const memo = new Map<string, DeckOptions>();

  for (const folderId of uniqueIds) {
    resolveEffective(folderId, folderMap, optionMap, memo);
  }

  return memo;
}

export const deckOptionsDao = {
  normalize(folderId: string, partial?: Partial<DeckOptions>): DeckOptions {
    return normalizeDeckOptions(folderId, partial);
  },

  async getOwn(folderId: string): Promise<DeckOptions | undefined> {
    return db.deckOptions.get(folderId);
  },

  async getEffective(folderId: string): Promise<DeckOptions> {
    const [folders, options] = await Promise.all([
      db.folders.toArray(),
      db.deckOptions.toArray(),
    ]);
    const folderMap = new Map(folders.map((folder) => [folder.id, folder]));
    const optionMap = new Map(options.map((option) => [option.folderId, option]));
    return resolveEffective(folderId, folderMap, optionMap, new Map());
  },

  async getEffectiveMap(folderIds: string[]): Promise<Map<string, DeckOptions>> {
    const [folders, options] = await Promise.all([
      db.folders.toArray(),
      db.deckOptions.toArray(),
    ]);
    return getEffectiveDeckOptionsMapFromData(folders, options, folderIds);
  },

  async upsert(options: DeckOptions): Promise<void> {
    await db.deckOptions.put({
      ...normalizeDeckOptions(options.folderId, options),
      updatedAt: nowISO(),
    });
  },

  async clear(folderId: string): Promise<void> {
    await db.deckOptions.delete(folderId);
  },
};
