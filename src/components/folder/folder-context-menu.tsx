'use client';

import { useEffect, useRef } from 'react';
import { List, Plus, FolderPlus, Pencil, Trash2 } from 'lucide-react';
import type { FolderInfo } from '@/lib/types';

interface ContextMenuProps {
  info: FolderInfo;
  position: { x: number; y: number };
  onClose: () => void;
  onCardList: (info: FolderInfo) => void;
  onAddCard: (folderId: string) => void;
  onAddSubfolder: (parentId: string) => void;
  onRename: (info: FolderInfo) => void;
  onDelete: (info: FolderInfo) => void;
}

export function FolderContextMenu({
  info,
  position,
  onClose,
  onCardList,
  onAddCard,
  onAddSubfolder,
  onRename,
  onDelete,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const items = [
    { label: 'カード一覧', icon: List, action: () => onCardList(info) },
    { label: 'カードを追加', icon: Plus, action: () => onAddCard(info.folder.id) },
    { label: 'サブフォルダを追加', icon: FolderPlus, action: () => onAddSubfolder(info.folder.id) },
    { label: '名前変更', icon: Pencil, action: () => onRename(info) },
    { label: '削除', icon: Trash2, action: () => onDelete(info), destructive: true },
  ];

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-background border border-border rounded-lg shadow-lg py-1 min-w-[180px]"
      style={{
        left: Math.min(position.x, window.innerWidth - 200),
        top: Math.min(position.y, window.innerHeight - 280),
      }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => {
            onClose();
            item.action();
          }}
          className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted dark:hover:bg-gray-800 transition-colors ${
            item.destructive ? 'text-red-500' : ''
          }`}
        >
          <item.icon size={16} />
          {item.label}
        </button>
      ))}
    </div>
  );
}
