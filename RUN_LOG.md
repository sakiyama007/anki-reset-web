# anki-reset-web Run Log

This file is the handoff log for Codex work on `anki-reset-web`.
Append one entry per execution/session.

## Entry Template

```md
## YYYY-MM-DD HH:mm JST - Short title

### User Request
- ...

### Changes
- ...

### Verification
- ...

### Current State
- ...

### Next Steps
- ...
```

## 2026-05-19 JST - Restore Anki learn-ahead and learning fuzz

### User Request
- Fix the two remaining Anki-parity notes: learn-ahead should follow Anki's default 20-minute behavior, and learning cards should receive the Anki learning fuzz.

### Changes
- Changed learn-ahead from the temporary fixed 60-second window back to the scheduler preference, whose default is 20 minutes.
- Kept learn-ahead limited to empty-queue situations so normal due/new cards are still consumed first.
- Restored up-to-5-minute actual due fuzz for same-day learning cards while keeping preview mode unfuzzed.
- Applied the same learning fuzz path to review lapses entering relearning.

### Verification
- Inline SM-2 Anki parity diagnostics passed, including Hard behavior, review interval progression, lapse/relearning fuzz, and 20-minute learn-ahead.
- `npm.cmd run build`
- `npm.cmd run lint`

## 2026-05-19 JST - Fix immediate <1min learn-ahead

### User Request
- Fix `<1min` so that when the study queue runs out, cards due within one minute are shown again immediately, matching Anki behavior more closely.

### Changes
- Added learn-ahead queue building for intraday learning/relearning cards due within 60 seconds.
- Limited immediate learn-ahead use to the point where the normal queue is empty, so other due/new cards are consumed first.
- Removed same-day learning due fuzz so `<1min` button previews and stored due timestamps stay aligned.

### Verification
- Ran a targeted learn-ahead queue behavior check with a due-in-60s learning card and a due-in-61s control.
- Ran a targeted scheduler check confirming `Again` on a new card stores an exact 60-second learning due.
- `npm.cmd run build`
- `npm.cmd run lint`

## 2026-05-19 JST - SM-2 focused diagnostics

### User Request
- Test whether the SM-2 algorithm works accurately, especially Hard behavior and interval changes as learning progresses.

### Checks
- Compared current implementation against Anki manual behavior for learning steps, Hard, graduation, review intervals, lapse/relearning, and learn-ahead.
- Ran an inline Node/Sucrase diagnostic script against `src/services/sm2-engine.ts` and `src/db/card-state-dao.ts`.
- Verified new-card `Hard` stays in learning step 0 with a 6-minute delay, and learning step 1 `Hard` repeats the 10-minute step.
- Verified repeated `Good` review progression under default SM-2 settings: `1d -> 3d -> 8d -> 20d -> 50d -> 125d`.
- Verified current `<1min` learn-ahead behavior: normal queue excludes future cards, empty-queue learn-ahead includes due-in-60s cards and excludes due-in-61s / Hard+6m cards.

### Verification
- Inline SM-2 focused diagnostics passed.
- `npm.cmd run build`
- `npm.cmd run lint`

### Notes
- Current implementation intentionally differs from Anki defaults for learn-ahead scope: it uses 60 seconds for the user's requested `<1min` behavior instead of Anki's default 20 minutes.
- Current implementation does not add Anki's same-day learning fuzz after this session's `<1min` fix; review-card fuzz remains implemented.

## 2026-05-18 JST - Deploy current web fixes

### User Request
- Reflect the current fixes to Vercel.

### Changes
- Prepared the existing web SM-2, sync, leech, CSV, dependency, and test-card changes for GitHub/Vercel deployment.
- Kept local `.claude/` settings out of the deployment commit.

### Verification
- `npm.cmd run build`
- `npm.cmd run lint`
- `npm.cmd audit --omit=dev`

### Current State
- Committed as `a280a41` and pushed to `origin/main`.

### Next Steps
- Confirm Vercel deployment status in the Vercel dashboard if needed.

## 2026-05-18 JST - Add web study select all

### User Request
- Investigate why the latest change is not visible after reload on Vercel.

### Cause
- The previous "select all in study phase" fix was applied to the Android app under `anki_reset`, not to the Vercel-served web app under `anki-reset-web`.
- The earlier Vercel push deployed web scheduler/sync changes, but did not include a web study select-all UI change.

### Changes
- Added all-select / clear-selection controls to the web study selection page.
- Normalized selected folders to root folders before starting a study session to avoid duplicated parent/child folder parameters.

### Verification
- `npm.cmd run build`
- `npm.cmd run lint`

## 2026-05-18 JST - Improve web select-all controls

### User Request
- Make all-select available in the web app.

### Changes
- Reworked the web study selection header so "全選択" is always available.
- Added a separate "選択解除" control when folders are selected.
- Cleaned the study selection page text to readable Japanese.

### Verification
- `npm.cmd run build`
- `npm.cmd run lint`

## 2026-05-18 JST - Show card review history

### User Request
- Show learning history from the card list detail view, including exact hour/minute/second and what happened.

### Changes
- Added card-specific revlog lookup.
- Changed card list clicks to open a detail dialog instead of going straight to edit.
- Added review history with reviewed timestamp, rating, state transition, interval transition, and next due time.
- Kept editing available from the detail dialog.

### Verification
- `npm.cmd run build`
- `npm.cmd run lint`

## 2026-05-18 JST - Merge study tab into home

### User Request
- Merge the study tab into the home tab and make the study-tab features available from home.

### Changes
- Removed the study tab from the shared app navigation.
- Added home-level all-select for folders.
- Updated home study start to normalize selected folders to root folders and avoid duplicated parent/child folder parameters.
- Replaced `/study` with a redirect to `/home` while keeping `/study/session` for active sessions.

### Verification
- `npm.cmd run build`
- `npm.cmd run lint`

## 2026-05-17 JST - Interday learning review usage fix

### User Request
- Continue the `@taiwa.txt` fixes.
- Keep an execution-by-execution handoff record.

### Changes Completed
- Re-checked the `taiwa.txt` items against the current implementation.
- Found one remaining gap in `src/db/card-state-dao.ts`:
  - interday learning cards were treated as review-limit targets when building the queue,
  - but already-reviewed interday learning cards were not counted in the day's `reviewUsage`.
- Added `isInterdayLearningReviewLog()` and now count revlogs with previous state `learning` / `relearning` plus an interday due timestamp as review usage.

### Verification Completed
- `npm.cmd run build` passed.
- `npm.cmd run lint` passed.

### Current State
- The `taiwa.txt` compatibility items appear implemented, including this remaining review-usage fix.
- Worktree is still uncommitted and includes the broader scheduler/sync/tooling updates from the previous session.

### Next Steps
- If needed, the next meaningful step is adding regression coverage for scheduler and sync replay behavior.

## 2026-05-17 JST - Stale folder delete reconciliation

### User Request
- Continue the remaining `@taiwa.txt` fixes.

### Changes Completed
- Re-checked the stale delete behavior and found an additional gap:
  - a stale deleted folder could still hide a newer live card or child-folder edit under that folder,
  - because the folder tombstone itself won even when descendants had newer activity.
- Updated `src/services/sync-service.ts`:
  - `deleteLosesToLiveEdit()` now falls back to the tombstone record's own `updatedAt` when `deleteBaseUpdatedAt` is absent,
  - `reviveDeletedFolderChain()` now revives deleted ancestor folders when live descendant folders/cards have newer timestamps than the delete base.

### Verification Completed
- `npm.cmd run build` passed.
- `npm.cmd run lint` passed.

### Current State
- The previously found stale-delete hole for descendant activity is now closed.
- Remaining meaningful work is regression coverage, not another known `taiwa.txt` item.

### Next Steps
- Add scheduler/sync regression tests so these fixes are protected.

## 2026-05-17 JST - Anki compatibility and sync hardening handoff

### User Request
- Implement all items listed under `#1` in `taiwa.txt`.
- Continue by adding regression tests for SM-2 and sync conflict behavior.
- Save the current progress for handoff and keep a file that records each execution.

### Changes Completed
- Scheduler queue behavior:
  - `src/db/card-state-dao.ts` now uses strict `now` due checks for intraday `learning` / `relearning`.
  - Learn-ahead no longer makes learning cards jump ahead of other available cards in the normal queue.
  - Interday learning is detected and counted/limited with reviews.
  - New/review sort options are resolved from the selected study root deck rather than each card's own deck.
- SM-2 scheduling:
  - `src/services/sm2-engine.ts` converts learning/relearning steps that cross the configured day boundary into day-level due dates.
  - Adds deterministic learning fuzz up to 5 minutes for actual scheduling.
  - Adds deterministic review interval fuzz for actual scheduling.
  - Preview mode does not apply fuzz, so rating button previews stay stable.
- Review history and sync:
  - `src/services/study-session.ts` writes `lastReviewedAt`, scheduler/deck option snapshots, and before/after card-state snapshots into revlogs.
  - `src/services/sync-service.ts` sanitizes remote sync payloads before merging.
  - Revlogs are merged and card states are rebuilt using saved snapshots.
  - Stale deletes no longer automatically beat newer live edits because deleted records now store `deleteBaseUpdatedAt`.
- Delete and recovery:
  - `src/db/card-dao.ts` and `src/db/folder-dao.ts` write `deletedAt` and `deleteBaseUpdatedAt` for soft deletes.
  - `src/app/cards/editor/page.tsx` adds a simple resume button for suspended/leech cards.
  - `src/services/csv-service.ts` excludes deleted cards from CSV export.
- Dependencies and tooling:
  - Removed `uuid`; `src/lib/utils.ts` now uses `crypto.randomUUID()`.
  - Updated `next` to `16.2.6`, `eslint` to `9.x`, and `postcss` to `8.5.10+`.
  - Added `eslint.config.mjs` for ESLint 9 flat config.
  - Updated `package.json` lint script to `eslint . --ext .js,.jsx,.ts,.tsx`.
  - Moved `@import` to the top of `src/app/globals.css` for Next 16/Turbopack CSS parsing.

### Verification Completed
- `npm.cmd run build` passed on Next.js `16.2.6`.
- `npm.cmd run lint` passed after adding flat config and disabling `react-hooks/set-state-in-effect` for existing async-load patterns.
- `npm.cmd audit --omit=dev` reported `found 0 vulnerabilities`.

### Current Worktree State
- Modified:
  - `package-lock.json`
  - `package.json`
  - `src/app/cards/editor/page.tsx`
  - `src/app/globals.css`
  - `src/db/card-dao.ts`
  - `src/db/card-state-dao.ts`
  - `src/db/deck-options-dao.ts`
  - `src/db/folder-dao.ts`
  - `src/lib/types.ts`
  - `src/lib/utils.ts`
  - `src/services/csv-service.ts`
  - `src/services/sm2-engine.ts`
  - `src/services/study-session.ts`
  - `src/services/sync-service.ts`
  - `tsconfig.json`
- Untracked:
  - `.claude/`
  - `eslint.config.mjs`
  - `test-cards-1-100.csv`
  - `RUN_LOG.md`

### Notes
- `.claude/` appears to be local configuration and should not be committed unless the user explicitly asks.
- `test-cards-1-100.csv` is a generated import file with `1..100` front/back values and folder `test-100`.
- `tsconfig.json` was updated automatically by Next 16 during `next build`.
- The review fuzz implementation is deterministic and intentionally approximate; it is not a byte-for-byte port of Anki's scheduler internals.

### Next Steps
- Add focused regression tests for:
  - Learning card does not reappear early while other due cards exist.
  - Empty queue can wait/resume with learn-ahead behavior.
  - Interday learning is counted against review limits.
  - Review interval changes progress through repeated ratings.
  - Revlog replay preserves multi-device review order.
  - Stale delete loses to a newer live edit, while current delete still syncs.
- Re-run `npm.cmd run build`, `npm.cmd run lint`, and `npm.cmd audit --omit=dev` after tests are added.
- Commit/push only after confirming with the user or when explicitly requested.
## 2026-05-17 JST - taiwa.txt verification sweep

### User Request
- Test whether all `#1` fixes from `taiwa.txt` are actually reflected in `anki-reset-web`.

### Changes Completed
- Added pure verification hooks so scheduler/sync/export logic can be checked without IndexedDB/browser hydration:
  - `src/db/card-state-dao.ts`: `buildDueSnapshotFromData()`
  - `src/services/csv-service.ts`: `exportCsvFromData()`
  - `src/services/study-session.ts`: `shouldSuspendLeechCard()`
  - `src/services/sync-service.ts`: `syncDiagnostics.mergeSyncData()` / `sanitizeSyncPayload()`
- Added `src/app/codex-diagnostics/page.tsx` to render a static diagnostics report during `next build`.

### Verification Completed
- `npm.cmd run build` passed.
- `npm.cmd run lint` passed.
- `npm.cmd audit --omit=dev` returned `found 0 vulnerabilities`.
- `out/codex-diagnostics.html` reports all targeted logic checks as `ok: true`:
  - learn-ahead queue ordering
  - interday learning day-boundary conversion
  - interday learning review-limit accounting
  - learning/review fuzz behavior
  - selected-root deck sort option usage
  - leech suspend rule
  - stale delete reconciliation
  - sync payload sanitization
  - CSV export excluding deleted cards
- Source check confirms leech resume UI exists in `src/app/cards/editor/page.tsx` (`handleReactivate`, `Resume Card`).

### Current State
- `taiwa.txt` #1 items now have an explicit verification path plus current pass results.
- `codex-diagnostics` is currently a real app route; remove it before deploy if you do not want the diagnostics page exposed.

### Next Steps
- If desired, remove the diagnostics route after review and keep only the pure helper exports for future regression tests.
## 2026-05-17 JST - Remove public diagnostics route

### User Request
- Remove the temporary public diagnostics route after verification.

### Changes Completed
- Deleted `src/app/codex-diagnostics/page.tsx` so `/codex-diagnostics` is no longer part of the deployed app.
- Kept the pure verification helper exports in place for future regression checks.

### Verification Completed
- `npm.cmd run build` passed and the app routes no longer include `/codex-diagnostics`.
- `npm.cmd run lint` passed.

### Current State
- The public diagnostics page is gone.
- Verification helpers remain available in code if we want to convert them into proper automated tests later.

### Next Steps
- If desired, the next logical step is converting the remaining helper-based checks into a real test runner setup.
## 2026-05-17 JST - Narrow learn-ahead and publish test CSV

### User Request
- Do not early-resurface learning cards immediately unless they are within `<1min`.
- Actually add the 1..100 test cards file.

### Changes Completed
- Updated `src/stores/study-store.ts`:
  - added `SHORT_WAIT_THRESHOLD_MS = 60 * 1000`
  - added `getLearnWaitDelayMs()`
  - learn-ahead is now only applied when the next learning card is due within 60 seconds; otherwise the session waits until the actual due time.
- Added `public/test-cards-1-100.csv` with `1..100` on both front/back and folder `test-100`.

### Verification Completed
- `npm.cmd run build` passed.
- `npm.cmd run lint` passed.
- Confirmed exported asset exists at `out/test-cards-1-100.csv`.

### Current State
- `<1min` cards can still come back early when the queue is empty.
- Cards due in more than 1 minute no longer jump back immediately.
- The CSV is now part of the built app output, not only an untracked root file.

### Next Steps
- If desired, I can also expose a direct download link in the UI or remove the older root-level duplicate CSV.
