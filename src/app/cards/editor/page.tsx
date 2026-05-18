'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { cardDao } from '@/db/card-dao';
import { useFolderStore } from '@/stores/folder-store';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogTitle, DialogActions } from '@/components/ui/dialog';
import type { FlashCard } from '@/lib/types';

export default function CardEditorPageWrapper() {
  return <Suspense><CardEditorPage /></Suspense>;
}

function CardEditorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const folderId = searchParams.get('folderId') ?? '';
  const cardId = searchParams.get('cardId');
  const isEdit = !!cardId;

  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [currentCard, setCurrentCard] = useState<FlashCard | null>(null);
  const refresh = useFolderStore((s) => s.refresh);
  const frontRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    frontRef.current?.focus();
  }, []);

  useEffect(() => {
    if (cardId) {
      cardDao.getById(cardId).then((card) => {
        if (card) {
          setCurrentCard(card);
          setFront(card.front);
          setBack(card.back);
        }
      });
    }
  }, [cardId]);

  const handleSave = async () => {
    if (!front.trim() || !back.trim()) return;
    setSaving(true);

    if (isEdit && cardId) {
      const existing = currentCard ?? await cardDao.getById(cardId);
      if (existing) {
        await cardDao.update({ ...existing, front: front.trim(), back: back.trim() });
      }
      refresh();
      router.back();
    } else {
      await cardDao.insert(front.trim(), back.trim(), folderId);
      refresh();
      setFront('');
      setBack('');
      frontRef.current?.focus();
    }

    setSaving(false);
  };

  const handleReactivate = async () => {
    if (!cardId) return;
    await cardDao.reactivate(cardId);
    const reloaded = await cardDao.getById(cardId);
    setCurrentCard(reloaded ?? null);
    refresh();
  };

  const handleDelete = async () => {
    if (!cardId) return;
    await cardDao.delete(cardId);
    refresh();
    setDeleteConfirm(false);
    router.back();
  };

  return (
    <div className="flex flex-col h-[100dvh]">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <button onClick={() => router.back()} className="p-1"><ArrowLeft size={20} /></button>
        <h1 className="flex-1 font-semibold">{isEdit ? 'カード編集' : 'カード作成'}</h1>
        {isEdit && (
          <Button size="icon" variant="ghost" onClick={() => setDeleteConfirm(true)}>
            <Trash2 size={18} className="text-red-500" />
          </Button>
        )}
      </header>

      <div className="flex-1 overflow-auto p-4 space-y-4 max-w-lg mx-auto w-full">
        {(currentCard?.isSuspended || currentCard?.isLeech) && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">This card is currently suspended.</p>
            <p className="mt-1">If this was suspended as a leech, you can resume it here.</p>
            <Button className="mt-3" variant="outline" onClick={handleReactivate}>
              Resume Card
            </Button>
          </div>
        )}
        <div>
          <label className="text-sm font-medium mb-1 block">表面</label>
          <Textarea
            ref={frontRef}
            value={front}
            onChange={(e) => setFront(e.target.value)}
            placeholder="表面のテキスト"
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">裏面</label>
          <Textarea
            value={back}
            onChange={(e) => setBack(e.target.value)}
            placeholder="裏面のテキスト"
          />
        </div>
        <Button
          size="lg"
          className="w-full"
          disabled={!front.trim() || !back.trim() || saving}
          onClick={handleSave}
        >
          {saving ? '保存中...' : isEdit ? '更新' : '保存して次へ'}
        </Button>
      </div>

      {/* Delete confirm dialog */}
      <Dialog open={deleteConfirm} onClose={() => setDeleteConfirm(false)}>
        <DialogTitle>カード削除</DialogTitle>
        <p className="text-sm">
          このカードを削除しますか？
          <br />この操作は取り消せません。
        </p>
        <DialogActions>
          <Button variant="ghost" onClick={() => setDeleteConfirm(false)}>キャンセル</Button>
          <Button variant="destructive" onClick={handleDelete}>削除</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
