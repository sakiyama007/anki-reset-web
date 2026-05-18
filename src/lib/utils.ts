import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { AppConstants } from './constants';
import type { SchedulerPreferences } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'unknown';
  let id = localStorage.getItem('anki-reset-device-id');
  if (!id) {
    id = 'web-' + crypto.randomUUID();
    localStorage.setItem('anki-reset-device-id', id);
  }
  return id;
}

export function getSchedulerPreferences(): SchedulerPreferences {
  if (typeof window === 'undefined') {
    return {
      nextDayStartsHour: AppConstants.defaultNextDayStartsHour,
      learnAheadMinutes: AppConstants.defaultLearnAheadMinutes,
    };
  }

  try {
    const raw = localStorage.getItem('anki-reset-settings');
    if (!raw) {
      return {
        nextDayStartsHour: AppConstants.defaultNextDayStartsHour,
        learnAheadMinutes: AppConstants.defaultLearnAheadMinutes,
      };
    }

    const parsed = JSON.parse(raw) as { state?: Partial<SchedulerPreferences>; version?: number };
    const nextDayStartsHour = parsed.state?.nextDayStartsHour;
    const learnAheadMinutes = parsed.state?.learnAheadMinutes;
    const isLegacyLearnAheadDefault =
      (parsed.version === undefined || parsed.version < 1)
      && learnAheadMinutes === 0.5;

    return {
      nextDayStartsHour: typeof nextDayStartsHour === 'number'
        ? Math.min(23, Math.max(0, Math.round(nextDayStartsHour)))
        : AppConstants.defaultNextDayStartsHour,
      learnAheadMinutes: typeof learnAheadMinutes === 'number'
        ? Math.max(
          0,
          isLegacyLearnAheadDefault ? AppConstants.defaultLearnAheadMinutes : learnAheadMinutes,
        )
        : AppConstants.defaultLearnAheadMinutes,
    };
  } catch {
    return {
      nextDayStartsHour: AppConstants.defaultNextDayStartsHour,
      learnAheadMinutes: AppConstants.defaultLearnAheadMinutes,
    };
  }
}

/**
 * 日本標準時 (JST = UTC+9) での日付境界時刻を UTC ベースの Date で返す。
 * 既定は 4:00 JST。
 */
export function jstDayStart(date: Date, nextDayStartsHour = getSchedulerPreferences().nextDayStartsHour): Date {
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000; // UTC+9
  const adjusted = new Date(
    date.getTime() + JST_OFFSET_MS - nextDayStartsHour * 60 * 60 * 1000,
  );
  return new Date(
    Date.UTC(
      adjusted.getUTCFullYear(),
      adjusted.getUTCMonth(),
      adjusted.getUTCDate(),
      nextDayStartsHour,
    )
    - JST_OFFSET_MS,
  );
}

export function jstMidnight(date: Date): Date {
  return jstDayStart(date, 0);
}

export function formatDuePreview(dueDate: Date, now: Date): string {
  const diffMs = dueDate.getTime() - now.getTime();
  const diffSec = Math.max(0, Math.round(diffMs / 1000));

  if (diffSec < 60) return `${Math.max(1, diffSec)}秒`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `< ${diffMin}分`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `< ${diffHours}時間`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `${diffDays}日`;
  const diffMonths = Math.round(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}ヶ月`;
  const diffYears = (diffDays / 365).toFixed(1);
  return `${diffYears}年`;
}
