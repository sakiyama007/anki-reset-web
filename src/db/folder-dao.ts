import { db } from './database';
import type { Folder, FolderInfo, StudyCounts } from '@/lib/types';
import { generateId, nowISO } from '@/lib/utils';
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
    // Soft-delete: mark folder + all descendants + their cards as isDeleted
    const descendantIds = await this.getDescendantIds(id);
    const allIds = [id, ...descendantIds];
    const now = nowISO();

    await db.transaction('rw', [db.folders, db.cards], async () => {
      // Soft-delete cards in these folders
      await db.cards.where('folderId').anyOf(allIds)
        .modify({ isDeleted: true, updatedAt: now });
      // Soft-delete the folders themselves
      await db.folders.where('id').anyOf(allIds)
        .modify({ isDeleted: true, updatedAt: now });
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

  async nameExistsAtLevel(name: string, parentId: string | null, excludeId?: string): Promise<boolean> {
    const siblings = await this.getChildren(parentId);
    return siblings.some(f => f.name === name && f.id !== excludeId);
  },

  async getCardCount(folderId: string): Promise<number> {
    return db.cards.where('folderId').equals(folderId).filter(c => !c.isDeleted).count();
  },

  async getSubfolderCount(folderId: string): Promise<number> {
    return db.folders.where('parentId').equals(folderId).filter(f => !f.isDeleted).count();
  },

  async getStudyCounts(folderId: string, now: Date): Promise<StudyCounts> {
    const learnAhead = new Date(now.getTime() + AppConstants.learnAheadMinutes * 60000).toISOString();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    const cards = await db.cards.where('folderId').equals(folderId)
      .filter(c => !c.isDeleted).toArray();
    const cardIds = cards.map(c => c.id);
    if (cardIds.length === 0) return { new: 0, learning: 0, review: 0 };

    const states = await db.cardStates.where('cardId').anyOf(cardIds).toArray();

    let newCount = 0, learningCount = 0, reviewCount = 0;
    for (const s of states) {
      if (s.state === 'newCard') newCount++;
      else if ((s.state === 'learning' || s.state === 'relearning') && s.due <= learnAhead) learningCount++;
      else if (s.state === 'review' && s.due <= today) reviewCount++;
    }

    return { new: newCount, learning: learningCount, review: reviewCount };
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
      learningCount: counts.learning,
      reviewCount: counts.review,
    };
  },

  async getChildrenInfo(parentId: string | null, now: Date): Promise<FolderInfo[]> {
    const children = await this.getChildren(parentId);
    return Promise.all(children.map(f => this.getFolderInfo(f.id, now)));
  },
};
