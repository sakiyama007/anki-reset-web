import type { CardState, CardStudyState, DeckOptions, Rating, SchedulerPreferences } from '@/lib/types';
import { getSchedulerPreferences, jstDayStart } from '@/lib/utils';

function clampInterval(interval: number): number {
  return Math.max(interval, 1);
}

/**
 * 日本時間 (JST) での now の翌 intervalDays 日後 0:00 を返す。
 * JST は通年 UTC+9 固定なので、24h × intervalDays で正確に進められる。
 */
function dayDue(now: Date, intervalDays: number, schedulerPreferences: SchedulerPreferences): Date {
  const midnight = jstDayStart(now, schedulerPreferences.nextDayStartsHour);
  return new Date(midnight.getTime() + intervalDays * 24 * 60 * 60 * 1000);
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
): CardState {
  const steps = deckOptions.learningStepsMinutes;

  switch (rating) {
    case 'again':
      return copyState(current, {
        state: 'learning',
        stepIndex: 0,
        due: new Date(now.getTime() + steps[0] * 60000).toISOString(),
      });

    case 'hard': {
      const currentIdx = Math.min(Math.max(current.stepIndex, 0), steps.length - 1);
      let delayMinutes: number;
      if (currentIdx === 0 && steps.length > 1) {
        // UX: avoid re-showing the same card too quickly after Hard at the first step.
        delayMinutes = steps[1];
      } else if (steps.length === 1) {
        delayMinutes = Math.min(steps[0] * 1.5, steps[0] + 1440);
      } else {
        delayMinutes = steps[currentIdx];
      }
      return copyState(current, {
        state: 'learning',
        stepIndex: currentIdx,
        due: new Date(now.getTime() + delayMinutes * 60000).toISOString(),
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
        due: new Date(now.getTime() + steps[nextStep] * 60000).toISOString(),
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
        due: new Date(now.getTime() + steps[0] * 60000).toISOString(),
      });
    }

    case 'hard': {
      const newEase = Math.max(deckOptions.minEaseFactor, ease - 0.15);
      const clamped = Math.min(clampInterval(hardInterval), deckOptions.maximumInterval);
      return copyState(current, {
        state: 'review',
        easeFactor: newEase,
        interval: clamped,
        due: dayDue(now, clamped, schedulerPreferences).toISOString(),
        repetition: current.repetition + 1,
      });
    }

    case 'good': {
      const clamped = Math.min(clampInterval(goodInterval), deckOptions.maximumInterval);
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
      const easyInterval = Math.min(
        clampInterval(Math.max(goodInterval + 1, rawEasy)),
        deckOptions.maximumInterval,
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
): CardState {
  const steps = deckOptions.relearningStepsMinutes;

  switch (rating) {
    case 'again':
      return copyState(current, {
        state: 'relearning',
        stepIndex: 0,
        due: new Date(now.getTime() + steps[0] * 60000).toISOString(),
      });

    case 'hard': {
      const currentIdx = Math.min(Math.max(current.stepIndex, 0), steps.length - 1);
      return copyState(current, {
        state: 'relearning',
        stepIndex: currentIdx,
        due: new Date(now.getTime() + steps[currentIdx] * 60000).toISOString(),
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
        due: new Date(now.getTime() + steps[nextStep] * 60000).toISOString(),
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
): CardState {
  const updatedAt = now.toISOString();

  let result: CardState;
  switch (current.state as CardStudyState) {
    case 'newCard': {
      const asLearning = copyState(current, { state: 'learning', stepIndex: 0 });
      result = processLearning(asLearning, rating, now, deckOptions, schedulerPreferences);
      break;
    }
    case 'learning':
      result = processLearning(current, rating, now, deckOptions, schedulerPreferences);
      break;
    case 'review':
      result = processReview(current, rating, now, deckOptions, schedulerPreferences);
      break;
    case 'relearning':
      result = processRelearning(current, rating, now, deckOptions, schedulerPreferences);
      break;
  }

  return { ...result, updatedAt };
}

export function previewDue(current: CardState, rating: Rating, now: Date, deckOptions: DeckOptions): Date {
  const newState = processRating(current, rating, now, deckOptions);
  return new Date(newState.due);
}
