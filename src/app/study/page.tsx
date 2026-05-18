'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, CheckSquare, XSquare } from 'lucide-react';
import { folderDao } from '@/db/folder-dao';
import { useFolderStore } from '@/stores/folder-store';
import { FolderNode } from '@/components/folder/folder-node';
import { Button } from '@/components/ui/button';
import { AppShell } from '@/components/layout/app-shell';
import type { FolderInfo } from '@/lib/types';

export default function StudySelectPage() {
  const router = useRouter();
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const revision = useFolderStore((state) => state.revision);

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
    setSelectedIds((previous) => {
      const next = new Set(previous);
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

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleStartStudy = async () => {
    if (selectedIds.size === 0) return;

    const rootIds = await folderDao.getSelectedRootIds(Array.from(selectedIds));
    const allIds = new Set<string>();

    for (const id of rootIds) {
      const folderIds = await folderDao.getSelfAndDescendantIds(id);
      folderIds.forEach((folderId) => allIds.add(folderId));
    }

    router.push(
      `/study/session?folders=${Array.from(allIds).join(',')}&roots=${rootIds.join(',')}&name=${rootIds.length}フォルダ`,
    );
  };

  return (
    <AppShell>
      <div className="flex h-full flex-col">
        <header className="sticky top-0 z-10 border-b border-border bg-background px-4 py-3">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-bold">学習</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                フォルダを選択して学習を開始
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="ghost" onClick={selectAllFolders}>
                <CheckSquare size={16} className="mr-1" />
                全選択
              </Button>
              {selectedIds.size > 0 && (
                <Button size="sm" variant="ghost" onClick={clearSelection}>
                  <XSquare size={16} className="mr-1" />
                  選択解除
                </Button>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : folders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <p>フォルダがありません</p>
              <p className="mt-1 text-sm">ホーム画面でフォルダを作成してください</p>
            </div>
          ) : (
            folders.map((info) => (
              <FolderNode
                key={info.folder.id}
                info={info}
                depth={0}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onContextMenu={() => {}}
              />
            ))
          )}
        </div>

        {selectedIds.size > 0 && (
          <div className="border-t border-border bg-primary/5 px-4 py-3">
            <Button size="lg" className="w-full" onClick={handleStartStudy}>
              <BookOpen size={18} className="mr-2" />
              学習開始
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
