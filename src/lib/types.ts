export type CardStudyState = 'newCard' | 'learning' | 'review' | 'relearning';
export type Rating = 'again' | 'hard' | 'good' | 'easy';
export type NewCardInsertionOrder = 'sequential' | 'random';
export type ReviewSortOrder = 'dueAscRandom' | 'dueAsc';

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  isDeleted?: boolean;
  deletedAt?: string; // ISO 8601
  deleteBaseUpdatedAt?: string; // ISO 8601
}

export interface FlashCard {
  id: string;
  front: string;
  back: string;
  folderId: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  isDeleted?: boolean;
  deletedAt?: string; // ISO 8601
  deleteBaseUpdatedAt?: string; // ISO 8601
  isSuspended?: boolean;
  isLeech?: boolean;
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
  lastReviewedAt?: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export type DeckOptionsSnapshot = Pick<
  DeckOptions,
  | 'learningStepsMinutes'
  | 'graduatingInterval'
  | 'easyGraduationInterval'
  | 'initialEaseFactor'
  | 'hardMultiplier'
  | 'easyBonus'
  | 'intervalModifier'
  | 'maximumInterval'
  | 'relearningStepsMinutes'
  | 'lapseNewInterval'
  | 'minimumLapseInterval'
  | 'minEaseFactor'
>;

export interface DeckOptions {
  folderId: string;
  updatedAt: string; // ISO 8601
  learningStepsMinutes: number[];
  graduatingInterval: number;
  easyGraduationInterval: number;
  initialEaseFactor: number;
  hardMultiplier: number;
  easyBonus: number;
  intervalModifier: number;
  maximumInterval: number;
  relearningStepsMinutes: number[];
  lapseNewInterval: number;
  minimumLapseInterval: number;
  minEaseFactor: number;
  newCardsPerDay: number;
  maxReviewsPerDay: number;
  newCardInsertionOrder: NewCardInsertionOrder;
  reviewSortOrder: ReviewSortOrder;
  leechThreshold: number;
}

export interface SchedulerPreferences {
  nextDayStartsHour: number;
  learnAheadMinutes: number;
}

export interface Revlog {
  id: string;
  cardId: string;
  folderId: string;
  rating: Rating;
  previousState: CardStudyState;
  newState: CardStudyState;
  previousInterval: number;
  newInterval: number;
  previousDue: string;
  newDue: string;
  reviewedAt: string;
  updatedAt: string;
  deviceId?: string;
  schedulerSnapshot?: Pick<SchedulerPreferences, 'nextDayStartsHour'>;
  deckOptionsSnapshot?: DeckOptionsSnapshot;
  previousCardStateSnapshot?: CardState;
  newCardStateSnapshot?: CardState;
}

export type SyncOutboxStatus = 'pending' | 'failed' | 'synced';

export interface SyncOutboxItem {
  id: string;
  itemType: 'revlog';
  itemId: string;
  status: SyncOutboxStatus;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
}

export interface StudyCard {
  card: FlashCard;
  cardState: CardState;
  deckOptions: DeckOptions;
}

export interface FolderInfo {
  folder: Folder;
  cardCount: number;
  subfolderCount: number;
  newCount: number;
  oneMinuteCount: number;
  learningCount: number;
  reviewCount: number;
}

export interface StudyCounts {
  new: number;
  oneMinute: number;
  learning: number;
  review: number;
}

export interface SyncPayload {
  version: 1 | 2;
  exportedAt: string;
  deviceId: string;
  data: {
    folders: Folder[];
    cards: FlashCard[];
    cardStates: CardState[];
    deckOptions?: DeckOptions[];
    revlogs?: Revlog[];
  };
}
