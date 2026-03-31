import { create } from 'zustand';
import { folderDao } from '@/db/folder-dao';
import type { FolderInfo } from '@/lib/types';
import { AppConstants } from '@/lib/constants';

interface FolderState {
  revision: number;
  expandedIds: Set<string>;
  refresh: () => void;
  toggleExpanded: (id: string) => void;
  createFolder: (name: string, parentId: string | null) => Promise<void>;
  renameFolder: (id: string, newName: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
}

export const useFolderStore = create<FolderState>((set, get) => ({
  revision: 0,
  expandedIds: new Set<string>(),

  refresh: () => set({ revision: get().revision + 1 }),

  toggleExpanded: (id: string) =>
    set((state) => {
      const next = new Set(state.expandedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { expandedIds: next };
    }),

  createFolder: async (name: string, parentId: string | null) => {
    const depth = await folderDao.getChildDepth(parentId);
    if (depth > AppConstants.maxFolderDepth) {
      throw new Error(`フォルダの最大階層数(${AppConstants.maxFolderDepth})を超えています`);
    }
    const exists = await folderDao.nameExistsAtLevel(name, parentId);
    if (exists) {
      throw new Error('同じ名前のフォルダが既に存在します');
    }
    await folderDao.insert(name, parentId);
    get().refresh();
  },

  renameFolder: async (id: string, newName: string) => {
    const folder = await folderDao.getById(id);
    if (!folder) throw new Error('フォルダが見つかりません');
    const exists = await folderDao.nameExistsAtLevel(newName, folder.parentId, id);
    if (exists) {
      throw new Error('同じ名前のフォルダが既に存在します');
    }
    await folderDao.update({ ...folder, name: newName });
    get().refresh();
  },

  deleteFolder: async (id: string) => {
    await folderDao.delete(id);
    get().refresh();
  },
}));

// Hook to load folder info list
export function useFolderInfoList(parentId: string | null): {
  data: FolderInfo[] | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  void parentId;
  return { data: null, loading: true, error: null, reload: () => {} };
}
