import { AppConstants } from '@/lib/constants';
import type { CardState, CardStudyState, DeckOptions, Rating, SchedulerPreferences } from '@/lib/types';
import { getSchedulerPreferences, jstDayStart } from '@/lib/utils';

type SchedulingMode = 'actual' | 'preview';

function clampInterval(interval: number): number {
  return Math.max(interval, 1);
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

/**
 * 日本時間 (JST) での now の翌 intervalDays 日後 0:00 を返す。
 * JST は通年 UTC+9 固定なので、24h × intervalDays で正確に進められる。
 */
function dayDue(now: Date, intervalDays: number, schedulerPreferences: SchedulerPreferences): Date {
  const midnight = jstDayStart(now, schedulerPreferences.nextDayStartsHour);
  return new Date(midnight.getTime() + intervalDays * 24 * 60 * 60 * 1000);
}

function getInterdayStepDays(now: Date, target: Date, schedulerPreferences: SchedulerPreferences): number {
  const currentDayStart = jstDayStart(now, schedulerPreferences.nextDayStartsHour).getTime();
  const targetDayStart = jstDayStart(target, schedulerPreferences.nextDayStartsHour).getTime();
  return Math.max(1, Math.round((targetDayStart - currentDayStart) / 86400000));
}

function scheduleLearningDue(
  current: CardState,
  rating: Rating,
  now: Date,
  delayMinutes: number,
  schedulerPreferences: SchedulerPreferences,
  mode: SchedulingMode,
): string {
  const target = new Date(now.getTime() + delayMinutes * 60000);
  const isInterday = jstDayStart(target, schedulerPreferences.nextDayStartsHour).getTime()
    > jstDayStart(now, schedulerPreferences.nextDayStartsHour).getTime();

  if (isInterday) {
    return dayDue(now, getInterdayStepDays(now, target, schedulerPreferences), schedulerPreferences).toISOString();
  }

  const fuzzMs = mode === 'actual'
    ? Math.round(
      deterministicUnit(
        current.cardId,
        rating,
        now.toISOString(),
        String(current.stepIndex),
        'learning-fuzz',
      ) * 5 * 60 * 1000,
    )
    : 0;

  return new Date(target.getTime() + fuzzMs).toISOString();
}

function applyReviewFuzz(
  current: CardState,
  rating: Rating,
  now: Date,
  targetInterval: number,
  maximumInterval: number,
  mode: SchedulingMode,
): number {
  const clampedTarget = Math.min(clampInterval(targetInterval), maximumInterval);
  if (mode === 'preview' || clampedTarget < 2) {
    return clampedTarget;
  }

  const minInterval = Math.max(2, Math.round(clampedTarget * 0.95 - 1));
  const maxInterval = Math.max(minInterval, Math.round(clampedTarget * 1.05 + 1));
  const unit = deterministicUnit(current.cardId, rating, now.toISOString(), 'review-fuzz');
  const fuzzed = minInterval + Math.floor(unit * (maxInterval - minInterval + 1));

  return Math.min(maximumInterval, Math.max(current.interval + 1, fuzzed));
}

function copyState(current: CardState, overrides: Partial<CardState>): CardState {
  return { ...current, ...overrides };
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
    case 'again':
      return copyState(current, {
        state: 'learning',
        stepIndex: 0,
        due: scheduleLearningDue(current, rating, now, steps[0], schedulerPreferences, mode),
      });

    case 'hard': {
      const currentIdx = Math.min(Math.max(current.stepIndex, 0), steps.length - 1);
      let delayMinutes: number;
      if (currentIdx === 0 && steps.length > 1) {
        delayMinutes = Math.round((steps[0] + steps[1]) / 2);
      } else if (steps.length === 1) {
        delayMinutes = Math.min(steps[0] * 1.5, steps[0] + 1440);
      } else {
        delayMinutes = steps[currentIdx];
      }
      return copyState(current, {
        state: 'learning',
        stepIndex: currentIdx,
        due: scheduleLearningDue(current, rating, now, delayMinutes, schedulerPreferences, mode),
      });
    }

    case 'good': {
      const nextStep = current.stepIndex + 1;
      if (nextStep >= steps.length) {
        return copyState(current, {
          state: 'review',
        interval: deckOptions.graduatingInterval,
        due: dayDue(now, deckOptions.graduatingInterval, schedulerPreferences).toISOString(),
        easeFactor: deckOptions.initialEaseFactor,
        repetition: 1,
        stepIndex: 0,
      });
      }
      return copyState(current, {
        state: 'learning',
        stepIndex: nextStep,
        due: scheduleLearningDue(current, rating, now, steps[nextStep], schedulerPreferences, mode),
      });
    }

    case 'easy':
      return copyState(current, {
        state: 'review',
        interval: deckOptions.easyGraduationInterval,
        due: dayDue(now, deckOptions.easyGraduationInterval, schedulerPreferences).toISOString(),
        easeFactor: deckOptions.initialEaseFactor,
        repetition: 1,
        stepIndex: 0,
      });
  }
}

function processReview(
  current: CardState,
  rating: Rating,
  now: Date,
  deckOptions: DeckOptions,
  schedulerPreferences: SchedulerPreferences,
  mode: SchedulingMode,
): CardState {
  const currentInterval = Math.max(current.interval, 1);
  const dueDate = new Date(current.due);
  const daysLate = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / 86400000));
  const ease = current.easeFactor;
  const im = deckOptions.intervalModifier;

  const rawHard = Math.round(currentInterval * deckOptions.hardMultiplier * im);
  const hardInterval = Math.max(current.interval + 1, rawHard);
  const rawGood = Math.round((currentInterval + daysLate / 2) * ease * im);
  const goodInterval = Math.max(hardInterval + 1, rawGood);

  switch (rating) {
    case 'again': {
      const newEase = Math.max(deckOptions.minEaseFactor, ease - 0.20);
      const newInterval = Math.max(
        deckOptions.minimumLapseInterval,
        Math.round(currentInterval * deckOptions.lapseNewInterval * im),
      );
      const steps = deckOptions.relearningStepsMinutes;
      if (steps.length === 0) {
        return copyState(current, {
          state: 'review',
          lapseCount: current.lapseCount + 1,
          easeFactor: newEase,
          interval: newInterval,
          due: dayDue(now, newInterval, schedulerPreferences).toISOString(),
        });
      }
      return copyState(current, {
        state: 'relearning',
        stepIndex: 0,
        lapseCount: current.lapseCount + 1,
        easeFactor: newEase,
        interval: newInterval,
        due: scheduleLearningDue(current, rating, now, steps[0], schedulerPreferences, mode),
      });
    }

    case 'hard': {
      const newEase = Math.max(deckOptions.minEaseFactor, ease - 0.15);
      const clamped = applyReviewFuzz(
        current,
        rating,
        now,
        hardInterval,
        deckOptions.maximumInterval,
        mode,
      );
      return copyState(current, {
        state: 'review',
        easeFactor: newEase,
        interval: clamped,
        due: dayDue(now, clamped, schedulerPreferences).toISOString(),
        repetition: current.repetition + 1,
      });
    }

    case 'good': {
      const clamped = applyReviewFuzz(
        current,
        rating,
        now,
        goodInterval,
        deckOptions.maximumInterval,
        mode,
      );
      return copyState(current, {
        state: 'review',
        interval: clamped,
        due: dayDue(now, clamped, schedulerPreferences).toISOString(),
        repetition: current.repetition + 1,
      });
    }

    case 'easy': {
      const newEase = ease + 0.15;
      const rawEasy = Math.round((currentInterval + daysLate) * ease * deckOptions.easyBonus * im);
      const easyInterval = applyReviewFuzz(
        current,
        rating,
        now,
        Math.max(goodInterval + 1, rawEasy),
        deckOptions.maximumInterval,
        mode,
      );
      return copyState(current, {
        state: 'review',
        easeFactor: newEase,
        interval: easyInterval,
        due: dayDue(now, easyInterval, schedulerPreferences).toISOString(),
        repetition: current.repetition + 1,
      });
    }
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
    case 'again':
      return copyState(current, {
        state: 'relearning',
        stepIndex: 0,
        due: scheduleLearningDue(current, rating, now, steps[0], schedulerPreferences, mode),
      });

    case 'hard': {
      const currentIdx = Math.min(Math.max(current.stepIndex, 0), steps.length - 1);
      return copyState(current, {
        state: 'relearning',
        stepIndex: currentIdx,
        due: scheduleLearningDue(current, rating, now, steps[currentIdx], schedulerPreferences, mode),
      });
    }

    case 'good': {
      const nextStep = current.stepIndex + 1;
      if (nextStep >= steps.length) {
        return copyState(current, {
          state: 'review',
          due: dayDue(now, current.interval, schedulerPreferences).toISOString(),
          repetition: current.repetition + 1,
          stepIndex: 0,
        });
      }
      return copyState(current, {
        state: 'relearning',
        stepIndex: nextStep,
        due: scheduleLearningDue(current, rating, now, steps[nextStep], schedulerPreferences, mode),
      });
    }

    case 'easy': {
      const newInterval = current.interval + 1;
      return copyState(current, {
        state: 'review',
        interval: newInterval,
        due: dayDue(now, newInterval, schedulerPreferences).toISOString(),
        repetition: current.repetition + 1,
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

  return { ...result, lastReviewedAt: updatedAt, updatedAt };
}

export function previewDue(current: CardState, rating: Rating, now: Date, deckOptions: DeckOptions): Date {
  const newState = processRating(current, rating, now, deckOptions, getSchedulerPreferences(), 'preview');
  return new Date(newState.due);
}
