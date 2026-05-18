'use client';

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, Edit, Plus, Search, Trash2, X } from 'lucide-react';
import { cardDao } from '@/db/card-dao';
import { revlogDao } from '@/db/revlog-dao';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogTitle, DialogActions } from '@/components/ui/dialog';
import type { FlashCard, Rating, Revlog } from '@/lib/types';
import { AppConstants } from '@/lib/constants';

const ratingLabels: Record<Rating, string> = {
  again: 'Again',
  hard: 'Hard',
  good: 'Good',
  easy: 'Easy',
};

const stateLabels: Record<string, string> = {
  newCard: '新規',
  learning: '学習中',
  review: '復習',
  relearning: '再学習',
};

export default function CardListPageWrapper() {
  return <Suspense><CardListPage /></Suspense>;
}

function formatReviewedAt(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function formatInterval(days: number): string {
  if (days <= 0) return '当日';
  return `${days}日`;
}

function CardListPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const folderId = searchParams.get('folderId') ?? '';
  const folderName = searchParams.get('name') ?? 'カード一覧';

  const [cards, setCards] = useState<FlashCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [detailCard, setDetailCard] = useState<FlashCard | null>(null);
  const [detailLogs, setDetailLogs] = useState<Revlog[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const offsetRef = useRef(0);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const loadCards = useCallback(async (reset = false) => {
    if (!folderId) return;
    if (reset) {
      offsetRef.current = 0;
      setHasMore(true);
    }
    setLoading(true);

    const results = searchQuery
      ? await cardDao.search(searchQuery, folderId, AppConstants.pageSize, offsetRef.current)
      : await cardDao.getByFolder(folderId, AppConstants.pageSize, offsetRef.current);

    if (reset) {
      setCards(results);
    } else {
      setCards((previous) => [...previous, ...results]);
    }
    setHasMore(results.length >= AppConstants.pageSize);
    offsetRef.current += results.length;
    setLoading(false);
  }, [folderId, searchQuery]);

  useEffect(() => {
    loadCards(true);
  }, [loadCards]);

  const handleSearch = (value: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSearchQuery(value);
    }, 300);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openDetail = async (card: FlashCard) => {
    setDetailCard(card);
    setDetailLogs([]);
    setDetailLoading(true);
    try {
      const logs = await revlogDao.getByCardId(card.id);
      setDetailLogs(logs);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailCard(null);
    setDetailLogs([]);
    setDetailLoading(false);
  };

  const handleDeleteSelected = async () => {
    await cardDao.deleteBatch(Array.from(selectedIds));
    setSelectedIds(new Set());
    setIsSelecting(false);
    setDeleteConfirm(false);
    loadCards(true);
  };

  const selectAll = () => {
    setSelectedIds(new Set(cards.map((card) => card.id)));
  };

  const goToEditor = (cardId?: string) => {
    const suffix = cardId ? `&cardId=${cardId}` : '';
    router.push(`/cards/editor?folderId=${folderId}${suffix}`);
  };

  return (
    <div className="flex h-[100dvh] flex-col" onClick={(event) => event.stopPropagation()}>
      <header className="sticky top-0 z-10 border-b border-border bg-background px-4 py-3">
        <div className="flex items-center gap-2">
          <button onClick={() => router.back()} className="p-1">
            <ArrowLeft size={20} />
          </button>
          {isSelecting ? (
            <>
              <span className="flex-1 font-semibold">{selectedIds.size}件選択</span>
              <Button size="sm" variant="ghost" onClick={selectAll}>
                <Check size={16} className="mr-1" /> 全選択
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setDeleteConfirm(true)}>
                <Trash2 size={16} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsSelecting(false);
                  setSelectedIds(new Set());
                }}
              >
                <X size={16} />
              </Button>
            </>
          ) : (
            <>
              <h1 className="flex-1 truncate font-semibold">{decodeURIComponent(folderName)}</h1>
              <Button size="icon" variant="ghost" onClick={() => goToEditor()}>
                <Plus size={22} />
              </Button>
            </>
          )}
        </div>

        <div className="relative mt-2">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="検索..."
            className="pl-9"
            onChange={(event) => handleSearch(event.target.value)}
          />
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        {cards.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <p>カードがありません</p>
          </div>
        ) : (
          <div>
            {cards.map((card) => (
              <div
                key={card.id}
                className="flex cursor-pointer items-center border-b border-border/50 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900"
                onClick={() => {
                  if (isSelecting) {
                    toggleSelect(card.id);
                  } else {
                    openDetail(card);
                  }
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setIsSelecting(true);
                  toggleSelect(card.id);
                }}
              >
                {isSelecting && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(card.id)}
                    onChange={() => toggleSelect(card.id)}
                    className="mr-3 h-5 w-5 accent-primary"
                    onClick={(event) => event.stopPropagation()}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{card.front}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{card.back}</p>
                </div>
              </div>
            ))}
            {hasMore && !loading && (
              <button
                className="w-full py-3 text-sm text-primary hover:bg-primary/5"
                onClick={() => loadCards(false)}
              >
                もっと読み込む
              </button>
            )}
            {loading && (
              <div className="flex justify-center py-4">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={detailCard !== null} onClose={closeDetail} className="max-w-2xl">
        {detailCard && (
          <>
            <DialogTitle>カード詳細</DialogTitle>
            <div className="space-y-4">
              <section className="space-y-2 rounded-lg border border-border p-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">表</p>
                  <p className="whitespace-pre-wrap text-sm">{detailCard.front}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">裏</p>
                  <p className="whitespace-pre-wrap text-sm">{detailCard.back}</p>
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold">学習履歴</h3>
                {detailLoading ? (
                  <div className="flex justify-center py-6">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                ) : detailLogs.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                    まだ学習履歴がありません
                  </p>
                ) : (
                  <div className="max-h-[45vh] overflow-auto rounded-lg border border-border">
                    {detailLogs.map((log) => (
                      <div key={log.id} className="border-b border-border px-3 py-2 last:border-b-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-sm font-medium">{formatReviewedAt(log.reviewedAt)}</span>
                          <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                            {ratingLabels[log.rating]}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {stateLabels[log.previousState] ?? log.previousState}
                          {' -> '}
                          {stateLabels[log.newState] ?? log.newState}
                          {' / interval '}
                          {formatInterval(log.previousInterval)}
                          {' -> '}
                          {formatInterval(log.newInterval)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          次回: {formatReviewedAt(log.newDue)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
            <DialogActions>
              <Button variant="ghost" onClick={closeDetail}>閉じる</Button>
              <Button onClick={() => goToEditor(detailCard.id)}>
                <Edit size={16} className="mr-1" />
                編集
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <Dialog open={deleteConfirm} onClose={() => setDeleteConfirm(false)}>
        <DialogTitle>カード削除</DialogTitle>
        <p className="text-sm">
          {selectedIds.size}枚のカードを削除しますか？
          <br />この操作は取り消せません。
        </p>
        <DialogActions>
          <Button variant="ghost" onClick={() => setDeleteConfirm(false)}>キャンセル</Button>
          <Button variant="destructive" onClick={handleDeleteSelected}>削除</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
