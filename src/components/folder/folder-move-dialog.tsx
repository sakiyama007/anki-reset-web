'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen, FolderPlus, Home } from 'lucide-react';
import { folderDao } from '@/db/folder-dao';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { Folder as FolderModel } from '@/lib/types';

interface FolderMoveDialogProps {
  open: boolean;
  sourceFolderIds: string[];
  onClose: () => void;
  onMove: (targetParentId: string | null) => Promise<void>;
  onCreateFolder: (name: string, parentId: string | null) => Promise<string>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function FolderMoveDialog({
  open,
  sourceFolderIds,
  onClose,
  onMove,
  onCreateFolder,
}: FolderMoveDialogProps) {
  const [folders, setFolders] = useState<FolderModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadFolders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await folderDao.getAll();
      setFolders(data.sort((a, b) => a.name.localeCompare(b.name, 'ja')));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setExpandedIds(new Set());
    setSelectedParentId(null);
    setCreating(false);
    setNewFolderName('');
    setError('');
    void loadFolders();
  }, [loadFolders, open, sourceFolderIds]);

  const { childrenByParent, folderById } = useMemo(() => {
    const children = new Map<string | null, FolderModel[]>();
    const byId = new Map<string, FolderModel>();

    for (const folder of folders) {
      byId.set(folder.id, folder);
      const parentId = folder.parentId ?? null;
      const list = children.get(parentId) ?? [];
      list.push(folder);
      children.set(parentId, list);
    }

    for (const list of children.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    }

    return { childrenByParent: children, folderById: byId };
  }, [folders]);

  const blockedIds = useMemo(() => {
    const blocked = new Set(sourceFolderIds);

    const addDescendants = (folderId: string) => {
      for (const child of childrenByParent.get(folderId) ?? []) {
        if (blocked.has(child.id)) continue;
        blocked.add(child.id);
        addDescendants(child.id);
      }
    };

    for (const folderId of sourceFolderIds) {
      addDescendants(folderId);
    }

    return blocked;
  }, [childrenByParent, sourceFolderIds]);

  const destinationName = selectedParentId
    ? folderById.get(selectedParentId)?.name ?? '選択フォルダ'
    : 'ホーム';

  const toggleExpanded = (folderId: string) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const selectDestination = (folder: FolderModel) => {
    if (blockedIds.has(folder.id)) return;
    setSelectedParentId(folder.id);
    if ((childrenByParent.get(folder.id)?.length ?? 0) > 0) {
      toggleExpanded(folder.id);
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;

    try {
      setError('');
      const createdId = await onCreateFolder(name, selectedParentId);
      await loadFolders();
      if (selectedParentId) {
        setExpandedIds((previous) => new Set(previous).add(selectedParentId));
      }
      setSelectedParentId(createdId);
      setNewFolderName('');
      setCreating(false);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    }
  };

  const handleMove = async () => {
    try {
      setSaving(true);
      setError('');
      await onMove(selectedParentId);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const renderRows = (parentId: string | null, depth: number): JSX.Element[] => {
    return (childrenByParent.get(parentId) ?? []).map((folder) => {
      const disabled = blockedIds.has(folder.id);
      const hasChildren = (childrenByParent.get(folder.id)?.length ?? 0) > 0;
      const expanded = expandedIds.has(folder.id);
      const selected = selectedParentId === folder.id;
      const Icon = expanded ? FolderOpen : Folder;

      return (
        <div key={folder.id}>
          <button
            type="button"
            onClick={() => selectDestination(folder)}
            className={cn(
              'flex min-h-[44px] w-full items-center gap-2 border-b border-border/50 px-3 py-2 text-left text-sm transition-colors',
              selected && 'bg-primary/10 text-primary',
              disabled
                ? 'cursor-not-allowed text-muted-foreground opacity-45'
                : 'hover:bg-gray-50 dark:hover:bg-gray-900',
            )}
            style={{ paddingLeft: `${12 + depth * 20}px` }}
          >
            {hasChildren ? (
              expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />
            ) : (
              <span className="w-4" />
            )}
            <Icon size={18} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">{folder.name}</span>
            {disabled && <span className="shrink-0 text-xs">移動不可</span>}
          </button>
          {expanded && renderRows(folder.id, depth + 1)}
        </div>
      );
    });
  };

  return (
    <Dialog open={open} onClose={onClose} className="max-w-lg">
      <div className="flex items-start justify-between gap-3">
        <DialogTitle>フォルダを移動</DialogTitle>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={() => {
            setCreating((value) => !value);
            setError('');
          }}
          aria-label="移動先にフォルダを作成"
        >
          <FolderPlus size={20} />
        </Button>
      </div>

      <div className="max-h-[52dvh] overflow-auto rounded-lg border border-border">
        <button
          type="button"
          onClick={() => setSelectedParentId(null)}
          className={cn(
            'flex min-h-[44px] w-full items-center gap-2 border-b border-border/50 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-900',
            selectedParentId === null && 'bg-primary/10 text-primary',
          )}
        >
          <Home size={18} />
          <span className="font-medium">ホーム</span>
        </button>
        {loading ? (
          <div className="flex justify-center py-6">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          renderRows(null, 0)
        )}
      </div>

      {creating && (
        <div className="mt-4 flex gap-2">
          <Input
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && handleCreateFolder()}
            placeholder={`${destinationName}に新規フォルダ`}
            autoFocus
          />
          <Button type="button" onClick={handleCreateFolder}>
            作成
          </Button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

      <DialogActions>
        <Button type="button" variant="ghost" onClick={onClose}>
          キャンセル
        </Button>
        <Button type="button" onClick={handleMove} disabled={saving || loading}>
          {destinationName}へ移動
        </Button>
      </DialogActions>
    </Dialog>
  );
}
