'use client';

import type { FolderInfo } from '@/lib/types';

export function StudyCountChips({ info }: { info: FolderInfo }) {
  const hasAny = info.newCount > 0 || info.learningCount > 0 || info.reviewCount > 0;

  if (!hasAny) {
    return (
      <span className="text-xs text-muted-foreground">
        {info.cardCount}枚
        {info.subfolderCount > 0 && ` · ${info.subfolderCount}フォルダ`}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {info.newCount > 0 && (
        <span className="px-1.5 py-0.5 text-xs font-semibold rounded bg-blue-500/15 text-blue-600">
          新{info.newCount}
        </span>
      )}
      {info.learningCount > 0 && (
        <span className="px-1.5 py-0.5 text-xs font-semibold rounded bg-orange-500/15 text-orange-600">
          学{info.learningCount}
        </span>
      )}
      {info.reviewCount > 0 && (
        <span className="px-1.5 py-0.5 text-xs font-semibold rounded bg-green-500/15 text-green-600">
          復{info.reviewCount}
        </span>
      )}
      <span className="text-xs text-muted-foreground ml-1">{info.cardCount}枚</span>
    </div>
  );
}
