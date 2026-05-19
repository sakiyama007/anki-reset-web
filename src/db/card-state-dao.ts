import { db } from './database';
import { deckOptionsDao } from './deck-options-dao';
import { revlogDao } from './revlog-dao';
import type { CardState, DeckOptions, FlashCard, Folder, Revlog, StudyCard, StudyCounts } from '@/lib/types';
import { getSchedulerPreferences, jstDayStart } from '@/lib/utils';

type DueCandidate = StudyCard & {
  isInterdayLearning: boolean;
  priority: number;
  sortSeed: number;
  limitDeckIds: string[];
};

function stableHash(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function compareNewCards(
  a: DueCandidate,
  b: DueCandidate,
  newCardInsertionOrder: DeckOptions['newCardInsertionOrder'],
): number {
  if (newCardInsertionOrder === 'random') {
    return a.sortSeed - b.sortSeed;
  }
  const created = a.card.createdAt.localeCompare(b.card.createdAt);
  if (created !== 0) return created;
  return a.card.id.localeCompare(b.card.id);
}

function compareReviewCards(
  a: DueCandidate,
  b: DueCandidate,
  reviewSortOrder: DeckOptions['reviewSortOrder'],
): number {
  const due = a.cardState.due.localeCompare(b.cardState.due);
  if (due !== 0) return due;

  if (reviewSortOrder === 'dueAscRandom') {
    return a.sortSeed - b.sortSeed;
  }

  return a.card.id.localeCompare(b.card.id);
}

function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function getLimitDeckIds(
  folderId: string,
  selectedRootIds: Set<string>,
  folderMap: Map<string, Folder>,
): string[] {
  const chain: string[] = [];
  let currentId: string | null = folderId;

  while (currentId) {
    chain.push(currentId);
    if (selectedRootIds.has(currentId)) {
      return chain.reverse();
    }
    currentId = folderMap.get(currentId)?.parentId ?? null;
  }

  return [folderId];
}

function normalizeRootIds(rootFolderIds: string[], folderMap: Map<string, Folder>): Set<string> {
  const uniqueRootIds = [...new Set(rootFolderIds)];
  const requestedRootIds = new Set(uniqueRootIds);

  return new Set(
    uniqueRootIds.filter((folderId) => {
      let currentId = folderMap.get(folderId)?.parentId ?? null;
      while (currentId) {
        if (requestedRootIds.has(currentId)) {
          return false;
        }
        currentId = folderMap.get(currentId)?.parentId ?? null;
      }
      return true;
    }),
  );
}

function buildDailyUsage(
  logs: Revlog[],
  selectedRootIds: Set<string>,
  folderMap: Map<string, Folder>,
): {
  newByDeck: Map<string, number>;
  reviewByDeck: Map<string, number>;
} {
  const newSeen = new Set<string>();
  const newByDeck = new Map<string, number>();
  const reviewByDeck = new Map<string, number>();

  for (const log of logs) {
    const limitDeckIds = getLimitDeckIds(log.folderId, selectedRootIds, folderMap);

    if (log.previousState === 'newCard') {
      for (const deckId of limitDeckIds) {
        const key = `${deckId}:${log.cardId}`;
        if (newSeen.has(key)) continue;
        newSeen.add(key);
        increment(newByDeck, deckId);
      }
      continue;
    }

    if (log.previousState === 'review' || isInterdayLearningReviewLog(log)) {
      for (const deckId of limitDeckIds) {
        increment(reviewByDeck, deckId);
      }
    }
  }

  return { newByDeck, reviewByDeck };
}

function isInterdayLearningReviewLog(log: Revlog): boolean {
  if (log.previousState !== 'learning' && log.previousState !== 'relearning') {
    return false;
  }

  const nextDayStartsHour = log.schedulerSnapshot?.nextDayStartsHour ?? getSchedulerPreferences().nextDayStartsHour;
  return log.previousDue === jstDayStart(new Date(log.previousDue), nextDayStartsHour).toISOString();
}

function isLimitReached(
  limitDeckIds: string[],
  usage: Map<string, number>,
  deckOptionsByFolder: Map<string, DeckOptions>,
  type: 'newCard' | 'review',
): boolean {
  return limitDeckIds.some((deckId) => {
    const options = deckOptionsByFolder.get(deckId);
    if (!options) return false;
    const limit = type === 'newCard' ? options.newCardsPerDay : options.maxReviewsPerDay;
    return (usage.get(deckId) ?? 0) >= limit;
  });
}

function consumeLimit(map: Map<string, number>, limitDeckIds: string[]): void {
  for (const deckId of limitDeckIds) {
    increment(map, deckId);
  }
}

function isInterdayLearningState(state: StudyCard['cardState'], schedulerPreferences: ReturnType<typeof getSchedulerPreferences>): boolean {
  if (state.state !== 'learning' && state.state !== 'relearning') {
    return false;
  }

  return state.due === jstDayStart(new Date(state.due), schedulerPreferences.nextDayStartsHour).toISOString();
}

type DueSnapshotInput = {
  folderIds: string[];
  rootFolderIds?: string[];
  now: Date;
  learnAheadUntil?: Date;
  cards: FlashCard[];
  states: CardState[];
  folders: Folder[];
  logs: Revlog[];
  deckOptionsByFolder: Map<string, DeckOptions>;
};

export function buildDueSnapshotFromData({
  folderIds,
  rootFolderIds = folderIds,
  now,
  learnAheadUntil,
  cards,
  states,
  folders,
  logs,
  deckOptionsByFolder,
}: DueSnapshotInput): {
  queue: StudyCard[];
  counts: StudyCounts;
} {
  const uniqueFolderIds = [...new Set(folderIds)];
  const uniqueRootFolderIds = [...new Set(rootFolderIds)];

  if (uniqueFolderIds.length === 0) {
    return { queue: [], counts: { new: 0, learning: 0, review: 0 } };
  }

  const schedulerPreferences = getSchedulerPreferences();
  const nowIso = now.toISOString();
  const learnAheadIso = learnAheadUntil?.toISOString();
  const today = jstDayStart(now, schedulerPreferences.nextDayStartsHour).toISOString();

  const availableCards = cards.filter((card) => !card.isDeleted && !card.isSuspended);
  if (availableCards.length === 0) {
    return { queue: [], counts: { new: 0, learning: 0, review: 0 } };
  }

  const folderMap = new Map(folders.map((folder) => [folder.id, folder]));
  const selectedRootIds = normalizeRootIds(
    uniqueRootFolderIds.length > 0 ? uniqueRootFolderIds : uniqueFolderIds,
    folderMap,
  );
  const limitDeckIdsByFolder = new Map<string, string[]>();

  for (const card of availableCards) {
    if (!limitDeckIdsByFolder.has(card.folderId)) {
      limitDeckIdsByFolder.set(
        card.folderId,
        getLimitDeckIds(card.folderId, selectedRootIds, folderMap),
      );
    }
  }

  const sessionDeckId = uniqueRootFolderIds[0] ?? uniqueFolderIds[0];
  const availableCardIds = new Set(availableCards.map((card) => card.id));
  const cardMap = new Map(availableCards.map((card) => [card.id, card]));
  const relevantStates = states.filter((state) => availableCardIds.has(state.cardId));
  const sessionDeckOptions = deckOptionsByFolder.get(sessionDeckId)
    ?? deckOptionsDao.normalize(sessionDeckId);
  const { newByDeck, reviewByDeck } = buildDailyUsage(logs, selectedRootIds, folderMap);

  const rawCandidates: DueCandidate[] = [];

  for (const state of relevantStates) {
    const card = cardMap.get(state.cardId);
    if (!card) continue;

    const isInterdayLearning = isInterdayLearningState(state as StudyCard['cardState'], schedulerPreferences);
    let isDue = false;
    let priority = 5;

    const isIntradayLearningDue =
      !isInterdayLearning
      && state.due <= nowIso;
    const isIntradayLearningAhead =
      !isInterdayLearning
      && !!learnAheadIso
      && state.due > nowIso
      && state.due <= learnAheadIso;

    if (state.state === 'relearning' && (isIntradayLearningDue || isIntradayLearningAhead)) {
      isDue = true;
      priority = 0;
    } else if (state.state === 'learning' && (isIntradayLearningDue || isIntradayLearningAhead)) {
      isDue = true;
      priority = 1;
    } else if (isInterdayLearning && state.due <= today) {
      isDue = true;
      priority = 2;
    } else if (state.state === 'review' && state.due <= today) {
      isDue = true;
      priority = 3;
    } else if (state.state === 'newCard') {
      isDue = true;
      priority = 4;
    }

    if (!isDue) continue;

    rawCandidates.push({
      card,
      cardState: state,
      deckOptions: deckOptionsByFolder.get(card.folderId) ?? deckOptionsDao.normalize(card.folderId),
      isInterdayLearning,
      priority,
      sortSeed: stableHash(card.id),
      limitDeckIds: limitDeckIdsByFolder.get(card.folderId) ?? [card.folderId],
    });
  }

  rawCandidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;

    if (a.priority === 3) {
      return compareReviewCards(a, b, sessionDeckOptions.reviewSortOrder);
    }
    if (a.priority === 4) {
      return compareNewCards(a, b, sessionDeckOptions.newCardInsertionOrder);
    }
    return a.cardState.due.localeCompare(b.cardState.due);
  });

  const newUsage = new Map(newByDeck);
  const reviewUsage = new Map(reviewByDeck);
  const queue: StudyCard[] = [];
  const counts: StudyCounts = { new: 0, learning: 0, review: 0 };

  for (const candidate of rawCandidates) {
    if (candidate.cardState.state === 'newCard') {
      if (isLimitReached(candidate.limitDeckIds, newUsage, deckOptionsByFolder, 'newCard')) {
        continue;
      }
      consumeLimit(newUsage, candidate.limitDeckIds);
      counts.new += 1;
    } else if (candidate.cardState.state === 'review' || candidate.isInterdayLearning) {
      if (isLimitReached(candidate.limitDeckIds, reviewUsage, deckOptionsByFolder, 'review')) {
        continue;
      }
      consumeLimit(reviewUsage, candidate.limitDeckIds);
      counts.review += 1;
    } else {
      counts.learning += 1;
    }

    queue.push({
      card: candidate.card,
      cardState: candidate.cardState,
      deckOptions: candidate.deckOptions,
    });
  }

  return { queue, counts };
}

async function buildDueSnapshot(
  folderIds: string[],
  now: Date,
  rootFolderIds: string[] = folderIds,
  learnAheadUntil?: Date,
): Promise<{
  queue: StudyCard[];
  counts: StudyCounts;
}> {
  const uniqueFolderIds = [...new Set(folderIds)];
  const uniqueRootFolderIds = [...new Set(rootFolderIds)];

  if (uniqueFolderIds.length === 0) {
    return { queue: [], counts: { new: 0, learning: 0, review: 0 } };
  }

  const cards = (await db.cards.where('folderId').anyOf(uniqueFolderIds).toArray())
    .filter((card) => !card.isDeleted && !card.isSuspended);
  if (cards.length === 0) {
    return { queue: [], counts: { new: 0, learning: 0, review: 0 } };
  }

  const folders = await db.folders.toArray();
  const folderMap = new Map(folders.map((folder) => [folder.id, folder]));
  const selectedRootIds = normalizeRootIds(
    uniqueRootFolderIds.length > 0 ? uniqueRootFolderIds : uniqueFolderIds,
    folderMap,
  );
  const limitDeckIdsByFolder = new Map<string, string[]>();

  for (const card of cards) {
    if (!limitDeckIdsByFolder.has(card.folderId)) {
      limitDeckIdsByFolder.set(
        card.folderId,
        getLimitDeckIds(card.folderId, selectedRootIds, folderMap),
      );
    }
  }

  const allLimitDeckIds = [
    ...new Set(Array.from(limitDeckIdsByFolder.values()).flat()),
  ];
  const sessionDeckId = uniqueRootFolderIds[0] ?? uniqueFolderIds[0];
  const cardIds = cards.map((card) => card.id);
  const states = await db.cardStates.where('cardId').anyOf(cardIds).toArray();
  const deckOptionsByFolder = await deckOptionsDao.getEffectiveMap([
    ...allLimitDeckIds,
    sessionDeckId,
  ]);
  const logs = await revlogDao.getDailyLogs(cards.map((card) => card.folderId), now);
  return buildDueSnapshotFromData({
    folderIds: uniqueFolderIds,
    rootFolderIds: uniqueRootFolderIds,
    now,
    cards,
    states,
    folders,
    logs,
    deckOptionsByFolder,
    learnAheadUntil,
  });
}

export const cardStateDao = {
  async insert(state: StudyCard['cardState']): Promise<void> {
    await db.cardStates.add(state);
  },

  async update(state: StudyCard['cardState']): Promise<void> {
    await db.cardStates.put(state);
  },

  async getByCardId(cardId: string) {
    return db.cardStates.get(cardId);
  },

  async getDueCards(folderIds: string[], now: Date, rootFolderIds: string[] = folderIds): Promise<StudyCard[]> {
    const snapshot = await buildDueSnapshot(folderIds, now, rootFolderIds);
    return snapshot.queue;
  },

  async getDueSnapshotWithLearnAhead(
    folderIds: string[],
    now: Date,
    learnAheadUntil: Date,
    rootFolderIds: string[] = folderIds,
  ): Promise<{ queue: StudyCard[]; counts: StudyCounts }> {
    return buildDueSnapshot(folderIds, now, rootFolderIds, learnAheadUntil);
  },

  async getNextLearnDue(folderIds: string[], now: Date): Promise<Date | null> {
    if (folderIds.length === 0) return null;

    const cards = (await db.cards.where('folderId').anyOf(folderIds).toArray())
      .filter((card) => !card.isDeleted && !card.isSuspended);
    if (cards.length === 0) return null;

    const cardIds = cards.map((card) => card.id);
    const states = await db.cardStates.where('cardId').anyOf(cardIds).toArray();

    const nowIso = now.toISOString();
    let earliest: Date | null = null;

    for (const state of states) {
      if ((state.state === 'learning' || state.state === 'relearning') && state.due > nowIso) {
        const due = new Date(state.due);
        if (!earliest || due < earliest) earliest = due;
      }
    }

    return earliest;
  },

  async getStudyCounts(folderIds: string[], now: Date, rootFolderIds: string[] = folderIds): Promise<StudyCounts> {
    const snapshot = await buildDueSnapshot(folderIds, now, rootFolderIds);
    return snapshot.counts;
  },
};
