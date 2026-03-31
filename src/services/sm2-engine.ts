import { CardState, CardStudyState, Rating } from '@/lib/types';
import { AppConstants } from '@/lib/constants';

function clampInterval(interval: number): number {
  return Math.min(Math.max(interval, 1), AppConstants.maximumInterval);
}

/** Returns midnight of now + intervalDays (review due dates are day-level). */
function dayDue(now: Date, intervalDays: number): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() + intervalDays);
  return d;
}

function copyState(current: CardState, overrides: Partial<CardState>): CardState {
  return { ...current, ...overrides };
}

function processLearning(current: CardState, rating: Rating, now: Date): CardState {
  const steps = AppConstants.learningStepsMinutes;

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
        delayMinutes = Math.round((steps[0] + steps[1]) / 2);
      } else if (steps.length === 1) {
        delayMinutes = Math.min(Math.round(steps[0] * 1.5), steps[0] + 1440);
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
          interval: AppConstants.graduatingInterval,
          due: dayDue(now, AppConstants.graduatingInterval).toISOString(),
          easeFactor: AppConstants.initialEaseFactor,
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
        interval: AppConstants.easyGraduationInterval,
        due: dayDue(now, AppConstants.easyGraduationInterval).toISOString(),
        easeFactor: AppConstants.initialEaseFactor,
        repetition: 1,
        stepIndex: 0,
      });
  }
}

function processReview(current: CardState, rating: Rating, now: Date): CardState {
  const currentInterval = Math.max(current.interval, 1);
  const dueDate = new Date(current.due);
  const daysLate = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / 86400000));
  const ease = current.easeFactor;
  const im = AppConstants.intervalModifier;

  const rawHard = Math.round(currentInterval * AppConstants.hardMultiplier * im);
  const hardInterval = Math.max(current.interval + 1, rawHard);
  const rawGood = Math.round((currentInterval + daysLate / 2) * ease * im);
  const goodInterval = Math.max(hardInterval + 1, rawGood);

  switch (rating) {
    case 'again': {
      const newEase = Math.max(AppConstants.minEaseFactor, ease - 0.20);
      const newInterval = Math.max(
        AppConstants.minimumLapseInterval,
        Math.round(currentInterval * AppConstants.lapseNewInterval * im),
      );
      const steps = AppConstants.relearningStepsMinutes;
      if (steps.length === 0) {
        return copyState(current, {
          state: 'review',
          lapseCount: current.lapseCount + 1,
          easeFactor: newEase,
          interval: newInterval,
          due: dayDue(now, newInterval).toISOString(),
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
      const newEase = Math.max(AppConstants.minEaseFactor, ease - 0.15);
      const clamped = clampInterval(hardInterval);
      return copyState(current, {
        state: 'review',
        easeFactor: newEase,
        interval: clamped,
        due: dayDue(now, clamped).toISOString(),
        repetition: current.repetition + 1,
      });
    }

    case 'good': {
      const clamped = clampInterval(goodInterval);
      return copyState(current, {
        state: 'review',
        interval: clamped,
        due: dayDue(now, clamped).toISOString(),
        repetition: current.repetition + 1,
      });
    }

    case 'easy': {
      const newEase = ease + 0.15;
      const rawEasy = Math.round((currentInterval + daysLate) * ease * AppConstants.easyBonus * im);
      const easyInterval = clampInterval(Math.max(goodInterval + 1, rawEasy));
      return copyState(current, {
        state: 'review',
        easeFactor: newEase,
        interval: easyInterval,
        due: dayDue(now, easyInterval).toISOString(),
        repetition: current.repetition + 1,
      });
    }
  }
}

function processRelearning(current: CardState, rating: Rating, now: Date): CardState {
  const steps = AppConstants.relearningStepsMinutes;

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
          due: dayDue(now, current.interval).toISOString(),
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
        due: dayDue(now, newInterval).toISOString(),
        repetition: current.repetition + 1,
        stepIndex: 0,
      });
    }
  }
}

export function processRating(current: CardState, rating: Rating, now: Date): CardState {
  const updatedAt = now.toISOString();

  let result: CardState;
  switch (current.state as CardStudyState) {
    case 'newCard': {
      const asLearning = copyState(current, { state: 'learning', stepIndex: 0 });
      result = processLearning(asLearning, rating, now);
      break;
    }
    case 'learning':
      result = processLearning(current, rating, now);
      break;
    case 'review':
      result = processReview(current, rating, now);
      break;
    case 'relearning':
      result = processRelearning(current, rating, now);
      break;
  }

  return { ...result, updatedAt };
}

export function previewDue(current: CardState, rating: Rating, now: Date): Date {
  const newState = processRating(current, rating, now);
  return new Date(newState.due);
}
