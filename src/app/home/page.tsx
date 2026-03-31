'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { FolderPlus, BookOpen, Trash2, X } from 'lucide-react';
import { folderDao } from '@/db/folder-dao';
import { useFolderStore } from '@/stores/folder-store';
import { FolderNode } from '@/components/folder/folder-node';
import { FolderContextMenu } from '@/components/folder/folder-context-menu';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTitle, DialogActions } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { AppShell } from '@/components/layout/app-shell';
import type { FolderInfo } from '@/lib/types';

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
  const [folderName, setFolderName] = useState('');
  const [error, setError] = useState('');

  const revision = useFolderStore((s) => s.revision);
  const { createFolder, renameFolder, deleteFolder } = useFolderStore();

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
        allIds.forEach((i) => next.delete(i));
      } else {
        allIds.forEach((i) => next.add(i));
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleStudySelected = async () => {
    if (selectedIds.size === 0) return;
    const allIds: string[] = [];
    for (const id of selectedIds) {
      allIds.push(...(await folderDao.getSelfAndDescendantIds(id)));
    }
    router.push(`/study/session?folders=${allIds.join(',')}&name=${selectedIds.size}フォルダ`);
  };

  const handleDeleteSelected = async () => {
    for (const id of selectedIds) {
      await deleteFolder(id);
    }
    clearSelection();
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

  return (
    <AppShell>
      <div className="flex flex-col h-full">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-background sticky top-0 z-10">
          {isSelecting ? (
            <>
              <div className="flex items-center gap-2">
                <button onClick={clearSelection} className="p-1"><X size={20} /></button>
                <span className="font-semibold">{selectedIds.size}件選択中</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleStudySelected}>
                  <BookOpen size={16} className="mr-1" /> 学習
                </Button>
                <Button size="sm" variant="destructive" onClick={handleDeleteSelected}>
                  <Trash2 size={16} />
                </Button>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-lg font-bold">ホーム</h1>
              <Button size="icon" variant="ghost" onClick={() => {
                setFolderName('');
                setError('');
                setCreateDialog({ parentId: null });
              }}>
                <FolderPlus size={22} />
              </Button>
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
