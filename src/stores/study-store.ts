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

  startSession: (folderIds: string[]) => Promise<void>;
  flipCard: () => void;
  rateCard: (rating: Rating) => Promise<void>;
  reset: () => void;
}

export const useStudyStore = create<StudyState>((set, get) => ({
  folderIds: [],
  queue: [],
  currentIndex: 0,
  isFlipped: false,
  counts: { new: 0, learning: 0, review: 0 },
  isLoading: false,
  isComplete: false,

  startSession: async (folderIds: string[]) => {
    set({ isLoading: true, folderIds, isComplete: false, currentIndex: 0, isFlipped: false });
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
    const { queue, currentIndex, folderIds } = get();
    const current = queue[currentIndex];
    if (!current) return;

    const now = new Date();
    await studySessionService.answerCard(current.cardState, rating, now);

    // Reload queue and counts
    const [newQueue, counts] = await Promise.all([
      studySessionService.getStudyQueue(folderIds, now),
      cardStateDao.getStudyCounts(folderIds, now),
    ]);

    if (newQueue.length === 0) {
      set({ isComplete: true, queue: [], counts, isFlipped: false });
    } else {
      set({ queue: newQueue, currentIndex: 0, isFlipped: false, counts });
    }
  },

  reset: () =>
    set({
      folderIds: [],
      queue: [],
      currentIndex: 0,
      isFlipped: false,
      counts: { new: 0, learning: 0, review: 0 },
      isLoading: false,
      isComplete: false,
    }),
}));
