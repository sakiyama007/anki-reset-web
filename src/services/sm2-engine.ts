import { AppConstants } from '@/lib/constants';
import type { CardState, CardStudyState, DeckOptions, Rating, SchedulerPreferences } from '@/lib/types';
import { getSchedulerPreferences, jstDayStart } from '@/lib/utils';

type SchedulingMode = 'actual' | 'preview';

const SECONDS_PER_DAY = 24 * 60 * 60;
const MS_PER_DAY = SECONDS_PER_DAY * 1000;

interface ReviewIntervals {
  hard: number;
  good: number;
  easy: number;
}

function stableHash(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function deterministicUnit(...parts: string[]): number {
  return (stableHash(parts.join('|')) % 1000000) / 1000000;
}

function fuzzUnit(current: CardState): number {
  return deterministicUnit(current.cardId, String(current.repetition), 'anki-fuzz');
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function toSecs(minutes: number): number {
  return Math.max(0, Math.trunc(minutes * 60));
}

function stepSecs(steps: number[], index: number): number | undefined {
  const value = steps[index];
  return typeof value === 'number' ? toSecs(value) : undefined;
}

function currentStepIndex(steps: number[], stepIndex: number): number {
  if (steps.length === 0) return 0;
  return clamp(Math.trunc(stepIndex), 0, steps.length - 1);
}

function maybeRoundInDays(secs: number): number {
  if (secs > SECONDS_PER_DAY) {
    return Math.round(secs / SECONDS_PER_DAY) * SECONDS_PER_DAY;
  }
  return secs;
}

function againDelaySecs(steps: number[]): number | undefined {
  return stepSecs(steps, 0);
}

function hardDelaySecs(steps: number[], stepIndex: number): number | undefined {
  const index = currentStepIndex(steps, stepIndex);
  const current = stepSecs(steps, index) ?? stepSecs(steps, 0);
  if (current === undefined) return undefined;

  if (index !== 0) return current;

  const next = stepSecs(steps, 1);
  if (next !== undefined) {
    return maybeRoundInDays(Math.trunc((current + next) / 2));
  }

  return maybeRoundInDays(Math.min(Math.trunc(current * 3 / 2), current + SECONDS_PER_DAY));
}

function goodDelaySecs(steps: number[], stepIndex: number): number | undefined {
  return stepSecs(steps, currentStepIndex(steps, stepIndex) + 1);
}

function nextStepIndex(steps: number[], stepIndex: number): number {
  return currentStepIndex(steps, stepIndex) + 1;
}

function minAndMaxReviewIntervals(minimum: number, maximumInterval: number): [number, number] {
  const maximum = Math.max(1, Math.trunc(maximumInterval));
  const clampedMinimum = clamp(Math.trunc(minimum), 1, maximum);
  return [clampedMinimum, maximum];
}

export function createInitialCardState(cardId: string, createdAt: string): CardState {
  return {
    cardId,
    state: 'newCard',
    stepIndex: 0,
    due: createdAt,
    interval: 0,
    easeFactor: AppConstants.initialEaseFactor,
    repetition: 0,
    lapseCount: 0,
    updatedAt: createdAt,
  };
}

function dayDue(now: Date, intervalDays: number, schedulerPreferences: SchedulerPreferences): Date {
  const midnight = jstDayStart(now, schedulerPreferences.nextDayStartsHour);
  return new Date(midnight.getTime() + intervalDays * MS_PER_DAY);
}

function getInterdayStepDays(now: Date, target: Date, schedulerPreferences: SchedulerPreferences): number {
  const currentDayStart = jstDayStart(now, schedulerPreferences.nextDayStartsHour).getTime();
  const targetDayStart = jstDayStart(target, schedulerPreferences.nextDayStartsHour).getTime();
  return Math.max(1, Math.round((targetDayStart - currentDayStart) / MS_PER_DAY));
}

function learningIntervalWithFuzz(current: CardState, secs: number): number {
  const extra = Math.floor(Math.min(secs * 0.25, 300));
  const upperExclusive = secs + extra;
  if (secs >= upperExclusive) return secs;
  return secs + Math.floor(fuzzUnit(current) * (upperExclusive - secs));
}

function scheduleLearningDue(
  current: CardState,
  now: Date,
  delaySecs: number,
  schedulerPreferences: SchedulerPreferences,
  mode: SchedulingMode,
): string {
  const target = new Date(now.getTime() + delaySecs * 1000);
  const isInterday = jstDayStart(target, schedulerPreferences.nextDayStartsHour).getTime()
    > jstDayStart(now, schedulerPreferences.nextDayStartsHour).getTime();

  if (isInterday) {
    return dayDue(now, getInterdayStepDays(now, target, schedulerPreferences), schedulerPreferences).toISOString();
  }

  const finalDelaySecs = mode === 'actual'
    ? learningIntervalWithFuzz(current, delaySecs)
    : delaySecs;
  return new Date(now.getTime() + finalDelaySecs * 1000).toISOString();
}

function fuzzDelta(interval: number): number {
  if (interval < 2.5) return 0;

  const first = 0.15 * (Math.min(interval, 7) - 2.5);
  const second = 0.1 * Math.max(0, Math.min(interval, 20) - 7);
  const third = 0.05 * Math.max(0, interval - 20);
  return 1 + first + second + third;
}

function fuzzBounds(interval: number): [number, number] {
  const delta = fuzzDelta(interval);
  return [
    Math.round(interval - delta),
    Math.round(interval + delta),
  ];
}

function constrainedFuzzBounds(interval: number, minimum: number, maximum: number): [number, number] {
  const boundedInterval = clamp(interval, minimum, maximum);
  let [lower, upper] = fuzzBounds(boundedInterval);

  lower = clamp(lower, minimum, maximum);
  upper = clamp(upper, minimum, maximum);

  if (upper === lower && upper > 2 && upper < maximum) {
    upper = lower + 1;
  }

  return [lower, upper];
}

function withReviewFuzz(
  current: CardState,
  interval: number,
  minimum: number,
  maximum: number,
  fuzz: boolean,
): number {
  if (!fuzz) {
    return clamp(Math.round(interval), minimum, maximum);
  }

  const [lower, upper] = constrainedFuzzBounds(interval, minimum, maximum);
  return Math.floor(lower + fuzzUnit(current) * (1 + upper - lower));
}

function constrainPassingInterval(
  current: CardState,
  deckOptions: DeckOptions,
  interval: number,
  minimum: number,
  fuzz: boolean,
): number {
  const multiplied = interval * deckOptions.intervalModifier;
  const [clampedMinimum, maximum] = minAndMaxReviewIntervals(minimum, deckOptions.maximumInterval);
  return withReviewFuzz(current, multiplied, clampedMinimum, maximum, fuzz);
}

function reviewIntervalWithFuzz(
  current: CardState,
  deckOptions: DeckOptions,
  interval: number,
  minimum = 1,
): number {
  const [clampedMinimum, maximum] = minAndMaxReviewIntervals(minimum, deckOptions.maximumInterval);
  return withReviewFuzz(current, interval, clampedMinimum, maximum, true);
}

function copyState(current: CardState, overrides: Partial<CardState>): CardState {
  return { ...current, ...overrides };
}

function graduateLearning(
  current: CardState,
  now: Date,
  deckOptions: DeckOptions,
  schedulerPreferences: SchedulerPreferences,
  intervalDays: number,
): CardState {
  const interval = reviewIntervalWithFuzz(current, deckOptions, intervalDays);
  return copyState(current, {
    state: 'review',
    interval,
    due: dayDue(now, interval, schedulerPreferences).toISOString(),
    easeFactor: deckOptions.initialEaseFactor,
    stepIndex: 0,
  });
}

function processLearning(
  current: CardState,
  rating: Rating,
  now: Date,
  deckOptions: DeckOptions,
  schedulerPreferences: SchedulerPreferences,
  mode: SchedulingMode,
): CardState {
  const steps = deckOptions.learningStepsMinutes;

  switch (rating) {
    case 'again': {
      const delaySecs = againDelaySecs(steps);
      if (delaySecs === undefined) {
        return graduateLearning(current, now, deckOptions, schedulerPreferences, deckOptions.graduatingInterval);
      }
      return copyState(current, {
        state: 'learning',
        stepIndex: 0,
        due: scheduleLearningDue(current, now, delaySecs, schedulerPreferences, mode),
      });
    }

    case 'hard': {
      const delaySecs = hardDelaySecs(steps, current.stepIndex);
      if (delaySecs === undefined) {
        return graduateLearning(current, now, deckOptions, schedulerPreferences, deckOptions.graduatingInterval);
      }
      return copyState(current, {
        state: 'learning',
        stepIndex: currentStepIndex(steps, current.stepIndex),
        due: scheduleLearningDue(current, now, delaySecs, schedulerPreferences, mode),
      });
    }

    case 'good': {
      const delaySecs = goodDelaySecs(steps, current.stepIndex);
      if (delaySecs === undefined) {
        return graduateLearning(current, now, deckOptions, schedulerPreferences, deckOptions.graduatingInterval);
      }
      return copyState(current, {
        state: 'learning',
        stepIndex: nextStepIndex(steps, current.stepIndex),
        due: scheduleLearningDue(current, now, delaySecs, schedulerPreferences, mode),
      });
    }

    case 'easy':
      return graduateLearning(current, now, deckOptions, schedulerPreferences, deckOptions.easyGraduationInterval);
  }
}

function elapsedReviewDays(current: CardState, now: Date, schedulerPreferences: SchedulerPreferences): number {
  const scheduledDays = Math.max(1, Math.trunc(current.interval));
  const dueDay = jstDayStart(new Date(current.due), schedulerPreferences.nextDayStartsHour).getTime();
  const today = jstDayStart(now, schedulerPreferences.nextDayStartsHour).getTime();
  const daysFromDue = Math.round((today - dueDay) / MS_PER_DAY);
  return Math.max(0, scheduledDays + daysFromDue);
}

function passingEarlyReviewIntervals(
  current: CardState,
  deckOptions: DeckOptions,
  elapsedDays: number,
): ReviewIntervals {
  const scheduledDays = Math.max(1, Math.trunc(current.interval));
  const elapsed = Math.max(0, elapsedDays);
  const hardInterval = constrainPassingInterval(
    current,
    deckOptions,
    Math.max(elapsed * deckOptions.hardMultiplier, scheduledDays * (deckOptions.hardMultiplier / 2)),
    0,
    false,
  );
  const goodInterval = constrainPassingInterval(
    current,
    deckOptions,
    Math.max(elapsed * current.easeFactor, scheduledDays),
    0,
    false,
  );
  const reducedEasyBonus = deckOptions.easyBonus - (deckOptions.easyBonus - 1) / 2;
  const easyInterval = constrainPassingInterval(
    current,
    deckOptions,
    Math.max(elapsed * current.easeFactor, scheduledDays) * reducedEasyBonus,
    0,
    false,
  );

  return {
    hard: hardInterval,
    good: goodInterval,
    easy: easyInterval,
  };
}

function passingReviewIntervals(
  current: CardState,
  deckOptions: DeckOptions,
  elapsedDays: number,
): ReviewIntervals {
  const scheduledDays = Math.max(1, Math.trunc(current.interval));
  const daysLate = elapsedDays - scheduledDays;

  if (daysLate < 0) {
    return passingEarlyReviewIntervals(current, deckOptions, elapsedDays);
  }

  const currentInterval = Math.max(scheduledDays, 1);
  const hardMinimum = deckOptions.hardMultiplier <= 1 ? 0 : scheduledDays + 1;
  const hardInterval = constrainPassingInterval(
    current,
    deckOptions,
    currentInterval * deckOptions.hardMultiplier,
    hardMinimum,
    true,
  );

  const goodMinimum = deckOptions.hardMultiplier <= 1 ? scheduledDays + 1 : hardInterval + 1;
  const goodInterval = constrainPassingInterval(
    current,
    deckOptions,
    (currentInterval + Math.max(0, daysLate) / 2) * current.easeFactor,
    goodMinimum,
    true,
  );

  const easyInterval = constrainPassingInterval(
    current,
    deckOptions,
    (currentInterval + Math.max(0, daysLate)) * current.easeFactor * deckOptions.easyBonus,
    goodInterval + 1,
    true,
  );

  return {
    hard: hardInterval,
    good: goodInterval,
    easy: easyInterval,
  };
}

function failingReviewInterval(current: CardState, deckOptions: DeckOptions): number {
  return reviewIntervalWithFuzz(
    current,
    deckOptions,
    Math.max(1, Math.trunc(current.interval)) * deckOptions.lapseNewInterval,
    deckOptions.minimumLapseInterval,
  );
}

function processReview(
  current: CardState,
  rating: Rating,
  now: Date,
  deckOptions: DeckOptions,
  schedulerPreferences: SchedulerPreferences,
  mode: SchedulingMode,
): CardState {
  const elapsedDays = elapsedReviewDays(current, now, schedulerPreferences);
  const intervals = passingReviewIntervals(current, deckOptions, elapsedDays);

  switch (rating) {
    case 'again': {
      const newEase = Math.max(AppConstants.minEaseFactor, current.easeFactor - 0.20);
      const interval = failingReviewInterval(current, deckOptions);
      const steps = deckOptions.relearningStepsMinutes;
      const delaySecs = againDelaySecs(steps);

      if (delaySecs === undefined) {
        return copyState(current, {
          state: 'review',
          lapseCount: current.lapseCount + 1,
          easeFactor: newEase,
          interval,
          due: dayDue(now, interval, schedulerPreferences).toISOString(),
        });
      }

      return copyState(current, {
        state: 'relearning',
        stepIndex: 0,
        lapseCount: current.lapseCount + 1,
        easeFactor: newEase,
        interval,
        due: scheduleLearningDue(current, now, delaySecs, schedulerPreferences, mode),
      });
    }

    case 'hard':
      return copyState(current, {
        state: 'review',
        easeFactor: Math.max(AppConstants.minEaseFactor, current.easeFactor - 0.15),
        interval: intervals.hard,
        due: dayDue(now, intervals.hard, schedulerPreferences).toISOString(),
      });

    case 'good':
      return copyState(current, {
        state: 'review',
        interval: intervals.good,
        due: dayDue(now, intervals.good, schedulerPreferences).toISOString(),
      });

    case 'easy':
      return copyState(current, {
        state: 'review',
        easeFactor: current.easeFactor + 0.15,
        interval: intervals.easy,
        due: dayDue(now, intervals.easy, schedulerPreferences).toISOString(),
      });
  }
}

function processRelearning(
  current: CardState,
  rating: Rating,
  now: Date,
  deckOptions: DeckOptions,
  schedulerPreferences: SchedulerPreferences,
  mode: SchedulingMode,
): CardState {
  const steps = deckOptions.relearningStepsMinutes;

  switch (rating) {
    case 'again': {
      const delaySecs = againDelaySecs(steps);
      const interval = failingReviewInterval(current, deckOptions);
      if (delaySecs === undefined) {
        return copyState(current, {
          state: 'review',
          interval,
          due: dayDue(now, interval, schedulerPreferences).toISOString(),
          stepIndex: 0,
        });
      }
      return copyState(current, {
        state: 'relearning',
        stepIndex: 0,
        interval,
        due: scheduleLearningDue(current, now, delaySecs, schedulerPreferences, mode),
      });
    }

    case 'hard': {
      const delaySecs = hardDelaySecs(steps, current.stepIndex);
      if (delaySecs === undefined) {
        return copyState(current, {
          state: 'review',
          due: dayDue(now, current.interval, schedulerPreferences).toISOString(),
          stepIndex: 0,
        });
      }
      return copyState(current, {
        state: 'relearning',
        stepIndex: currentStepIndex(steps, current.stepIndex),
        due: scheduleLearningDue(current, now, delaySecs, schedulerPreferences, mode),
      });
    }

    case 'good': {
      const delaySecs = goodDelaySecs(steps, current.stepIndex);
      if (delaySecs === undefined) {
        return copyState(current, {
          state: 'review',
          due: dayDue(now, current.interval, schedulerPreferences).toISOString(),
          stepIndex: 0,
        });
      }
      return copyState(current, {
        state: 'relearning',
        stepIndex: nextStepIndex(steps, current.stepIndex),
        due: scheduleLearningDue(current, now, delaySecs, schedulerPreferences, mode),
      });
    }

    case 'easy': {
      const interval = Math.min(Math.max(1, Math.trunc(deckOptions.maximumInterval)), current.interval + 1);
      return copyState(current, {
        state: 'review',
        interval,
        due: dayDue(now, interval, schedulerPreferences).toISOString(),
        stepIndex: 0,
      });
    }
  }
}

export function processRating(
  current: CardState,
  rating: Rating,
  now: Date,
  deckOptions: DeckOptions,
  schedulerPreferences = getSchedulerPreferences(),
  mode: SchedulingMode = 'actual',
): CardState {
  const updatedAt = now.toISOString();

  let result: CardState;
  switch (current.state as CardStudyState) {
    case 'newCard': {
      const asLearning = copyState(current, { state: 'learning', stepIndex: 0 });
      result = processLearning(asLearning, rating, now, deckOptions, schedulerPreferences, mode);
      break;
    }
    case 'learning':
      result = processLearning(current, rating, now, deckOptions, schedulerPreferences, mode);
      break;
    case 'review':
      result = processReview(current, rating, now, deckOptions, schedulerPreferences, mode);
      break;
    case 'relearning':
      result = processRelearning(current, rating, now, deckOptions, schedulerPreferences, mode);
      break;
  }

  return {
    ...result,
    repetition: current.repetition + 1,
    lastReviewedAt: updatedAt,
    updatedAt,
  };
}

export function previewDue(current: CardState, rating: Rating, now: Date, deckOptions: DeckOptions): Date {
  const newState = processRating(current, rating, now, deckOptions, getSchedulerPreferences(), 'preview');
  return new Date(newState.due);
}
