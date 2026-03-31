'use client';

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Plus, Search, Trash2, X, Check } from 'lucide-react';
import { cardDao } from '@/db/card-dao';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { FlashCard } from '@/lib/types';
import { AppConstants } from '@/lib/constants';

export default function CardListPageWrapper() {
  return <Suspense><CardListPage /></Suspense>;
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
      setCards((prev) => [...prev, ...results]);
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
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    await cardDao.deleteBatch(Array.from(selectedIds));
    setSelectedIds(new Set());
    setIsSelecting(false);
    loadCards(true);
  };

  const selectAll = () => {
    setSelectedIds(new Set(cards.map(c => c.id)));
  };

  return (
    <div className="flex flex-col h-[100dvh]">
      {/* Header */}
      <header className="px-4 py-3 border-b border-border bg-background sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <button onClick={() => router.back()} className="p-1"><ArrowLeft size={20} /></button>
          {isSelecting ? (
            <>
              <span className="flex-1 font-semibold">{selectedIds.size}件選択</span>
              <Button size="sm" variant="ghost" onClick={selectAll}><Check size={16} className="mr-1" /> 全選択</Button>
              <Button size="sm" variant="destructive" onClick={handleDeleteSelected}><Trash2 size={16} /></Button>
              <Button size="sm" variant="ghost" onClick={() => {
                setIsSelecting(false);
                setSelectedIds(new Set());
              }}><X size={16} /></Button>
            </>
          ) : (
            <>
              <h1 className="flex-1 font-semibold truncate">{decodeURIComponent(folderName)}</h1>
              <Button size="icon" variant="ghost" onClick={() => router.push(`/cards/editor?folderId=${folderId}`)}>
                <Plus size={22} />
              </Button>
            </>
          )}
        </div>

        {/* Search */}
        <div className="mt-2 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="検索..."
            className="pl-9"
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
      </header>

      {/* Card list */}
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
                className="flex items-center px-4 py-3 border-b border-border/50 hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer"
                onClick={() => {
                  if (isSelecting) {
                    toggleSelect(card.id);
                  } else {
                    router.push(`/cards/editor?folderId=${folderId}&cardId=${card.id}`);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setIsSelecting(true);
                  toggleSelect(card.id);
                }}
              >
                {isSelecting && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(card.id)}
                    onChange={() => toggleSelect(card.id)}
                    className="w-5 h-5 mr-3 accent-primary"
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{card.front}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{card.back}</p>
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
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
