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
    // v2: add isDeleted index for soft-delete support
    this.version(2).stores({
      folders: 'id, parentId, name, updatedAt, isDeleted',
      cards: 'id, folderId, createdAt, updatedAt, isDeleted',
      cardStates: 'cardId, state, due, updatedAt',
    });
  }
}

export const db = new AnkiResetDB();
