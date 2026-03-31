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

export function formatDuePreview(dueDate: Date, now: Date): string {
  const diffMs = dueDate.getTime() - now.getTime();
  const diffMin = Math.max(0, Math.round(diffMs / 60000));

  if (diffMin < 60) return `< ${Math.max(1, diffMin)}分`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `< ${diffHours}時間`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `${diffDays}日`;
  const diffMonths = Math.round(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}ヶ月`;
  const diffYears = (diffDays / 365).toFixed(1);
  return `${diffYears}年`;
}
