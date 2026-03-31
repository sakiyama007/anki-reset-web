'use client';

import { cn } from '@/lib/utils';

interface FlashcardProps {
  front: string;
  back: string;
  isFlipped: boolean;
  onFlip: () => void;
}

export function Flashcard({ front, back, isFlipped, onFlip }: FlashcardProps) {
  return (
    <div
      className="flip-card w-full cursor-pointer select-none"
      style={{ minHeight: '300px' }}
      onClick={onFlip}
    >
      <div className={cn('flip-card-inner relative w-full h-full', isFlipped && 'flipped')}>
        {/* Front */}
        <div className="flip-card-front absolute inset-0 flex flex-col items-center justify-center p-6 bg-background border border-border rounded-xl shadow-sm">
          <span className="text-xs text-muted-foreground mb-4">表面</span>
          <p className="text-xl font-semibold text-center whitespace-pre-wrap break-words">{front}</p>
          <span className="text-xs text-muted-foreground mt-6">クリック / Enter で裏面を表示</span>
        </div>

        {/* Back */}
        <div className="flip-card-back absolute inset-0 flex flex-col items-center justify-center p-6 bg-background border border-border rounded-xl shadow-sm">
          <div className="text-center mb-4">
            <span className="text-xs text-muted-foreground">表面</span>
            <p className="text-base mt-1">{front}</p>
          </div>
          <div className="w-full border-t border-border my-3" />
          <div className="text-center">
            <span className="text-xs text-muted-foreground">裏面</span>
            <p className="text-xl font-semibold mt-1 whitespace-pre-wrap break-words">{back}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
