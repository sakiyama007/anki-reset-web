import { v4 as uuidv4 } from 'uuid';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(): string {
  return uuidv4();
}

export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * 日本標準時 (JST = UTC+9) での当日 0:00 を UTC ベースの Date で返す。
 * JST は通年 UTC+9 固定（サマータイムなし）なので計算が安定する。
 * 例: 2024-01-15 10:00 JST → 2024-01-14T15:00:00.000Z
 */
export function jstMidnight(date: Date): Date {
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000; // UTC+9
  const jstDate = new Date(date.getTime() + JST_OFFSET_MS);
  return new Date(
    Date.UTC(jstDate.getUTCFullYear(), jstDate.getUTCMonth(), jstDate.getUTCDate())
    - JST_OFFSET_MS,
  );
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
