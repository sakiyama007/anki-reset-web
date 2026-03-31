# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server
npm run build    # Production build (static export)
npm run lint     # Run ESLint
npm run start    # Serve production build
```

## Architecture

**Anki-style flashcard app** — local-first with optional Google Drive sync. Built with Next.js App Router, static export (`output: 'export'`).

### Tech Stack
- **Next.js 14** + React 18, App Router
- **Dexie 4** — IndexedDB wrapper (local-first data storage)
- **Zustand 5** — client state management
- **Tailwind CSS 3** — styling with orange primary palette (`#D97706`) and Noto Serif JP font
- **PapaParse** — CSV import/export

### Data Layer (`src/db/`)
Three IndexedDB tables in `anki-reset` database:
- `folders` — nested folder hierarchy (max depth 5)
- `cards` — flashcard front/back content
- `cardStates` — SM-2 algorithm state per card

DAOs: `folder-dao.ts`, `card-dao.ts`, `card-state-dao.ts`

### Business Logic (`src/services/`)
- `sm2-engine.ts` — SM-2 spaced repetition: `processRating(cardState, rating, now)` → updated CardState. States: `newCard → learning → review`, with `relearning` on lapse
- `study-session.ts` — study queue fetching and card answering. Priority: relearning > learning > review > new
- `csv-service.ts` — import/export with hierarchical folder paths
- `sync-service.ts` — Google Drive sync (last-write-wins, appDataFolder)
- `google-auth.ts` / `google-drive.ts` — OAuth 2.0 + Drive API wrappers

### State (`src/stores/`)
- `study-store.ts` — active study session (queue, flip state, counts)
- `folder-store.ts` — folder tree with revision counter for reactive updates
- `settings-store.ts` — theme + last sync time, persisted to localStorage as `anki-reset-settings`

### Pages (`src/app/`)
- `/home` — folder tree with context menu (create/rename/delete/add card)
- `/study` — folder selection for study session
- `/study/session` — card flip UI with 4-button rating (again/hard/good/easy)
- `/cards/list` — paginated card list with search (50/page, 300ms debounce)
- `/cards/editor` — create/edit single card
- `/settings` — theme, Google Drive sync, CSV, DB stats

### Components (`src/components/`)
- `ui/` — Button (variants: primary/secondary/ghost/destructive/outline), Dialog, Input, Textarea
- `layout/app-shell.tsx` — sidebar on desktop, bottom nav on mobile
- `study/flashcard.tsx` — 3D CSS flip animation
- `folder/folder-node.tsx` — recursive folder tree node

### Key Utilities (`src/lib/`)
- `utils.ts` — `cn()`, `generateId()` (UUID v4), `nowISO()`, `formatDuePreview()` (Japanese time strings)
- `constants.ts` — SM-2 config (learning steps, ease factors, intervals)

### Types (`src/types/`)
Core types: `Folder`, `FlashCard`, `CardState`, `CardStudyState` (`newCard|learning|review|relearning`), `Rating` (`again|hard|good|easy`), `FolderInfo`, `StudyCounts`

## Environment

Copy `.env.local.example` to `.env.local` and set:
```
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```
Google Drive sync requires the Drive API enabled with `drive.appdata` scope.

## UI Language

The entire UI is in Japanese. All user-facing strings, error messages, and time formatting must use Japanese.
