'use client';

import { useState, useEffect, useCallback } from 'react';
import { Folder, FolderOpen, FolderClosed, ChevronRight, ChevronDown, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { folderDao } from '@/db/folder-dao';
import { useFolderStore } from '@/stores/folder-store';
import { StudyCountChips } from './study-count-chips';
import type { FolderInfo } from '@/lib/types';

interface FolderNodeProps {
  info: FolderInfo;
  depth: number;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onContextMenu: (info: FolderInfo, e: React.MouseEvent) => void;
}

export function FolderNode({ info, depth, selectedIds, onToggleSelect, onContextMenu }: FolderNodeProps) {
  const [children, setChildren] = useState<FolderInfo[]>([]);
  const revision = useFolderStore((s) => s.revision);
  const expanded = useFolderStore((s) => s.expandedIds.has(info.folder.id));
  const toggleExpanded = useFolderStore((s) => s.toggleExpanded);
  const selected = selectedIds.has(info.folder.id);
  const hasChildren = info.subfolderCount > 0;

  const loadChildren = useCallback(async () => {
    if (!expanded || !hasChildren) return;
    const data = await folderDao.getChildrenInfo(info.folder.id, new Date());
    setChildren(data);
  }, [expanded, hasChildren, info.folder.id]);

  useEffect(() => {
    loadChildren();
  }, [loadChildren, revision]);

  return (
    <div>
      <div
        className={cn(
          'flex items-center min-h-[56px] px-2 border-b border-border/50 cursor-pointer transition-colors',
          'hover:bg-gray-50 dark:hover:bg-gray-900',
          selected && 'bg-primary/5',
        )}
        style={{ paddingLeft: `${8 + depth * 24}px` }}
        onClick={() => hasChildren && toggleExpanded(info.folder.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu(info, e);
        }}
      >
        {/* Checkbox */}
        <label className="flex items-center mr-2" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(info.folder.id)}
            className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary accent-primary"
          />
        </label>

        {/* Folder icon */}
        <div className="text-primary mr-2">
          {expanded ? (
            <FolderOpen size={22} />
          ) : hasChildren ? (
            <FolderClosed size={22} />
          ) : (
            <Folder size={22} />
          )}
        </div>

        {/* Name + counts */}
        <div className="flex-1 min-w-0 py-1">
          <div className="text-base font-semibold truncate">{info.folder.name}</div>
          <StudyCountChips info={info} />
        </div>

        {/* ••• menu button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onContextMenu(info, e);
          }}
          className="p-1 text-muted-foreground hover:text-foreground"
          aria-label="メニュー"
        >
          <MoreVertical size={20} />
        </button>

        {/* Expand toggle */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleExpanded(info.folder.id);
            }}
            className="p-1 text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronDown size={24} /> : <ChevronRight size={24} />}
          </button>
        ) : (
          <div className="w-8" />
        )}
      </div>

      {/* Children */}
      {expanded && hasChildren && children.map((child) => (
        <FolderNode
          key={child.folder.id}
          info={child}
          depth={depth + 1}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  );
}
