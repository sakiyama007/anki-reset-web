import { db } from '@/db/database';
import { deckOptionsDao, getEffectiveDeckOptionsMapFromData } from '@/db/deck-options-dao';
import { findSyncFile, downloadSyncFile, uploadSyncFile } from '@/lib/google-drive';
import { AppConstants } from '@/lib/constants';
import { getDeviceId } from '@/lib/utils';
import type {
  SyncPayload,
  Folder,
  FlashCard,
  CardState,
  CardStudyState,
  DeckOptions,
  DeckOptionsSnapshot,
  Rating,
  Revlog,
  SchedulerPreferences,
} from '@/lib/types';
import { createInitialCardState, processRating } from './sm2-engine';

const VALID_CARD_STATES: CardStudyState[] = ['newCard', 'learning', 'review', 'relearning'];
const VALID_RATINGS: Rating[] = ['again', 'hard', 'good', 'easy'];

type SoftDeleteRecord = {
  updatedAt: string;
  isDeleted?: boolean;
  deletedAt?: string;
  deleteBaseUpdatedAt?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sanitizeIso(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function sanitizeOptionalIso(value: unknown): string | undefined {
  const sanitized = sanitizeIso(value);
  return sanitized ?? undefined;
}

function sanitizeNumber(
  value: unknown,
  { min, max, integer = false }: { min?: number; max?: number; integer?: boolean } = {},
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  const normalized = integer ? Math.trunc(value) : value;
  if (min !== undefined && normalized < min) return null;
  if (max !== undefined && normalized > max) return null;
  return normalized;
}

function sanitizeBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function sanitizeSteps(value: unknown, allowEmpty = false): number[] | null {
  if (!Array.isArray(value)) return null;
  const steps = value
    .map((entry) => sanitizeNumber(entry, { min: 0 }))
    .filter((entry): entry is number => entry !== null);
  if ((!allowEmpty && steps.length === 0) || steps.length !== value.length) {
    return null;
  }
  return steps;
}

function sanitizeCardState(value: unknown): CardState | null {
  if (!isRecord(value)) return null;

  const cardId = typeof value.cardId === 'string' ? value.cardId : null;
  const state = typeof value.state === 'string' && VALID_CARD_STATES.includes(value.state as CardStudyState)
    ? value.state as CardStudyState
    : null;
  const stepIndex = sanitizeNumber(value.stepIndex, { min: 0, integer: true });
  const due = sanitizeIso(value.due);
  const interval = sanitizeNumber(value.interval, { min: 0, integer: true });
  const easeFactor = sanitizeNumber(value.easeFactor, { min: 0 });
  const repetition = sanitizeNumber(value.repetition, { min: 0, integer: true });
  const lapseCount = sanitizeNumber(value.lapseCount, { min: 0, integer: true });
  const updatedAt = sanitizeIso(value.updatedAt);

  if (!cardId || !state || stepIndex === null || !due || interval === null || !easeFactor || repetition === null || lapseCount === null || !updatedAt) {
    return null;
  }

  return {
    cardId,
    state,
    stepIndex,
    due,
    interval,
    easeFactor,
    repetition,
    lapseCount,
    lastReviewedAt: sanitizeOptionalIso(value.lastReviewedAt),
    updatedAt,
  };
}

function sanitizeDeckOptionsSnapshot(value: unknown): DeckOptionsSnapshot | undefined {
  if (!isRecord(value)) return undefined;

  const learningStepsMinutes = sanitizeSteps(value.learningStepsMinutes);
  const graduatingInterval = sanitizeNumber(value.graduatingInterval, { min: 1, integer: true });
  const easyGraduationInterval = sanitizeNumber(value.easyGraduationInterval, { min: 1, integer: true });
  const initialEaseFactor = sanitizeNumber(value.initialEaseFactor, { min: 0 });
  const hardMultiplier = sanitizeNumber(value.hardMultiplier, { min: 0 });
  const easyBonus = sanitizeNumber(value.easyBonus, { min: 0 });
  const intervalModifier = sanitizeNumber(value.intervalModifier, { min: 0 });
  const maximumInterval = sanitizeNumber(value.maximumInterval, { min: 1, integer: true });
  const relearningStepsMinutes = sanitizeSteps(value.relearningStepsMinutes, true);
  const lapseNewInterval = sanitizeNumber(value.lapseNewInterval, { min: 0 });
  const minimumLapseInterval = sanitizeNumber(value.minimumLapseInterval, { min: 1, integer: true });
  const minEaseFactor = sanitizeNumber(value.minEaseFactor, { min: 0 });

  if (
    !learningStepsMinutes
    || graduatingInterval === null
    || easyGraduationInterval === null
    || initialEaseFactor === null
    || hardMultiplier === null
    || easyBonus === null
    || intervalModifier === null
    || maximumInterval === null
    || !relearningStepsMinutes
    || lapseNewInterval === null
    || minimumLapseInterval === null
    || minEaseFactor === null
  ) {
    return undefined;
  }

  return {
    learningStepsMinutes,
    graduatingInterval,
    easyGraduationInterval,
    initialEaseFactor,
    hardMultiplier,
    easyBonus,
    intervalModifier,
    maximumInterval,
    relearningStepsMinutes,
    lapseNewInterval,
    minimumLapseInterval,
    minEaseFactor,
  };
}

function sanitizeDeckOptions(value: unknown): DeckOptions | null {
  if (!isRecord(value)) return null;

  const folderId = typeof value.folderId === 'string' ? value.folderId : null;
  const updatedAt = sanitizeIso(value.updatedAt);
  const snapshot = sanitizeDeckOptionsSnapshot(value);
  const newCardsPerDay = sanitizeNumber(value.newCardsPerDay, { min: 0, integer: true });
  const maxReviewsPerDay = sanitizeNumber(value.maxReviewsPerDay, { min: 0, integer: true });
  const leechThreshold = sanitizeNumber(value.leechThreshold, { min: 1, integer: true });
  const newCardInsertionOrder = value.newCardInsertionOrder === 'random' || value.newCardInsertionOrder === 'sequential'
    ? value.newCardInsertionOrder
    : null;
  const reviewSortOrder = value.reviewSortOrder === 'dueAscRandom' || value.reviewSortOrder === 'dueAsc'
    ? value.reviewSortOrder
    : null;

  if (!folderId || !updatedAt || !snapshot || newCardsPerDay === null || maxReviewsPerDay === null || leechThreshold === null || !newCardInsertionOrder || !reviewSortOrder) {
    return null;
  }

  return {
    folderId,
    updatedAt,
    ...snapshot,
    newCardsPerDay,
    maxReviewsPerDay,
    newCardInsertionOrder,
    reviewSortOrder,
    leechThreshold,
  };
}

function sanitizeFolder(value: unknown): Folder | null {
  if (!isRecord(value)) return null;

  const id = typeof value.id === 'string' ? value.id : null;
  const name = typeof value.name === 'string' ? value.name : null;
  const parentId = value.parentId === null || typeof value.parentId === 'string'
    ? value.parentId
    : null;
  const createdAt = sanitizeIso(value.createdAt);
  const updatedAt = sanitizeIso(value.updatedAt);

  if (!id || !name || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    name,
    parentId,
    createdAt,
    updatedAt,
    isDeleted: sanitizeBoolean(value.isDeleted),
    deletedAt: sanitizeOptionalIso(value.deletedAt),
    deleteBaseUpdatedAt: sanitizeOptionalIso(value.deleteBaseUpdatedAt),
  };
}

function sanitizeFlashCard(value: unknown): FlashCard | null {
  if (!isRecord(value)) return null;

  const id = typeof value.id === 'string' ? value.id : null;
  const front = typeof value.front === 'string' ? value.front : null;
  const back = typeof value.back === 'string' ? value.back : null;
  const folderId = typeof value.folderId === 'string' ? value.folderId : null;
  const createdAt = sanitizeIso(value.createdAt);
  const updatedAt = sanitizeIso(value.updatedAt);

  if (!id || front === null || back === null || !folderId || !createdAt || !updatedAt) {
    return null;
  }

  return {
    id,
    front,
    back,
    folderId,
    createdAt,
    updatedAt,
    isDeleted: sanitizeBoolean(value.isDeleted),
    deletedAt: sanitizeOptionalIso(value.deletedAt),
    deleteBaseUpdatedAt: sanitizeOptionalIso(value.deleteBaseUpdatedAt),
    isSuspended: sanitizeBoolean(value.isSuspended),
    isLeech: sanitizeBoolean(value.isLeech),
  };
}

function sanitizeSchedulerSnapshot(value: unknown): Pick<SchedulerPreferences, 'nextDayStartsHour'> | undefined {
  if (!isRecord(value)) return undefined;
  const nextDayStartsHour = sanitizeNumber(value.nextDayStartsHour, { min: 0, max: 23, integer: true });
  return nextDayStartsHour === null ? undefined : { nextDayStartsHour };
}

function sanitizeRevlog(value: unknown): Revlog | null {
  if (!isRecord(value)) return null;

  const id = typeof value.id === 'string' ? value.id : null;
  const cardId = typeof value.cardId === 'string' ? value.cardId : null;
  const folderId = typeof value.folderId === 'string' ? value.folderId : null;
  const rating = typeof value.rating === 'string' && VALID_RATINGS.includes(value.rating as Rating)
    ? value.rating as Rating
    : null;
  const previousState = typeof value.previousState === 'string' && VALID_CARD_STATES.includes(value.previousState as CardStudyState)
    ? value.previousState as CardStudyState
    : null;
  const newState = typeof value.newState === 'string' && VALID_CARD_STATES.includes(value.newState as CardStudyState)
    ? value.newState as CardStudyState
    : null;
  const previousInterval = sanitizeNumber(value.previousInterval, { min: 0, integer: true });
  const newInterval = sanitizeNumber(value.newInterval, { min: 0, integer: true });
  const previousDue = sanitizeIso(value.previousDue);
  const newDue = sanitizeIso(value.newDue);
  const reviewedAt = sanitizeIso(value.reviewedAt);
  const updatedAt = sanitizeIso(value.updatedAt);

  if (
    !id
    || !cardId
    || !folderId
    || !rating
    || !previousState
    || !newState
    || previousInterval === null
    || newInterval === null
    || !previousDue
    || !newDue
    || !reviewedAt
    || !updatedAt
  ) {
    return null;
  }

  const previousCardStateSnapshot = sanitizeCardState(value.previousCardStateSnapshot);
  const newCardStateSnapshot = sanitizeCardState(value.newCardStateSnapshot);

  return {
    id,
    cardId,
    folderId,
    rating,
    previousState,
    newState,
    previousInterval,
    newInterval,
    previousDue,
    newDue,
    reviewedAt,
    updatedAt,
    deviceId: typeof value.deviceId === 'string' ? value.deviceId : undefined,
    schedulerSnapshot: sanitizeSchedulerSnapshot(value.schedulerSnapshot),
    deckOptionsSnapshot: sanitizeDeckOptionsSnapshot(value.deckOptionsSnapshot),
    previousCardStateSnapshot: previousCardStateSnapshot?.cardId === cardId ? previousCardStateSnapshot : undefined,
    newCardStateSnapshot: newCardStateSnapshot?.cardId === cardId ? newCardStateSnapshot : undefined,
  };
}

function sanitizeSyncPayload(value: unknown): SyncPayload {
  if (!isRecord(value)) {
    throw new Error('Invalid sync payload');
  }

  const version = value.version === 1 || value.version === 2 ? value.version : null;
  const exportedAt = sanitizeIso(value.exportedAt);
  const deviceId = typeof value.deviceId === 'string' ? value.deviceId : null;
  const data = isRecord(value.data) ? value.data : null;

  if (!version || !exportedAt || !deviceId || !data) {
    throw new Error('Invalid sync payload');
  }

  const folders = Array.isArray(data.folders)
    ? data.folders.map(sanitizeFolder).filter((entry): entry is Folder => entry !== null)
    : [];
  const cards = Array.isArray(data.cards)
    ? data.cards.map(sanitizeFlashCard).filter((entry): entry is FlashCard => entry !== null)
    : [];
  const cardStates = Array.isArray(data.cardStates)
    ? data.cardStates.map(sanitizeCardState).filter((entry): entry is CardState => entry !== null)
    : [];
  const deckOptions = Array.isArray(data.deckOptions)
    ? data.deckOptions.map(sanitizeDeckOptions).filter((entry): entry is DeckOptions => entry !== null)
    : undefined;
  const revlogs = Array.isArray(data.revlogs)
    ? data.revlogs.map(sanitizeRevlog).filter((entry): entry is Revlog => entry !== null)
    : undefined;

  return {
    version,
    exportedAt,
    deviceId,
    data: {
      folders,
      cards,
      cardStates,
      deckOptions,
      revlogs,
    },
  };
}

async function exportLocal(): Promise<SyncPayload> {
  const [folders, cards, cardStates, deckOptions, revlogs] = await Promise.all([
    db.folders.toArray(),
    db.cards.toArray(),
    db.cardStates.toArray(),
    db.deckOptions.toArray(),
    db.revlogs.toArray(),
  ]);

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    deviceId: getDeviceId(),
    data: { folders, cards, cardStates, deckOptions, revlogs },
  };
}

type MergedSyncData = {
  folders: Folder[];
  cards: FlashCard[];
  cardStates: CardState[];
  deckOptions: DeckOptions[];
  revlogs: Revlog[];
};

function mergeRecords<T extends { updatedAt: string }>(
  local: T[],
  remote: T[],
  getKey: (item: T) => string,
): T[] {
  const map = new Map<string, T>();

  for (const item of local) {
    map.set(getKey(item), item);
  }

  for (const item of remote) {
    const key = getKey(item);
    const existing = map.get(key);
    if (!existing || item.updatedAt > existing.updatedAt) {
      map.set(key, item);
    }
  }

  return Array.from(map.values());
}

function compareRevlogs(a: Revlog, b: Revlog): number {
  const reviewedAt = a.reviewedAt.localeCompare(b.reviewedAt);
  if (reviewedAt !== 0) return reviewedAt;

  const updatedAt = a.updatedAt.localeCompare(b.updatedAt);
  if (updatedAt !== 0) return updatedAt;

  return a.id.localeCompare(b.id);
}

function toReplaySchedulerPreferences(log: Revlog): SchedulerPreferences {
  return {
    nextDayStartsHour: log.schedulerSnapshot?.nextDayStartsHour ?? AppConstants.defaultNextDayStartsHour,
    learnAheadMinutes: AppConstants.defaultLearnAheadMinutes,
  };
}

function toReplayDeckOptions(log: Revlog, fallback: DeckOptions): DeckOptions {
  return deckOptionsDao.normalize(log.folderId, {
    ...fallback,
    ...log.deckOptionsSnapshot,
    updatedAt: log.updatedAt,
  });
}

function canSeedFromInitialState(card: FlashCard, log: Revlog): boolean {
  return log.previousState === 'newCard'
    && log.previousInterval === 0
    && log.previousDue === card.createdAt;
}

function rebuildCardStates(
  cards: FlashCard[],
  fallbackStates: CardState[],
  folders: Folder[],
  deckOptions: DeckOptions[],
  revlogs: Revlog[],
): CardState[] {
  const fallbackStateMap = new Map(fallbackStates.map((state) => [state.cardId, state]));
  const revlogsByCardId = new Map<string, Revlog[]>();
  const effectiveDeckOptionsByFolder = getEffectiveDeckOptionsMapFromData(
    folders,
    deckOptions,
    [
      ...cards.map((card) => card.folderId),
      ...revlogs.map((log) => log.folderId),
    ],
  );

  for (const log of revlogs) {
    const currentLogs = revlogsByCardId.get(log.cardId) ?? [];
    currentLogs.push(log);
    revlogsByCardId.set(log.cardId, currentLogs);
  }

  return cards.map((card) => {
    const fallbackState = fallbackStateMap.get(card.id);
    const cardLogs = [...(revlogsByCardId.get(card.id) ?? [])].sort(compareRevlogs);

    if (cardLogs.length === 0) {
      return fallbackState ?? createInitialCardState(card.id, card.createdAt);
    }

    const firstLog = cardLogs[0];
    let currentState: CardState | undefined = firstLog.previousCardStateSnapshot
      ? { ...firstLog.previousCardStateSnapshot }
      : undefined;

    if (!currentState && canSeedFromInitialState(card, firstLog)) {
      currentState = createInitialCardState(card.id, card.createdAt);
    }

    if (!currentState) {
      return fallbackState ?? createInitialCardState(card.id, card.createdAt);
    }

    for (const log of cardLogs) {
      const fallbackDeckOptions = effectiveDeckOptionsByFolder.get(log.folderId)
        ?? effectiveDeckOptionsByFolder.get(card.folderId)
        ?? deckOptionsDao.normalize(log.folderId);

      currentState = log.newCardStateSnapshot
        ? { ...log.newCardStateSnapshot }
        : processRating(
          currentState,
          log.rating,
          new Date(log.reviewedAt),
          toReplayDeckOptions(log, fallbackDeckOptions),
          toReplaySchedulerPreferences(log),
        );
    }

    return currentState;
  });
}

function deleteLosesToLiveEdit<T extends SoftDeleteRecord>(deleted: T, alive: T): boolean {
  const deleteBase = deleted.deleteBaseUpdatedAt ?? deleted.updatedAt;
  return alive.updatedAt > deleteBase;
}

function reviveDeletedFolderChain(
  folders: Folder[],
  cards: FlashCard[],
): Folder[] {
  const folderMap = new Map(folders.map((folder) => [folder.id, { ...folder }]));

  const reviveChain = (folderId: string | null, activityUpdatedAt: string): void => {
    let currentId = folderId;

    while (currentId) {
      const folder = folderMap.get(currentId);
      if (!folder) break;

      const deleteBase = folder.deleteBaseUpdatedAt ?? folder.updatedAt;
      if (folder.isDeleted && activityUpdatedAt > deleteBase) {
        folderMap.set(currentId, {
          ...folder,
          isDeleted: false,
          deletedAt: undefined,
          deleteBaseUpdatedAt: undefined,
          updatedAt: activityUpdatedAt > folder.updatedAt ? activityUpdatedAt : folder.updatedAt,
        });
      }

      currentId = folder.parentId;
    }
  };

  for (const folder of folders) {
    if (!folder.isDeleted) {
      reviveChain(folder.id, folder.updatedAt);
    }
  }

  for (const card of cards) {
    if (!card.isDeleted) {
      reviveChain(card.folderId, card.updatedAt);
    }
  }

  return Array.from(folderMap.values());
}

function mergeSoftDeleteRecords<T extends SoftDeleteRecord>(
  local: T[],
  remote: T[],
  getKey: (item: T) => string,
): T[] {
  const map = new Map<string, T>();

  for (const item of local) {
    map.set(getKey(item), item);
  }

  for (const item of remote) {
    const key = getKey(item);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
      continue;
    }

    const existingDeleted = !!existing.isDeleted;
    const incomingDeleted = !!item.isDeleted;

    if (existingDeleted !== incomingDeleted) {
      const deleted = existingDeleted ? existing : item;
      const alive = existingDeleted ? item : existing;

      if (deleteLosesToLiveEdit(deleted, alive)) {
        map.set(key, alive);
        continue;
      }

      map.set(key, deleted);
      continue;
    }

    if (item.updatedAt > existing.updatedAt) {
      map.set(key, item);
    }
  }

  return Array.from(map.values());
}

function mergeSyncData(local: SyncPayload, remote: SyncPayload): MergedSyncData {
  const mergedFolders = mergeSoftDeleteRecords(
    local.data.folders,
    remote.data.folders ?? [],
    (folder: Folder) => folder.id,
  );
  const mergedCards = mergeSoftDeleteRecords(
    local.data.cards,
    remote.data.cards ?? [],
    (card: FlashCard) => card.id,
  );
  const mergedStates = mergeRecords(
    local.data.cardStates,
    remote.data.cardStates ?? [],
    (state: CardState) => state.cardId,
  );
  const mergedDeckOptions = mergeRecords(
    local.data.deckOptions ?? [],
    remote.data.deckOptions ?? [],
    (options: DeckOptions) => options.folderId,
  );
  const mergedRevlogs = mergeRecords(
    local.data.revlogs ?? [],
    remote.data.revlogs ?? [],
    (log: Revlog) => log.id,
  );
  const reconciledFolders = reviveDeletedFolderChain(mergedFolders, mergedCards);
  const resolvedStates = rebuildCardStates(
    mergedCards,
    mergedStates,
    reconciledFolders,
    mergedDeckOptions,
    mergedRevlogs,
  );

  return {
    folders: reconciledFolders,
    cards: mergedCards,
    cardStates: resolvedStates,
    deckOptions: mergedDeckOptions,
    revlogs: mergedRevlogs,
  };
}

async function mergeAndPersist(remote: SyncPayload): Promise<void> {
  const local = await exportLocal();
  const merged = mergeSyncData(local, remote);

  await db.transaction('rw', [db.folders, db.cards, db.cardStates, db.deckOptions, db.revlogs], async () => {
    await db.folders.bulkPut(merged.folders);
    await db.cards.bulkPut(merged.cards);
    await db.cardStates.bulkPut(merged.cardStates);
    await db.deckOptions.bulkPut(merged.deckOptions);
    await db.revlogs.bulkPut(merged.revlogs);
  });
}

export const syncService = {
  async sync(token: string): Promise<{ pulled: boolean; pushed: boolean }> {
    let pulled = false;
    let pushed = false;

    const fileId = await findSyncFile(token);
    if (fileId) {
      const content = await downloadSyncFile(token, fileId);
      const remote = sanitizeSyncPayload(JSON.parse(content));
      await mergeAndPersist(remote);
      pulled = true;
    }

    const payload = await exportLocal();
    const jsonStr = JSON.stringify(payload);
    await uploadSyncFile(token, jsonStr, fileId ?? undefined);
    pushed = true;

    return { pulled, pushed };
  },
};

export const syncDiagnostics = {
  sanitizeSyncPayload,
  mergeSyncData,
};
