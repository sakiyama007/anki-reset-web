'use client';

import { useState, useRef, useEffect, useMemo, type ChangeEvent } from 'react';
import { Sun, Moon, Monitor, Upload, Download, Database, RefreshCw, LogIn, LogOut } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useSettingsStore } from '@/stores/settings-store';
import { useFolderStore } from '@/stores/folder-store';
import { csvService } from '@/services/csv-service';
import { syncService } from '@/services/sync-service';
import { initGoogleAuth, requestAccessToken, revokeToken, getToken } from '@/lib/google-auth';
import { cardDao } from '@/db/card-dao';
import { folderDao } from '@/db/folder-dao';
import { cn } from '@/lib/utils';
import type { Folder } from '@/lib/types';

type FolderOption = {
  id: string;
  label: string;
};

function buildFolderOptions(folders: Folder[]): FolderOption[] {
  const folderMap = new Map(folders.map((folder) => [folder.id, folder]));

  const getPath = (folder: Folder): string => {
    const parts = [folder.name];
    let current = folder.parentId ? folderMap.get(folder.parentId) : undefined;
    while (current) {
      parts.unshift(current.name);
      current = current.parentId ? folderMap.get(current.parentId) : undefined;
    }
    return parts.join(' / ');
  };

  return folders
    .filter((folder) => !folder.isDeleted)
    .map((folder) => ({ id: folder.id, label: getPath(folder) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ja'));
}

export default function SettingsPage() {
  const {
    theme,
    setTheme,
    lastSyncAt,
    setLastSyncAt,
    nextDayStartsHour,
    setNextDayStartsHour,
    learnAheadMinutes,
    setLearnAheadMinutes,
  } = useSettingsStore();
  const refresh = useFolderStore((s) => s.refresh);
  const [stats, setStats] = useState<{ cards: number; folders: number } | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedImportParentId, setSelectedImportParentId] = useState('');
  const [newImportFolderName, setNewImportFolderName] = useState('');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const folderOptions = useMemo(() => buildFolderOptions(folders), [folders]);

  useEffect(() => {
    initGoogleAuth();
    setIsLoggedIn(!!getToken());
  }, []);

  async function loadFolders() {
    setFolders(await folderDao.getAll());
  }

  useEffect(() => {
    if (!importDialogOpen) return;
    void loadFolders();
  }, [importDialogOpen]);

  const loadStats = async () => {
    const [cards, folderCount] = await Promise.all([
      cardDao.getTotalCount(),
      folderDao.getAll().then((items) => items.length),
    ]);
    setStats({ cards, folders: folderCount });
  };

  const resolveImportFolderId = async (): Promise<string | null> => {
    const parentId = selectedImportParentId || null;
    const newFolderName = newImportFolderName.trim();
    if (!newFolderName) return selectedImportParentId || null;

    const siblings = await folderDao.getChildren(parentId);
    const existing = siblings.find((folder) => folder.name === newFolderName);
    if (existing) return existing.id;

    const created = await folderDao.insert(newFolderName, parentId);
    await loadFolders();
    return created.id;
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const destinationFolderId = await resolveImportFolderId();
      if (!destinationFolderId) {
        setImportResult('CSVの取り込み先フォルダを選択するか、新規フォルダ名を入力してください。');
        return;
      }

      const text = await file.text();
      const result = await csvService.importCsv(text, {
        parentFolderId: destinationFolderId,
        skipHeader: true,
      });
      const messages = [`${result.imported}件インポート、${result.skipped}件スキップ`];
      if (result.errors.length > 0) {
        messages.push(`エラー: ${result.errors.slice(0, 5).join(', ')}`);
      }
      setImportResult(messages.join('\n'));
      setImportDialogOpen(false);
      setNewImportFolderName('');
      refresh();
    } catch (error: unknown) {
      setImportResult(`インポートエラー: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExport = async () => {
    const csv = await csvService.exportCsv(null);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anki-reset-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleGoogleLogin = async () => {
    try {
      await initGoogleAuth();
      await requestAccessToken();
      setIsLoggedIn(true);
      setSyncMessage('Googleにログインしました');
    } catch (error: unknown) {
      setSyncMessage(`ログイン失敗: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleGoogleLogout = () => {
    revokeToken();
    setIsLoggedIn(false);
    setSyncMessage('ログアウトしました');
  };

  const handleSync = async () => {
    const token = getToken();
    if (!token) {
      setSyncMessage('先にGoogleにログインしてください');
      return;
    }
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await syncService.sync(token);
      const now = new Date().toISOString();
      setLastSyncAt(now);
      refresh();
      setSyncMessage(
        `同期完了${result.pulled ? ' (データ取得済み)' : ''}${result.pushed ? ' (データ送信済み)' : ''}`,
      );
    } catch (error: unknown) {
      setSyncMessage(`同期エラー: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSyncing(false);
    }
  };

  const themes = [
    { value: 'light' as const, label: 'ライト', icon: Sun },
    { value: 'dark' as const, label: 'ダーク', icon: Moon },
    { value: 'system' as const, label: 'システム', icon: Monitor },
  ];

  return (
    <AppShell>
      <div className="max-w-lg mx-auto w-full">
        <header className="px-4 py-3 border-b border-border">
          <h1 className="text-lg font-bold">設定</h1>
        </header>

        <div className="p-4 space-y-6">
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">テーマ</h2>
            <div className="flex gap-2">
              {themes.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className={cn(
                    'flex-1 flex flex-col items-center gap-1 py-3 rounded-lg border transition-colors',
                    theme === value
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50',
                  )}
                >
                  <Icon size={20} />
                  <span className="text-xs">{label}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">学習スケジューラ</h2>
            <div className="space-y-3 rounded-lg border border-border p-4">
              <label className="block">
                <span className="text-sm block mb-1">日付の切り替わり時刻 (JST)</span>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={nextDayStartsHour}
                  onChange={(event) => setNextDayStartsHour(Number(event.target.value))}
                  className="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-sm block mb-1">先取り学習の許容時間 (分)</span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={learnAheadMinutes}
                  onChange={(event) => setLearnAheadMinutes(Number(event.target.value))}
                  className="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </label>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">Google Drive 同期</h2>
            <div className="space-y-2">
              {!isLoggedIn ? (
                <Button variant="outline" className="w-full justify-start" onClick={handleGoogleLogin}>
                  <LogIn size={16} className="mr-2" />
                  Googleアカウントでログイン
                </Button>
              ) : (
                <>
                  <Button
                    variant="primary"
                    className="w-full justify-start"
                    onClick={handleSync}
                    disabled={syncing}
                  >
                    <RefreshCw size={16} className={cn('mr-2', syncing && 'animate-spin')} />
                    {syncing ? '同期中...' : '同期する'}
                  </Button>
                  <Button variant="ghost" className="w-full justify-start text-sm" onClick={handleGoogleLogout}>
                    <LogOut size={16} className="mr-2" />
                    ログアウト
                  </Button>
                </>
              )}
            </div>
            {lastSyncAt && (
              <p className="text-xs text-muted-foreground mt-2">
                最終同期: {new Date(lastSyncAt).toLocaleString('ja-JP')}
              </p>
            )}
            {syncMessage && (
              <div className="mt-2 p-3 bg-muted rounded-lg text-sm">{syncMessage}</div>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">データ</h2>
            <Button variant="outline" className="w-full justify-start" onClick={loadStats}>
              <Database size={16} className="mr-2" />
              統計を表示
            </Button>
            {stats && (
              <div className="mt-2 p-3 bg-muted rounded-lg text-sm">
                <p>カード: {stats.cards}枚</p>
                <p>フォルダ: {stats.folders}個</p>
              </div>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">CSV インポート / エクスポート</h2>
            <p className="text-xs text-muted-foreground mb-3">
              形式: 表面,裏面,フォルダパス。ヘッダー行は自動で読み飛ばします。
            </p>
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start" onClick={() => setImportDialogOpen(true)}>
                <Upload size={16} className="mr-2" />
                CSVファイルをインポート
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={handleExport}>
                <Download size={16} className="mr-2" />
                全カードをエクスポート
              </Button>
            </div>
            {importResult && (
              <div className="mt-2 p-3 bg-muted rounded-lg text-sm whitespace-pre-wrap">
                {importResult}
              </div>
            )}
          </section>
        </div>
      </div>

      <Dialog open={importDialogOpen} onClose={() => setImportDialogOpen(false)}>
        <DialogTitle>CSVインポート</DialogTitle>
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium block mb-1">既存フォルダ</span>
            <select
              value={selectedImportParentId}
              onChange={(event) => setSelectedImportParentId(event.target.value)}
              className="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">選択しない</option>
              {folderOptions.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium block mb-1">新規フォルダ名</span>
            <Input
              value={newImportFolderName}
              onChange={(event) => setNewImportFolderName(event.target.value)}
              placeholder="空欄なら選択した既存フォルダに取り込み"
            />
          </label>

          <p className="text-xs text-muted-foreground">
            新規フォルダ名を入力した場合は、選択した既存フォルダの配下に作成します。CSVのフォルダパス列が空の行は、この取り込み先フォルダに入ります。
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleImport}
          />
        </div>
        <DialogActions>
          <Button variant="ghost" onClick={() => setImportDialogOpen(false)}>
            キャンセル
          </Button>
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing || (!selectedImportParentId && !newImportFolderName.trim())}
          >
            {importing ? '取り込み中...' : 'CSVを選択'}
          </Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
