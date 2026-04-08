export const AppConstants = {
  maxFolderDepth: 5,
  pageSize: 50,

  // SM-2 parameters (Anki defaults)
  learningStepsMinutes: [1, 10] as readonly number[],
  graduatingInterval: 1,        // days (Good graduation)
  easyGraduationInterval: 4,    // days (Easy graduation)
  initialEaseFactor: 2.5,       // STARTING_EASE (250%)

  // Reviews
  hardMultiplier: 1.2,
  easyBonus: 1.3,               // EASY_BONUS (130%)
  intervalModifier: 1.0,        // INTERVAL_MODIFIER (100%)
  maximumInterval: 36500,       // days

  // Lapses
  relearningStepsMinutes: [10] as readonly number[],
  lapseNewInterval: 0.7,        // NEW_INTERVAL (70%)
  minimumLapseInterval: 1,      // days

  // Ease factor bounds
  minEaseFactor: 1.3,

  // Learn-ahead buffer
  learnAheadMinutes: 0,
} as const;
