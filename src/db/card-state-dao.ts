import { db } from './database';
import type { CardState, StudyCard, StudyCounts } from '@/lib/types';
import { AppConstants } from '@/lib/constants';

export const cardStateDao = {
  async insert(state: CardState): Promise<void> {
    await db.cardStates.add(state);
  },

  async update(state: CardState): Promise<void> {
    await db.cardStates.put(state);
  },

  async getByCardId(cardId: string): Promise<CardState | undefined> {
    return db.cardStates.get(cardId);
  },

  async getDueCards(folderIds: string[], now: Date): Promise<StudyCard[]> {
    if (folderIds.length === 0) return [];

    const learnAhead = new Date(now.getTime() + AppConstants.learnAheadMinutes * 60000).toISOString();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    // Get all cards in the given folders
    const cards = await db.cards.where('folderId').anyOf(folderIds).toArray();
    if (cards.length === 0) return [];

    const cardMap = new Map(cards.map(c => [c.id, c]));
    const cardIds = cards.map(c => c.id);

    // Get all card states for these cards
    const states = await db.cardStates.where('cardId').anyOf(cardIds).toArray();

    // Filter due cards
    const dueStudyCards: Array<StudyCard & { priority: number }> = [];

    for (const state of states) {
      const card = cardMap.get(state.cardId);
      if (!card) continue;

      let isDue = false;
      let priority = 4;

      if (state.state === 'relearning' && state.due <= learnAhead) {
        isDue = true;
        priority = 0;
      } else if (state.state === 'learning' && state.due <= learnAhead) {
        isDue = true;
        priority = 1;
      } else if (state.state === 'review' && state.due <= today) {
        isDue = true;
        priority = 2;
      } else if (state.state === 'newCard') {
        isDue = true;
        priority = 3;
      }

      if (isDue) {
        dueStudyCards.push({ card, cardState: state, priority });
      }
    }

    // Sort by priority, then by due date
    dueStudyCards.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.cardState.due.localeCompare(b.cardState.due);
    });

    return dueStudyCards.map(({ card, cardState }) => ({ card, cardState }));
  },

  async getStudyCounts(folderIds: string[], now: Date): Promise<StudyCounts> {
    if (folderIds.length === 0) return { new: 0, learning: 0, review: 0 };

    const learnAhead = new Date(now.getTime() + AppConstants.learnAheadMinutes * 60000).toISOString();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const cards = await db.cards.where('folderId').anyOf(folderIds).toArray();
    const cardIds = cards.map(c => c.id);
    if (cardIds.length === 0) return { new: 0, learning: 0, review: 0 };

    const states = await db.cardStates.where('cardId').anyOf(cardIds).toArray();

    let newCount = 0, learningCount = 0, reviewCount = 0;
    for (const s of states) {
      if (s.state === 'newCard') newCount++;
      else if ((s.state === 'learning' || s.state === 'relearning') && s.due <= learnAhead) learningCount++;
      else if (s.state === 'review' && s.due <= today) reviewCount++;
    }

    return { new: newCount, learning: learningCount, review: reviewCount };
  },
};
