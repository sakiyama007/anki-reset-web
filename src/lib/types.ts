export type CardStudyState = 'newCard' | 'learning' | 'review' | 'relearning';
export type Rating = 'again' | 'hard' | 'good' | 'easy';

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  isDeleted?: boolean;
}

export interface FlashCard {
  id: string;
  front: string;
  back: string;
  folderId: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  isDeleted?: boolean;
}

export interface CardState {
  cardId: string;
  state: CardStudyState;
  stepIndex: number;
  due: string; // ISO 8601
  interval: number; // days
  easeFactor: number;
  repetition: number;
  lapseCount: number;
  updatedAt: string; // ISO 8601
}

export interface StudyCard {
  card: FlashCard;
  cardState: CardState;
}

export interface FolderInfo {
  folder: Folder;
  cardCount: number;
  subfolderCount: number;
  newCount: number;
  learningCount: number;
  reviewCount: number;
}

export interface StudyCounts {
  new: number;
  learning: number;
  review: number;
}

export interface SyncPayload {
  version: 1;
  exportedAt: string;
  deviceId: string;
  data: {
    folders: Folder[];
    cards: FlashCard[];
    cardStates: CardState[];
  };
}
