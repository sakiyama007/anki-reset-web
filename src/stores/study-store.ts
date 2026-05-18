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
const SHORT_WAIT_THRESHOLD_MS = 60 * 1000;
const MIN_LEARN_AHEAD_DELAY_MS = 1000;

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

  if (remainingMs <= SHORT_WAIT_THRESHOLD_MS) {
    return Math.max(MIN_LEARN_AHEAD_DELAY_MS, remainingMs - learnAheadMs);
  }

  return Math.max(MIN_LEARN_AHEAD_DELAY_MS, remainingMs);
}

export const useStudyStore = create<StudyState>((set, get) => ({
  folderIds: [],
  rootFolderIds: [],
  queue: [],
  currentIndex: 0,
  isFlipped: false,
  counts: { new: 0, learning: 0, review: 0 },
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
      set({ isLoading: false, isComplete: true, queue: [], counts });
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
      const nextDue = await cardStateDao.getNextLearnDue(folderIds, now);
      if (nextDue) {
        const delay = getLearnWaitDelayMs(nextDue, now);
        const availableAt = new Date(now.getTime() + delay);
        set({ isWaiting: true, nextDueAt: availableAt, queue: [], counts, isFlipped: false, cardKey: get().cardKey + 1 });
        waitTimer = setTimeout(async () => {
          waitTimer = null;
          const reloadNow = new Date();
          const { folderIds: currentFolderIds, rootFolderIds: currentRootFolderIds } = get();
          const [reloadQueue, reloadCounts] = await Promise.all([
            studySessionService.getStudyQueue(currentFolderIds, reloadNow, currentRootFolderIds),
            cardStateDao.getStudyCounts(currentFolderIds, reloadNow, currentRootFolderIds),
          ]);
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
      counts: { new: 0, learning: 0, review: 0 },
      isLoading: false,
      isComplete: false,
      isWaiting: false,
      nextDueAt: null,
      cardKey: 0,
    });
  },
}));
