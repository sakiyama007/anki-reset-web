'use client';

import { previewDue } from '@/services/sm2-engine';
import { formatDuePreview } from '@/lib/utils';
import type { CardState, Rating } from '@/lib/types';

interface RatingButtonsProps {
  cardState: CardState;
  onRate: (rating: Rating) => void;
}

const ratings: Array<{ rating: Rating; label: string; color: string; hoverColor: string; key: string }> = [
  { rating: 'again', label: 'もう一回', color: 'bg-red-500', hoverColor: 'hover:bg-red-600', key: 'k' },
  { rating: 'hard', label: '難しい', color: 'bg-orange-500', hoverColor: 'hover:bg-orange-600', key: 'l' },
  { rating: 'good', label: '普通', color: 'bg-green-500', hoverColor: 'hover:bg-green-600', key: ';' },
  { rating: 'easy', label: '簡単', color: 'bg-blue-500', hoverColor: 'hover:bg-blue-600', key: ':' },
];

export function RatingButtons({ cardState, onRate }: RatingButtonsProps) {
  const now = new Date();

  return (
    <div className="grid grid-cols-4 gap-2">
      {ratings.map(({ rating, label, color, hoverColor, key }) => {
        const nextDue = previewDue(cardState, rating, now);
        const preview = formatDuePreview(nextDue, now);

        return (
          <button
            key={rating}
            onClick={() => onRate(rating)}
            className={`${color} ${hoverColor} text-white rounded-lg py-3 px-2 flex flex-col items-center transition-colors`}
          >
            <span className="text-xs opacity-60 mb-0.5">[{key}]</span>
            <span className="font-semibold text-sm">{label}</span>
            <span className="text-xs opacity-80 mt-0.5">{preview}</span>
          </button>
        );
      })}
    </div>
  );
}
