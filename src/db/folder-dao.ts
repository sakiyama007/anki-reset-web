import { db } from './database';
import type { Folder, FolderInfo, StudyCounts } from '@/lib/types';
import { generateId, getSchedulerPreferences, jstDayStart, nowISO } from '@/lib/utils';
import { AppConstants } from '@/lib/constants';

export const folderDao = {
  async insert(name: string, parentId: string | null): Promise<Folder> {
    const now = nowISO();
    const folder: Folder = {
      id: generateId(),
      name,
      parentId,
      createdAt: now,
      updatedAt: now,
    };
    await db.folders.add(folder);
    return folder;
  },

  async update(folder: Folder): Promise<void> {
    await db.folders.put({ ...folder, updatedAt: nowISO() });
  },

  async delete(id: string): Promise<void> {
    const descendantIds = await this.getDescendantIds(id);
    const allIds = [id, ...descendantIds];
    const now = nowISO();
    const [folders, cards] = await Promise.all([
      db.folders.where('id').anyOf(allIds).toArray(),
      db.cards.where('folderId').anyOf(allIds).toArray(),
    ]);

    await db.transaction('rw', [db.folders, db.cards], async () => {
      await db.cards.bulkPut(
        cards
          .filter((card) => !card.isDeleted)
          .map((card) => ({
            ...card,
            isDeleted: true,
            deletedAt: now,
            deleteBaseUpdatedAt: card.updatedAt,
            updatedAt: now,
          })),
      );
      await db.folders.bulkPut(
        folders
          .filter((folder) => !folder.isDeleted)
          .map((folder) => ({
            ...folder,
            isDeleted: true,
            deletedAt: now,
            deleteBaseUpdatedAt: folder.updatedAt,
            updatedAt: now,
          })),
      );
    });
  },

  async getById(id: string): Promise<Folder | undefined> {
    return db.folders.get(id);
  },

  async getChildren(parentId: string | null): Promise<Folder[]> {
    // Dexie can't index null well, so for root folders query all and filter
    if (parentId === null) {
      const all = await db.folders.toArray();
      return all
        .filter(f => !f.isDeleted && (f.parentId === null || f.parentId === undefined))
        .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    }

    const folders = await db.folders.where('parentId').equals(parentId).toArray();
    return folders
      .filter(f => !f.isDeleted)
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  },

  async getAll(): Promise<Folder[]> {
    const all = await db.folders.toArray();
    return all.filter(f => !f.isDeleted);
  },

  async getDepth(folderId: string): Promise<number> {
    let depth = 1;
    let current = await db.folders.get(folderId);
    while (current?.parentId) {
      depth++;
      current = await db.folders.get(current.parentId);
    }
    return depth;
  },

  async getChildDepth(parentId: string | null): Promise<number> {
    if (parentId === null) return 1;
    return (await this.getDepth(parentId)) + 1;
  },

  async getSubtreeDepth(folderId: string): Promise<number> {
    const children = await db.folders.where('parentId').equals(folderId)
      .filter(f => !f.isDeleted)
      .toArray();
    if (children.length === 0) return 1;

    const childDepths = await Promise.all(
      children.map((child) => this.getSubtreeDepth(child.id)),
    );
    return 1 + Math.max(...childDepths);
  },

  async getDescendantIds(folderId: string): Promise<string[]> {
    const result: string[] = [];
    const queue = [folderId];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const children = await db.folders.where('parentId').equals(currentId)
        .filter(f => !f.isDeleted)
        .toArray();
      for (const child of children) {
        result.push(child.id);
        queue.push(child.id);
      }
    }
    return result;
  },

  async getSelfAndDescendantIds(folderId: string): Promise<string[]> {
    const descendants = await this.getDescendantIds(folderId);
    return [folderId, ...descendants];
  },

  async getSelectedRootIds(selectedIds: string[]): Promise<string[]> {
    const uniqueSelectedIds = [...new Set(selectedIds)];
    if (uniqueSelectedIds.length === 0) return [];

    const selectedSet = new Set(uniqueSelectedIds);
    const folders = await this.getAll();
    const parentById = new Map(folders.map((folder) => [folder.id, folder.parentId]));

    return uniqueSelectedIds.filter((folderId) => {
      let currentId = parentById.get(folderId) ?? null;
      while (currentId) {
        if (selectedSet.has(currentId)) {
          return false;
        }
        currentId = parentById.get(currentId) ?? null;
      }
      return true;
    });
  },

  async nameExistsAtLevel(name: string, parentId: string | null, excludeId?: string): Promise<boolean> {
    const siblings = await this.getChildren(parentId);
    return siblings.some(f => f.name === name && f.id !== excludeId);
  },

  async move(id: string, targetParentId: string | null): Promise<void> {
    await this.moveMany([id], targetParentId);
  },

  async moveMany(ids: string[], targetParentId: string | null): Promise<number> {
    const rootIds = await this.getSelectedRootIds(ids);
    if (rootIds.length === 0) return 0;

    const movingIdSet = new Set(rootIds);
    const folders = await db.folders.where('id').anyOf(rootIds).toArray();
    const folderById = new Map(folders.map((folder) => [folder.id, folder]));

    for (const id of rootIds) {
      const folder = folderById.get(id);
      if (!folder || folder.isDeleted) {
        throw new Error('フォルダが見つかりません');
      }
    }

    if (targetParentId !== null) {
      const target = await db.folders.get(targetParentId);
      if (!target || target.isDeleted) {
        throw new Error('移動先フォルダが見つかりません');
      }

      for (const id of rootIds) {
        if (targetParentId === id) {
          throw new Error('フォルダを自分自身の中へ移動できません');
        }
        const descendants = await this.getDescendantIds(id);
        if (descendants.includes(targetParentId)) {
          throw new Error('フォルダをその子フォルダの中へ移動できません');
        }
      }
    }

    const destinationChildren = await this.getChildren(targetParentId);
    const existingNames = new Set(
      destinationChildren
        .filter((folder) => !movingIdSet.has(folder.id))
        .map((folder) => folder.name),
    );
    const movingNames = new Set<string>();

    for (const id of rootIds) {
      const folder = folderById.get(id)!;
      if (existingNames.has(folder.name) || movingNames.has(folder.name)) {
        throw new Error('移動先に同じ名前のフォルダが既に存在します');
      }
      movingNames.add(folder.name);
    }

    const targetDepth = targetParentId === null ? 0 : await this.getDepth(targetParentId);
    for (const id of rootIds) {
      const subtreeDepth = await this.getSubtreeDepth(id);
      if (targetDepth + subtreeDepth > AppConstants.maxFolderDepth) {
        throw new Error(`フォルダの最大階層数(${AppConstants.maxFolderDepth})を超えています`);
      }
    }

    const now = nowISO();
    const foldersToMove = rootIds
      .map((id) => folderById.get(id)!)
      .filter((folder) => (folder.parentId ?? null) !== targetParentId);

    if (foldersToMove.length === 0) return 0;

    await db.folders.bulkPut(
      foldersToMove.map((folder) => ({
        ...folder,
        parentId: targetParentId,
        updatedAt: now,
      })),
    );
    return foldersToMove.length;
  },

  async getCardCount(folderId: string): Promise<number> {
    return db.cards.where('folderId').equals(folderId).filter(c => !c.isDeleted).count();
  },

  async getSubfolderCount(folderId: string): Promise<number> {
    return db.folders.where('parentId').equals(folderId).filter(f => !f.isDeleted).count();
  },

  async getStudyCounts(folderId: string, now: Date): Promise<StudyCounts> {
    const schedulerPreferences = getSchedulerPreferences();
    const today = jstDayStart(now, schedulerPreferences.nextDayStartsHour).toISOString();

    const cards = await db.cards.where('folderId').equals(folderId)
      .filter(c => !c.isDeleted && !c.isSuspended).toArray();
    const cardIds = cards.map(c => c.id);
    if (cardIds.length === 0) return { new: 0, oneMinute: 0, learning: 0, review: 0 };

    const [states, cardLogs] = await Promise.all([
      db.cardStates.where('cardId').anyOf(cardIds).toArray(),
      db.revlogs.where('cardId').anyOf(cardIds).toArray(),
    ]);
    const goodOrEasyCardIds = new Set(
      cardLogs
        .filter((log) => log.rating === 'good' || log.rating === 'easy')
        .map((log) => log.cardId),
    );

    let newCount = 0, oneMinuteCount = 0, learningCount = 0, reviewCount = 0;
    const nowIso = now.toISOString();
    const oneMinuteUntilIso = new Date(
      now.getTime() + AppConstants.oneMinuteWindowSeconds * 1000,
    ).toISOString();
    for (const s of states) {
      const isLearning = s.state === 'learning' || s.state === 'relearning';
      const isInterdayLearning = (s.state === 'learning' || s.state === 'relearning')
        && s.due === jstDayStart(new Date(s.due), schedulerPreferences.nextDayStartsHour).toISOString();
      const isStarterOneMinute = isLearning
        && !isInterdayLearning
        && s.due <= oneMinuteUntilIso
        && !goodOrEasyCardIds.has(s.cardId);

      if (s.state === 'newCard') newCount++;
      else if (isLearning && !isInterdayLearning && s.due <= nowIso) {
        if (isStarterOneMinute && oneMinuteCount < AppConstants.oneMinuteQueueLimit) {
          oneMinuteCount++;
        } else {
          learningCount++;
        }
      }
      else if ((isLearning && isInterdayLearning && s.due <= today)
        || (s.state === 'review' && s.due <= today)) reviewCount++;
    }

    return { new: newCount, oneMinute: oneMinuteCount, learning: learningCount, review: reviewCount };
  },

  async getFolderInfo(folderId: string, now: Date): Promise<FolderInfo> {
    const folder = await db.folders.get(folderId);
    if (!folder) throw new Error(`Folder not found: ${folderId}`);

    const [cardCount, subfolderCount, counts] = await Promise.all([
      this.getCardCount(folderId),
      this.getSubfolderCount(folderId),
      this.getStudyCounts(folderId, now),
    ]);

    return {
      folder,
      cardCount,
      subfolderCount,
      newCount: counts.new,
      oneMinuteCount: counts.oneMinute,
      learningCount: counts.learning,
      reviewCount: counts.review,
    };
  },

  async getChildrenInfo(parentId: string | null, now: Date): Promise<FolderInfo[]> {
    const children = await this.getChildren(parentId);
    return Promise.all(children.map(f => this.getFolderInfo(f.id, now)));
  },
};
