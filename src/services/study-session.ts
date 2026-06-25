import { cardStateDao } from '@/db/card-state-dao';
import { revlogDao } from '@/db/revlog-dao';
import { db } from '@/db/database';
import { syncOutboxDao } from '@/db/sync-outbox-dao';
import { syncService } from '@/services/sync-service';
import { processRating } from './sm2-engine';
import { generateId, getDeviceId, getSchedulerPreferences } from '@/lib/utils';
import type { CardState, DeckOptionsSnapshot, Rating, Revlog, StudyCard } from '@/lib/types';

function toDeckOptionsSnapshot(card: StudyCard): DeckOptionsSnapshot {
  const {
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
  } = card.deckOptions;

  return {
    learningStepsMinutes: [...learningStepsMinutes],
    graduatingInterval,
    easyGraduationInterval,
    initialEaseFactor,
    hardMultiplier,
    easyBonus,
    intervalModifier,
    maximumInterval,
    relearningStepsMinutes: [...relearningStepsMinutes],
    lapseNewInterval,
    minimumLapseInterval,
    minEaseFactor,
  };
}

export function shouldSuspendLeechCard(current: StudyCard, rating: Rating, newState: CardState): boolean {
  return current.cardState.state === 'review'
    && rating === 'again'
    && current.cardState.lapseCount < current.deckOptions.leechThreshold
    && newState.lapseCount >= current.deckOptions.leechThreshold;
}

export const studySessionService = {
  async getStudyQueue(folderIds: string[], now: Date, rootFolderIds: string[] = folderIds): Promise<StudyCard[]> {
    return cardStateDao.getDueCards(folderIds, now, rootFolderIds);
  },

  async answerCard(current: StudyCard, rating: Rating, now: Date): Promise<CardState> {
    const schedulerPreferences = getSchedulerPreferences();
    const newState = processRating(
      current.cardState,
      rating,
      now,
      current.deckOptions,
      schedulerPreferences,
    );
    const reviewedAt = now.toISOString();
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
      schedulerSnapshot: {
        nextDayStartsHour: schedulerPreferences.nextDayStartsHour,
      },
      deckOptionsSnapshot: toDeckOptionsSnapshot(current),
      previousCardStateSnapshot: { ...current.cardState },
      newCardStateSnapshot: { ...newState },
    };

    const shouldSuspendLeech = shouldSuspendLeechCard(current, rating, newState);

    await db.transaction('rw', [db.cards, db.cardStates, db.revlogs, db.syncOutbox], async () => {
      await cardStateDao.update(newState);
      await revlogDao.insert(revlog);
      await syncOutboxDao.enqueueRevlog(revlog.id, reviewedAt);
      if (shouldSuspendLeech) {
        await db.cards.update(current.card.id, {
          isSuspended: true,
          isLeech: true,
          updatedAt: reviewedAt,
        });
      }
    });

    syncService.scheduleAutoSync();

    return newState;
  },
};
