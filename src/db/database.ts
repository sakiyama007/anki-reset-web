import Dexie, { type Table } from 'dexie';
import type { Folder, FlashCard, CardState } from '@/lib/types';

class AnkiResetDB extends Dexie {
  folders!: Table<Folder, string>;
  cards!: Table<FlashCard, string>;
  cardStates!: Table<CardState, string>;

  constructor() {
    super('anki-reset');
    this.version(1).stores({
      folders: 'id, parentId, name, updatedAt',
      cards: 'id, folderId, createdAt, updatedAt',
      cardStates: 'cardId, state, due, updatedAt',
    });
  }
}

export const db = new AnkiResetDB();
