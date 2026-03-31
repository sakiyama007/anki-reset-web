import { db } from './database';
import type { FlashCard, CardState } from '@/lib/types';
import { generateId, nowISO } from '@/lib/utils';
import { AppConstants } from '@/lib/constants';

export const cardDao = {
  async insert(front: string, back: string, folderId: string): Promise<FlashCard> {
    const now = nowISO();
    const card: FlashCard = {
      id: generateId(),
      front,
      back,
      folderId,
      createdAt: now,
      updatedAt: now,
    };
    const state: CardState = {
      cardId: card.id,
      state: 'newCard',
      stepIndex: 0,
      due: now,
      interval: 0,
      easeFactor: AppConstants.initialEaseFactor,
      repetition: 0,
      lapseCount: 0,
      updatedAt: now,
    };

    await db.transaction('rw', [db.cards, db.cardStates], async () => {
      await db.cards.add(card);
      await db.cardStates.add(state);
    });

    return card;
  },

  async insertBatch(cards: Array<{ front: string; back: string; folderId: string }>): Promise<void> {
    const now = nowISO();
    const flashCards: FlashCard[] = [];
    const states: CardState[] = [];

    for (const c of cards) {
      const id = generateId();
      flashCards.push({
        id,
        front: c.front,
        back: c.back,
        folderId: c.folderId,
        createdAt: now,
        updatedAt: now,
      });
      states.push({
        cardId: id,
        state: 'newCard',
        stepIndex: 0,
        due: now,
        interval: 0,
        easeFactor: AppConstants.initialEaseFactor,
        repetition: 0,
        lapseCount: 0,
        updatedAt: now,
      });
    }

    await db.transaction('rw', [db.cards, db.cardStates], async () => {
      await db.cards.bulkAdd(flashCards);
      await db.cardStates.bulkAdd(states);
    });
  },

  async update(card: FlashCard): Promise<void> {
    await db.cards.put({ ...card, updatedAt: nowISO() });
  },

  async delete(id: string): Promise<void> {
    await db.transaction('rw', [db.cards, db.cardStates], async () => {
      await db.cardStates.delete(id);
      await db.cards.delete(id);
    });
  },

  async deleteBatch(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await db.transaction('rw', [db.cards, db.cardStates], async () => {
      await db.cardStates.where('cardId').anyOf(ids).delete();
      await db.cards.where('id').anyOf(ids).delete();
    });
  },

  async moveToFolder(cardIds: string[], folderId: string): Promise<void> {
    const now = nowISO();
    await db.transaction('rw', db.cards, async () => {
      for (const id of cardIds) {
        await db.cards.update(id, { folderId, updatedAt: now });
      }
    });
  },

  async getById(id: string): Promise<FlashCard | undefined> {
    return db.cards.get(id);
  },

  async getByFolder(
    folderId: string,
    limit = AppConstants.pageSize,
    offset = 0,
  ): Promise<FlashCard[]> {
    return db.cards
      .where('folderId')
      .equals(folderId)
      .reverse()
      .offset(offset)
      .limit(limit)
      .sortBy('createdAt')
      .then(arr => arr.reverse());
  },

  async search(
    query: string,
    folderId?: string,
    limit = AppConstants.pageSize,
    offset = 0,
  ): Promise<FlashCard[]> {
    const lowerQ = query.toLowerCase();
    const collection = folderId
      ? db.cards.where('folderId').equals(folderId)
      : db.cards.toCollection();

    const all = await collection.toArray();
    const filtered = all.filter(
      c => c.front.toLowerCase().includes(lowerQ) || c.back.toLowerCase().includes(lowerQ),
    );
    filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return filtered.slice(offset, offset + limit);
  },

  async getCountByFolder(folderId: string): Promise<number> {
    return db.cards.where('folderId').equals(folderId).count();
  },

  async getTotalCount(): Promise<number> {
    return db.cards.count();
  },
};
