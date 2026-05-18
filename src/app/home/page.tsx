'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { FolderPlus, BookOpen, CheckSquare, Trash2, X } from 'lucide-react';
import { folderDao } from '@/db/folder-dao';
import { deckOptionsDao } from '@/db/deck-options-dao';
import { useFolderStore } from '@/stores/folder-store';
import { FolderNode } from '@/components/folder/folder-node';
import { FolderContextMenu } from '@/components/folder/folder-context-menu';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTitle, DialogActions } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { AppShell } from '@/components/layout/app-shell';
import type { DeckOptions, FolderInfo } from '@/lib/types';

type DeckOptionsForm = {
  learningSteps: string;
  relearningSteps: string;
  graduatingInterval: string;
  easyGraduationInterval: string;
  newIntervalPercent: string;
  minimumLapseInterval: string;
  newCardsPerDay: string;
  maxReviewsPerDay: string;
  leechThreshold: string;
  newCardInsertionOrder: DeckOptions['newCardInsertionOrder'];
  reviewSortOrder: DeckOptions['reviewSortOrder'];
};

function stepsToString(steps: number[]): string {
  return steps.join(' ');
}

function parseSteps(input: string): number[] {
  return input
    .split(/[\s,]+/)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
}

export default function HomePage() {
  const router = useRouter();
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{
    info: FolderInfo;
    position: { x: number; y: number };
  } | null>(null);
  const [createDialog, setCreateDialog] = useState<{ parentId: string | null } | null>(null);
  const [renameDialog, setRenameDialog] = useState<FolderInfo | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<FolderInfo | null>(null);
  const [deleteBatchConfirm, setDeleteBatchConfirm] = useState(false);
  const [deckOptionsDialog, setDeckOptionsDialog] = useState<FolderInfo | null>(null);
  const [deckOptionsForm, setDeckOptionsForm] = useState<DeckOptionsForm | null>(null);
  const [hasOwnDeckOptions, setHasOwnDeckOptions] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [error, setError] = useState('');
  const [deckOptionsError, setDeckOptionsError] = useState('');

  const revision = useFolderStore((s) => s.revision);
  const { createFolder, renameFolder, deleteFolder, refresh } = useFolderStore();

  const isSelecting = selectedIds.size > 0;

  const loadFolders = useCallback(async () => {
    setLoading(true);
    const data = await folderDao.getChildrenInfo(null, new Date());
    setFolders(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders, revision]);

  const toggleSelect = async (id: string) => {
    const allIds = await folderDao.getSelfAndDescendantIds(id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        allIds.forEach((folderId) => next.delete(folderId));
      } else {
        allIds.forEach((folderId) => next.add(folderId));
      }
      return next;
    });
  };

  const selectAllFolders = async () => {
    const allFolders = await folderDao.getAll();
    setSelectedIds(new Set(allFolders.map((folder) => folder.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleStudySelected = async () => {
    if (selectedIds.size === 0) return;
    const rootIds = await folderDao.getSelectedRootIds(Array.from(selectedIds));
    const allIds = new Set<string>();
    for (const id of rootIds) {
      const folderIds = await folderDao.getSelfAndDescendantIds(id);
      folderIds.forEach((folderId) => allIds.add(folderId));
    }
    router.push(`/study/session?folders=${Array.from(allIds).join(',')}&roots=${rootIds.join(',')}&name=${rootIds.length}フォルダ`);
  };

  const handleDeleteSelected = async () => {
    for (const id of selectedIds) {
      await deleteFolder(id);
    }
    clearSelection();
    setDeleteBatchConfirm(false);
  };

  const handleCreate = async () => {
    if (!folderName.trim()) return;
    try {
      setError('');
      await createFolder(folderName.trim(), createDialog?.parentId ?? null);
      setCreateDialog(null);
      setFolderName('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRename = async () => {
    if (!folderName.trim() || !renameDialog) return;
    try {
      setError('');
      await renameFolder(renameDialog.folder.id, folderName.trim());
      setRenameDialog(null);
      setFolderName('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog) return;
    await deleteFolder(deleteDialog.folder.id);
    setDeleteDialog(null);
  };

  const openDeckOptionsDialog = async (info: FolderInfo) => {
    const [effective, own] = await Promise.all([
      deckOptionsDao.getEffective(info.folder.id),
      deckOptionsDao.getOwn(info.folder.id),
    ]);
    setHasOwnDeckOptions(!!own);
    setDeckOptionsError('');
    setDeckOptionsForm({
      learningSteps: stepsToString(effective.learningStepsMinutes),
      relearningSteps: stepsToString(effective.relearningStepsMinutes),
      graduatingInterval: String(effective.graduatingInterval),
      easyGraduationInterval: String(effective.easyGraduationInterval),
      newIntervalPercent: String(Math.round(effective.lapseNewInterval * 100)),
      minimumLapseInterval: String(effective.minimumLapseInterval),
      newCardsPerDay: String(effective.newCardsPerDay),
      maxReviewsPerDay: String(effective.maxReviewsPerDay),
      leechThreshold: String(effective.leechThreshold),
      newCardInsertionOrder: effective.newCardInsertionOrder,
      reviewSortOrder: effective.reviewSortOrder,
    });
    setDeckOptionsDialog(info);
  };

  const handleSaveDeckOptions = async () => {
    if (!deckOptionsDialog || !deckOptionsForm) return;

    try {
      const learningStepsMinutes = parseSteps(deckOptionsForm.learningSteps);
      const relearningStepsMinutes = parseSteps(deckOptionsForm.relearningSteps);
      if (learningStepsMinutes.length === 0 || relearningStepsMinutes.length === 0) {
        throw new Error('学習ステップを1つ以上入力してください');
      }

      const current = await deckOptionsDao.getEffective(deckOptionsDialog.folder.id);
      const nextOptions: DeckOptions = deckOptionsDao.normalize(deckOptionsDialog.folder.id, {
        ...current,
        learningStepsMinutes,
        relearningStepsMinutes,
        graduatingInterval: Number(deckOptionsForm.graduatingInterval),
        easyGraduationInterval: Number(deckOptionsForm.easyGraduationInterval),
        lapseNewInterval: Number(deckOptionsForm.newIntervalPercent) / 100,
        minimumLapseInterval: Number(deckOptionsForm.minimumLapseInterval),
        newCardsPerDay: Number(deckOptionsForm.newCardsPerDay),
        maxReviewsPerDay: Number(deckOptionsForm.maxReviewsPerDay),
        leechThreshold: Number(deckOptionsForm.leechThreshold),
        newCardInsertionOrder: deckOptionsForm.newCardInsertionOrder,
        reviewSortOrder: deckOptionsForm.reviewSortOrder,
      });

      await deckOptionsDao.upsert(nextOptions);
      setDeckOptionsDialog(null);
      setDeckOptionsForm(null);
      refresh();
    } catch (e: unknown) {
      setDeckOptionsError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleClearDeckOptions = async () => {
    if (!deckOptionsDialog) return;
    await deckOptionsDao.clear(deckOptionsDialog.folder.id);
    setDeckOptionsDialog(null);
    setDeckOptionsForm(null);
    refresh();
  };

  return (
    <AppShell>
      <div className="flex flex-col h-full">
        {/* Header */}
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-background sticky top-0 z-10">
          {isSelecting ? (
            <>
              <div className="flex items-center gap-2">
                <button onClick={clearSelection} className="p-1"><X size={20} /></button>
                <span className="font-semibold">{selectedIds.size}件選択中</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={selectAllFolders}>
                  <CheckSquare size={16} className="mr-1" /> 全選択
                </Button>
                <Button size="sm" onClick={handleStudySelected}>
                  <BookOpen size={16} className="mr-1" /> 学習
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setDeleteBatchConfirm(true)}>
                  <Trash2 size={16} />
                </Button>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-lg font-bold">ホーム</h1>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={selectAllFolders}>
                  <CheckSquare size={16} className="mr-1" /> 全選択
                </Button>
                <Button size="icon" variant="ghost" onClick={() => {
                  setFolderName('');
                  setError('');
                  setCreateDialog({ parentId: null });
                }}>
                  <FolderPlus size={22} />
                </Button>
              </div>
            </>
          )}
        </header>

        {/* Folder tree */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
            </div>
          ) : folders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <FolderPlus size={48} className="mb-4 opacity-50" />
              <p className="mb-4">フォルダがありません</p>
              <Button onClick={() => {
                setFolderName('');
                setError('');
                setCreateDialog({ parentId: null });
              }}>
                フォルダ作成
              </Button>
            </div>
          ) : (
            folders.map((info) => (
              <FolderNode
                key={info.folder.id}
                info={info}
                depth={0}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onContextMenu={(info, e) =>
                  setContextMenu({ info, position: { x: e.clientX, y: e.clientY } })
                }
              />
            ))
          )}
        </div>

        {/* Study button (bottom) */}
        {isSelecting && (
          <div className="px-4 py-3 border-t border-border bg-primary/5">
            <Button size="lg" className="w-full" onClick={handleStudySelected}>
              <BookOpen size={18} className="mr-2" />
              {selectedIds.size}フォルダを学習
            </Button>
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <FolderContextMenu
          info={contextMenu.info}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onCardList={(info) => router.push(`/cards/list?folderId=${info.folder.id}&name=${encodeURIComponent(info.folder.name)}`)}
          onAddCard={(folderId) => router.push(`/cards/editor?folderId=${folderId}`)}
          onAddSubfolder={(parentId) => {
            setFolderName('');
            setError('');
            setCreateDialog({ parentId });
          }}
          onDeckOptions={openDeckOptionsDialog}
          onRename={(info) => {
            setFolderName(info.folder.name);
            setError('');
            setRenameDialog(info);
          }}
          onDelete={(info) => setDeleteDialog(info)}
        />
      )}

      {/* Create folder dialog */}
      <Dialog open={createDialog !== null} onClose={() => setCreateDialog(null)}>
        <DialogTitle>{createDialog?.parentId ? 'サブフォルダ作成' : '新しいフォルダ'}</DialogTitle>
        <Input
          placeholder="フォルダ名"
          value={folderName}
          onChange={(e) => setFolderName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          autoFocus
        />
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        <DialogActions>
          <Button variant="ghost" onClick={() => setCreateDialog(null)}>キャンセル</Button>
          <Button onClick={handleCreate}>作成</Button>
        </DialogActions>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={renameDialog !== null} onClose={() => setRenameDialog(null)}>
        <DialogTitle>名前変更</DialogTitle>
        <Input
          value={folderName}
          onChange={(e) => setFolderName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleRename()}
          autoFocus
        />
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        <DialogActions>
          <Button variant="ghost" onClick={() => setRenameDialog(null)}>キャンセル</Button>
          <Button onClick={handleRename}>変更</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deckOptionsDialog !== null} onClose={() => setDeckOptionsDialog(null)} className="max-w-xl">
        <DialogTitle>デッキ設定</DialogTitle>
        {deckOptionsForm && (
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 text-sm">
              <span className="block mb-1">学習ステップ (分)</span>
              <Input
                value={deckOptionsForm.learningSteps}
                onChange={(e) => setDeckOptionsForm({ ...deckOptionsForm, learningSteps: e.target.value })}
              />
            </label>
            <label className="col-span-2 text-sm">
              <span className="block mb-1">再学習ステップ (分)</span>
              <Input
                value={deckOptionsForm.relearningSteps}
                onChange={(e) => setDeckOptionsForm({ ...deckOptionsForm, relearningSteps: e.target.value })}
              />
            </label>
            <label className="text-sm">
              <span className="block mb-1">卒業間隔(日)</span>
              <Input
                type="number"
                min={1}
                value={deckOptionsForm.graduatingInterval}
                onChange={(e) => setDeckOptionsForm({ ...deckOptionsForm, graduatingInterval: e.target.value })}
              />
            </label>
            <label className="text-sm">
              <span className="block mb-1">Easy間隔(日)</span>
              <Input
                type="number"
                min={1}
                value={deckOptionsForm.easyGraduationInterval}
                onChange={(e) => setDeckOptionsForm({ ...deckOptionsForm, easyGraduationInterval: e.target.value })}
              />
            </label>
            <label className="text-sm">
              <span className="block mb-1">New Interval(%)</span>
              <Input
                type="number"
                min={0}
                max={100}
                value={deckOptionsForm.newIntervalPercent}
                onChange={(e) => setDeckOptionsForm({ ...deckOptionsForm, newIntervalPercent: e.target.value })}
              />
            </label>
            <label className="text-sm">
              <span className="block mb-1">最小間隔(日)</span>
              <Input
                type="number"
                min={1}
                value={deckOptionsForm.minimumLapseInterval}
                onChange={(e) => setDeckOptionsForm({ ...deckOptionsForm, minimumLapseInterval: e.target.value })}
              />
            </label>
            <label className="text-sm">
              <span className="block mb-1">新規/日</span>
              <Input
                type="number"
                min={0}
                value={deckOptionsForm.newCardsPerDay}
                onChange={(e) => setDeckOptionsForm({ ...deckOptionsForm, newCardsPerDay: e.target.value })}
              />
            </label>
            <label className="text-sm">
              <span className="block mb-1">復習/日</span>
              <Input
                type="number"
                min={0}
                value={deckOptionsForm.maxReviewsPerDay}
                onChange={(e) => setDeckOptionsForm({ ...deckOptionsForm, maxReviewsPerDay: e.target.value })}
              />
            </label>
            <label className="text-sm">
              <span className="block mb-1">Leech閾値</span>
              <Input
                type="number"
                min={1}
                value={deckOptionsForm.leechThreshold}
                onChange={(e) => setDeckOptionsForm({ ...deckOptionsForm, leechThreshold: e.target.value })}
              />
            </label>
            <label className="text-sm">
              <span className="block mb-1">新規カード順</span>
              <select
                value={deckOptionsForm.newCardInsertionOrder}
                onChange={(e) => setDeckOptionsForm({
                  ...deckOptionsForm,
                  newCardInsertionOrder: e.target.value as DeckOptions['newCardInsertionOrder'],
                })}
                className="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="sequential">順番</option>
                <option value="random">ランダム</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="block mb-1">復習ソート</span>
              <select
                value={deckOptionsForm.reviewSortOrder}
                onChange={(e) => setDeckOptionsForm({
                  ...deckOptionsForm,
                  reviewSortOrder: e.target.value as DeckOptions['reviewSortOrder'],
                })}
                className="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="dueAscRandom">期限順+乱択</option>
                <option value="dueAsc">期限順</option>
              </select>
            </label>
          </div>
        )}
        {deckOptionsError && <p className="text-red-500 text-sm mt-3">{deckOptionsError}</p>}
        <DialogActions>
          {hasOwnDeckOptions && (
            <Button variant="ghost" onClick={handleClearDeckOptions}>
              親設定に戻す
            </Button>
          )}
          <Button variant="ghost" onClick={() => setDeckOptionsDialog(null)}>キャンセル</Button>
          <Button onClick={handleSaveDeckOptions}>保存</Button>
        </DialogActions>
      </Dialog>

      {/* Batch delete confirm dialog */}
      <Dialog open={deleteBatchConfirm} onClose={() => setDeleteBatchConfirm(false)}>
        <DialogTitle>フォルダ削除</DialogTitle>
        <p className="text-sm">
          {selectedIds.size}個のフォルダとその中のカードを全て削除しますか？
          <br />この操作は取り消せません。
        </p>
        <DialogActions>
          <Button variant="ghost" onClick={() => setDeleteBatchConfirm(false)}>キャンセル</Button>
          <Button variant="destructive" onClick={handleDeleteSelected}>削除</Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={deleteDialog !== null} onClose={() => setDeleteDialog(null)}>
        <DialogTitle>フォルダ削除</DialogTitle>
        <p className="text-sm">
          「{deleteDialog?.folder.name}」とその中のカード{deleteDialog?.cardCount}枚を削除しますか？
          <br />この操作は取り消せません。
        </p>
        <DialogActions>
          <Button variant="ghost" onClick={() => setDeleteDialog(null)}>キャンセル</Button>
          <Button variant="destructive" onClick={handleDelete}>削除</Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
