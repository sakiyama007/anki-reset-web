'use client';

import type { StudyCounts } from '@/lib/types';

export function CountBar({ counts }: { counts: StudyCounts }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-blue-600 font-medium">新規: {counts.new}</span>
      <span className="text-orange-500 font-medium">学習中: {counts.learning}</span>
      <span className="text-green-600 font-medium">復習: {counts.review}</span>
    </div>
  );
}
