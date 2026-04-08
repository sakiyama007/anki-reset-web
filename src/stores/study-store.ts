import { create } from 'zustand';
import { studySessionService } from '@/services/study-session';
import { cardStateDao } from '@/db/card-state-dao';
import type { StudyCard, Rating, StudyCounts } from '@/lib/types';

interface StudyState {
  folderIds: string[];
  queue: StudyCard[];
  currentIndex: number;
  isFlipped: boolean;
  counts: StudyCounts;
  isLoading: boolean;
  isComplete: boolean;
  isWaiting: boolean;
  nextDueAt: Date | null;
  cardKey: number;

  startSession: (folderIds: string[]) => Promise<void>;
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

export const useStudyStore = create<StudyState>((set, get) => ({
  folderIds: [],
  queue: [],
  currentIndex: 0,
  isFlipped: false,
  counts: { new: 0, learning: 0, review: 0 },
  isLoading: false,
  isComplete: false,
  isWaiting: false,
  nextDueAt: null,
  cardKey: 0,

  startSession: async (folderIds: string[]) => {
    clearWaitTimer();
    set({ isLoading: true, folderIds, isComplete: false, isWaiting: false, nextDueAt: null, currentIndex: 0, isFlipped: false });
    const now = new Date();
    const [queue, counts] = await Promise.all([
      studySessionService.getStudyQueue(folderIds, now),
      cardStateDao.getStudyCounts(folderIds, now),
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
    const { queue, currentIndex, folderIds } = get();
    const current = queue[currentIndex];
    if (!current) return;

    const now = new Date();
    await studySessionService.answerCard(current.cardState, rating, now);

    const [newQueue, counts] = await Promise.all([
      studySessionService.getStudyQueue(folderIds, now),
      cardStateDao.getStudyCounts(folderIds, now),
    ]);

    if (newQueue.length === 0) {
      // Check if there are learning cards coming up soon
      const nextDue = await cardStateDao.getNextLearnDue(folderIds, now);
      if (nextDue) {
        const delay = Math.max(0, nextDue.getTime() - Date.now());
        set({ isWaiting: true, nextDueAt: nextDue, queue: [], counts, isFlipped: false, cardKey: get().cardKey + 1 });
        waitTimer = setTimeout(async () => {
          waitTimer = null;
          const reloadNow = new Date();
          const currentFolderIds = get().folderIds;
          const [reloadQueue, reloadCounts] = await Promise.all([
            studySessionService.getStudyQueue(currentFolderIds, reloadNow),
            cardStateDao.getStudyCounts(currentFolderIds, reloadNow),
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
