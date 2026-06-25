import { create } from 'zustand';
import { studySessionService } from '@/services/study-session';
import { cardStateDao } from '@/db/card-state-dao';
import { getSchedulerPreferences } from '@/lib/utils';
import type { StudyCard, Rating, StudyCounts } from '@/lib/types';

interface StudyState {
  folderIds: string[];
  rootFolderIds: string[];
  queue: StudyCard[];
  currentIndex: number;
  isFlipped: boolean;
  counts: StudyCounts;
  isLoading: boolean;
  isComplete: boolean;
  isWaiting: boolean;
  nextDueAt: Date | null;
  cardKey: number;

  startSession: (folderIds: string[], rootFolderIds?: string[]) => Promise<void>;
  flipCard: () => void;
  rateCard: (rating: Rating) => Promise<void>;
  reset: () => void;
}

let waitTimer: ReturnType<typeof setTimeout> | null = null;

function clearWaitTimer() {
  if (waitTimer !== null) {
    clearTimeout(waitTimer);
    waitTimer = null;
  }
}

function getLearnWaitDelayMs(nextDue: Date, now: Date): number {
  const schedulerPreferences = getSchedulerPreferences();
  const learnAheadMs = schedulerPreferences.learnAheadMinutes * 60000;
  const remainingMs = Math.max(0, nextDue.getTime() - now.getTime());

  return Math.max(0, remainingMs - learnAheadMs);
}

function getLearnAheadUntil(now: Date): Date {
  const schedulerPreferences = getSchedulerPreferences();
  return new Date(now.getTime() + schedulerPreferences.learnAheadMinutes * 60000);
}

export const useStudyStore = create<StudyState>((set, get) => ({
  folderIds: [],
  rootFolderIds: [],
  queue: [],
  currentIndex: 0,
  isFlipped: false,
  counts: { new: 0, oneMinute: 0, learning: 0, review: 0 },
  isLoading: false,
  isComplete: false,
  isWaiting: false,
  nextDueAt: null,
  cardKey: 0,

  startSession: async (folderIds: string[], rootFolderIds = folderIds) => {
    clearWaitTimer();
    set({
      isLoading: true,
      folderIds,
      rootFolderIds,
      isComplete: false,
      isWaiting: false,
      nextDueAt: null,
      currentIndex: 0,
      isFlipped: false,
    });
    const now = new Date();
    const [queue, counts] = await Promise.all([
      studySessionService.getStudyQueue(folderIds, now, rootFolderIds),
      cardStateDao.getStudyCounts(folderIds, now, rootFolderIds),
    ]);

    if (queue.length === 0) {
      const learnAheadSnapshot = await cardStateDao.getDueSnapshotWithLearnAhead(
        folderIds,
        now,
        getLearnAheadUntil(now),
        rootFolderIds,
      );
      if (learnAheadSnapshot.queue.length > 0) {
        set({ isLoading: false, queue: learnAheadSnapshot.queue, counts: learnAheadSnapshot.counts });
        return;
      }

      const nextDue = await cardStateDao.getNextLearnDue(folderIds, now);
      if (nextDue) {
        const delay = getLearnWaitDelayMs(nextDue, now);
        const availableAt = new Date(now.getTime() + delay);
        set({ isLoading: false, isWaiting: true, nextDueAt: availableAt, queue: [], counts, isFlipped: false });
        waitTimer = setTimeout(async () => {
          waitTimer = null;
          const reloadNow = new Date();
          const { folderIds: currentFolderIds, rootFolderIds: currentRootFolderIds } = get();
          const { queue: reloadQueue, counts: reloadCounts } = await cardStateDao.getDueSnapshotWithLearnAhead(
            currentFolderIds,
            reloadNow,
            getLearnAheadUntil(reloadNow),
            currentRootFolderIds,
          );
          if (reloadQueue.length === 0) {
            set({ isComplete: true, isWaiting: false, nextDueAt: null, queue: [], counts: reloadCounts });
          } else {
            set({ isWaiting: false, nextDueAt: null, queue: reloadQueue, currentIndex: 0, isFlipped: false, counts: reloadCounts, cardKey: get().cardKey + 1 });
          }
        }, delay);
      } else {
        set({ isLoading: false, isComplete: true, queue: [], counts });
      }
    } else {
      set({ isLoading: false, queue, counts });
    }
  },

  flipCard: () => set({ isFlipped: true }),

  rateCard: async (rating: Rating) => {
    clearWaitTimer();
    const { queue, currentIndex, folderIds, rootFolderIds } = get();
    const current = queue[currentIndex];
    if (!current) return;

    const now = new Date();
    await studySessionService.answerCard(current, rating, now);

    const [newQueue, counts] = await Promise.all([
      studySessionService.getStudyQueue(folderIds, now, rootFolderIds),
      cardStateDao.getStudyCounts(folderIds, now, rootFolderIds),
    ]);

    if (newQueue.length === 0) {
      // Check if there are learning cards coming up soon
      const learnAheadSnapshot = await cardStateDao.getDueSnapshotWithLearnAhead(
        folderIds,
        now,
        getLearnAheadUntil(now),
        rootFolderIds,
      );
      if (learnAheadSnapshot.queue.length > 0) {
        set({ queue: learnAheadSnapshot.queue, currentIndex: 0, isFlipped: false, counts: learnAheadSnapshot.counts, cardKey: get().cardKey + 1 });
        return;
      }

      const nextDue = await cardStateDao.getNextLearnDue(folderIds, now);
      if (nextDue) {
        const delay = getLearnWaitDelayMs(nextDue, now);
        const availableAt = new Date(now.getTime() + delay);
        set({ isWaiting: true, nextDueAt: availableAt, queue: [], counts, isFlipped: false, cardKey: get().cardKey + 1 });
        waitTimer = setTimeout(async () => {
          waitTimer = null;
          const reloadNow = new Date();
          const { folderIds: currentFolderIds, rootFolderIds: currentRootFolderIds } = get();
          const { queue: reloadQueue, counts: reloadCounts } = await cardStateDao.getDueSnapshotWithLearnAhead(
            currentFolderIds,
            reloadNow,
            getLearnAheadUntil(reloadNow),
            currentRootFolderIds,
          );
          if (reloadQueue.length === 0) {
            set({ isComplete: true, isWaiting: false, nextDueAt: null, queue: [], counts: reloadCounts });
          } else {
            set({ isWaiting: false, nextDueAt: null, queue: reloadQueue, currentIndex: 0, isFlipped: false, counts: reloadCounts, cardKey: get().cardKey + 1 });
          }
        }, delay);
      } else {
        set({ isComplete: true, queue: [], counts, isFlipped: false });
      }
    } else {
      set({ queue: newQueue, currentIndex: 0, isFlipped: false, counts, cardKey: get().cardKey + 1 });
    }
  },

  reset: () => {
    clearWaitTimer();
    set({
      folderIds: [],
      rootFolderIds: [],
      queue: [],
      currentIndex: 0,
      isFlipped: false,
      counts: { new: 0, oneMinute: 0, learning: 0, review: 0 },
      isLoading: false,
      isComplete: false,
      isWaiting: false,
      nextDueAt: null,
      cardKey: 0,
    });
  },
}));
