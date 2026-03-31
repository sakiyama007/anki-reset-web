import { cardStateDao } from '@/db/card-state-dao';
import { processRating } from './sm2-engine';
import type { CardState, Rating, StudyCard } from '@/lib/types';

export const studySessionService = {
  async getStudyQueue(folderIds: string[], now: Date): Promise<StudyCard[]> {
    return cardStateDao.getDueCards(folderIds, now);
  },

  async answerCard(current: CardState, rating: Rating, now: Date): Promise<CardState> {
    const newState = processRating(current, rating, now);
    await cardStateDao.update(newState);
    return newState;
  },
};
