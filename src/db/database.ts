import Dexie, { type Table } from 'dexie';
import type { Folder, FlashCard, CardState, DeckOptions, Revlog, SyncOutboxItem } from '@/lib/types';

class AnkiResetDB extends Dexie {
  folders!: Table<Folder, string>;
  cards!: Table<FlashCard, string>;
  cardStates!: Table<CardState, string>;
  deckOptions!: Table<DeckOptions, string>;
  revlogs!: Table<Revlog, string>;
  syncOutbox!: Table<SyncOutboxItem, string>;

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
    this.version(3).stores({
      folders: 'id, parentId, name, updatedAt, isDeleted',
      cards: 'id, folderId, createdAt, updatedAt, isDeleted, isSuspended',
      cardStates: 'cardId, state, due, updatedAt',
      deckOptions: 'folderId, updatedAt',
      revlogs: 'id, cardId, folderId, reviewedAt, updatedAt',
    });
    this.version(4).stores({
      folders: 'id, parentId, name, updatedAt, isDeleted',
      cards: 'id, folderId, createdAt, updatedAt, isDeleted, isSuspended',
      cardStates: 'cardId, state, due, updatedAt',
      deckOptions: 'folderId, updatedAt',
      revlogs: 'id, cardId, folderId, reviewedAt, updatedAt',
      syncOutbox: 'id, itemType, itemId, status, updatedAt',
    });
  }
}

export const db = new AnkiResetDB();
