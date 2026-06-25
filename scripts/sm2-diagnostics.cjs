/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    const base = path.join(root, 'src', request.slice(2));
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`]) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions['.ts'] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;

  module._compile(output, filename);
};

const {
  createInitialCardState,
  previewDue,
  processRating,
} = require('../src/services/sm2-engine.ts');

const deckOptions = {
  folderId: 'deck',
  updatedAt: '2026-06-11T00:00:00.000Z',
  learningStepsMinutes: [1, 10],
  graduatingInterval: 1,
  easyGraduationInterval: 4,
  initialEaseFactor: 2.5,
  hardMultiplier: 1.2,
  easyBonus: 1.3,
  intervalModifier: 1,
  maximumInterval: 36500,
  relearningStepsMinutes: [10],
  lapseNewInterval: 0,
  minimumLapseInterval: 1,
  minEaseFactor: 1.3,
  newCardsPerDay: 20,
  maxReviewsPerDay: 200,
  newCardInsertionOrder: 'sequential',
  reviewSortOrder: 'dueAscRandom',
  leechThreshold: 8,
};

const schedulerPreferences = {
  nextDayStartsHour: 4,
  learnAheadMinutes: 20,
};

const now = new Date('2026-06-11T00:00:00.000Z');
const initial = createInitialCardState('card-a', now.toISOString());

function secondsUntil(date) {
  return Math.round((date.getTime() - now.getTime()) / 1000);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(secondsUntil(previewDue(initial, 'again', now, deckOptions)) === 60, 'new Again preview should be 60s');
assert(secondsUntil(previewDue(initial, 'hard', now, deckOptions)) === 330, 'new Hard preview should be 330s');
assert(secondsUntil(previewDue(initial, 'good', now, deckOptions)) === 600, 'new Good preview should be 600s');

const actualAgain = processRating(initial, 'again', now, deckOptions, schedulerPreferences);
const actualAgainSecs = secondsUntil(new Date(actualAgain.due));

assert(actualAgainSecs >= 60 && actualAgainSecs <= 74, 'learning fuzz should be 60..74s for a 60s step');
assert(actualAgain.repetition === 1, 'repetition should increment on every answer');

const secondStep = {
  ...actualAgain,
  stepIndex: 1,
  due: now.toISOString(),
};
const graduated = processRating(secondStep, 'good', now, deckOptions, schedulerPreferences, 'preview');

assert(graduated.state === 'review', 'final Good learning step should graduate');
assert(graduated.interval === 1, 'final Good learning step should use the graduating interval');

const earlyReview = {
  ...initial,
  state: 'review',
  interval: 10,
  due: '2026-06-13T19:00:00.000Z',
  easeFactor: 2.5,
  repetition: 10,
};
const earlyGood = processRating(
  earlyReview,
  'good',
  now,
  deckOptions,
  schedulerPreferences,
  'preview',
);

assert(earlyGood.interval === 18, 'early review Good should use elapsed days without fuzz');

const lowHardDeck = {
  ...deckOptions,
  hardMultiplier: 0.1,
};
const lowHardReview = {
  ...initial,
  state: 'review',
  interval: 2,
  due: '2026-06-09T19:00:00.000Z',
  easeFactor: 1.3,
  repetition: 4,
};
const lowHardNext = processRating(lowHardReview, 'hard', now, lowHardDeck, schedulerPreferences, 'preview');

assert(lowHardNext.interval === 1, 'Hard multiplier <= 1 should allow Hard below the previous interval');

console.log('SM-2 diagnostics passed');
