'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen } from 'lucide-react';
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
  const revision = useFolderStore((s) => s.revision);

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

  const handleStartStudy = async () => {
    if (selectedIds.size === 0) return;
    const allIds: string[] = [];
    for (const id of selectedIds) {
      allIds.push(...(await folderDao.getSelfAndDescendantIds(id)));
    }
    router.push(`/study/session?folders=${allIds.join(',')}&name=${selectedIds.size}フォルダ`);
  };

  return (
    <AppShell>
      <div className="flex flex-col h-full">
        <header className="px-4 py-3 border-b border-border bg-background sticky top-0 z-10">
          <h1 className="text-lg font-bold">学習</h1>
          <p className="text-sm text-muted-foreground mt-1">
            フォルダを選択して学習を開始
          </p>
        </header>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
            </div>
          ) : folders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <p>フォルダがありません</p>
              <p className="text-sm mt-1">ホーム画面でフォルダを作成してください</p>
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
          <div className="px-4 py-3 border-t border-border bg-primary/5">
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
