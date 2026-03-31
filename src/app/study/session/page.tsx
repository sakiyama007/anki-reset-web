'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { useStudyStore } from '@/stores/study-store';
import { Flashcard } from '@/components/study/flashcard';
import { RatingButtons } from '@/components/study/rating-buttons';
import { CountBar } from '@/components/study/count-bar';
import { Button } from '@/components/ui/button';

export default function StudySessionPageWrapper() {
  return <Suspense><StudySessionPage /></Suspense>;
}

function StudySessionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const foldersParam = searchParams.get('folders') ?? '';
  const name = searchParams.get('name') ?? '学習';

  const {
    queue,
    currentIndex,
    isFlipped,
    counts,
    isLoading,
    isComplete,
    startSession,
    flipCard,
    rateCard,
    reset,
  } = useStudyStore();

  useEffect(() => {
    if (foldersParam) {
      const ids = foldersParam.split(',').filter(Boolean);
      startSession(ids);
    }
    return () => reset();
  }, [foldersParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentCard = queue[currentIndex];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLoading || isComplete || !currentCard) return;
      if (!isFlipped) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          flipCard();
        }
      } else {
        if (e.key === 'k') rateCard('again');
        else if (e.key === 'l') rateCard('hard');
        else if (e.key === ';') rateCard('good');
        else if (e.key === ':') rateCard('easy');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFlipped, isLoading, isComplete, currentCard, flipCard, rateCard]);

  return (
    <div className="flex flex-col h-[100dvh]">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <button onClick={() => router.back()} className="p-1">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="font-semibold">{decodeURIComponent(name)}</h1>
          <CountBar counts={counts} />
        </div>
      </header>

      {/* Content */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-4 py-6 max-w-lg mx-auto w-full"
        onClick={() => { if (!isFlipped && currentCard && !isLoading && !isComplete) flipCard(); }}
      >
        {isLoading ? (
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        ) : isComplete ? (
          <div className="flex flex-col items-center text-center">
            <CheckCircle size={64} className="text-green-500 mb-4" />
            <h2 className="text-xl font-bold mb-2">学習完了</h2>
            <p className="text-muted-foreground mb-6">お疲れ様でした！</p>
            <Button onClick={() => router.back()}>戻る</Button>
          </div>
        ) : currentCard ? (
          <>
            <Flashcard
              front={currentCard.card.front}
              back={currentCard.card.back}
              isFlipped={isFlipped}
              onFlip={flipCard}
            />
          </>
        ) : null}
      </div>

      {/* Rating buttons */}
      {!isLoading && !isComplete && isFlipped && currentCard && (
        <div className="px-4 py-4 border-t border-border max-w-lg mx-auto w-full">
          <RatingButtons
            cardState={currentCard.cardState}
            onRate={rateCard}
          />
        </div>
      )}
    </div>
  );
}
