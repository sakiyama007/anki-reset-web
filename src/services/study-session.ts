import { cardStateDao } from '@/db/card-state-dao';
import { revlogDao } from '@/db/revlog-dao';
import { db } from '@/db/database';
import { processRating } from './sm2-engine';
import { generateId, getDeviceId, nowISO } from '@/lib/utils';
import type { CardState, Rating, Revlog, StudyCard } from '@/lib/types';

export const studySessionService = {
  async getStudyQueue(folderIds: string[], now: Date, rootFolderIds: string[] = folderIds): Promise<StudyCard[]> {
    return cardStateDao.getDueCards(folderIds, now, rootFolderIds);
  },

  async answerCard(current: StudyCard, rating: Rating, now: Date): Promise<CardState> {
    const newState = processRating(current.cardState, rating, now, current.deckOptions);
    const reviewedAt = nowISO();
    const deviceId = getDeviceId();

    const revlog: Revlog = {
      id: generateId(),
      cardId: current.card.id,
      folderId: current.card.folderId,
      rating,
      previousState: current.cardState.state,
      newState: newState.state,
      previousInterval: current.cardState.interval,
      newInterval: newState.interval,
      previousDue: current.cardState.due,
      newDue: newState.due,
      reviewedAt,
      updatedAt: reviewedAt,
      deviceId,
    };

    const shouldSuspendLeech =
      current.cardState.state === 'review' &&
      rating === 'again' &&
      current.cardState.lapseCount < current.deckOptions.leechThreshold &&
      newState.lapseCount >= current.deckOptions.leechThreshold;

    await db.transaction('rw', [db.cards, db.cardStates, db.revlogs], async () => {
      await cardStateDao.update(newState);
      await revlogDao.insert(revlog);
      if (shouldSuspendLeech) {
        await db.cards.update(current.card.id, {
          isSuspended: true,
          isLeech: true,
          updatedAt: reviewedAt,
        });
      }
    });

    return newState;
  },
};
