'use client';

import { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Monitor, Upload, Download, Database, RefreshCw, LogIn, LogOut } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { useSettingsStore } from '@/stores/settings-store';
import { useFolderStore } from '@/stores/folder-store';
import { csvService } from '@/services/csv-service';
import { syncService } from '@/services/sync-service';
import { initGoogleAuth, requestAccessToken, revokeToken, getToken } from '@/lib/google-auth';
import { cardDao } from '@/db/card-dao';
import { folderDao } from '@/db/folder-dao';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const { theme, setTheme, lastSyncAt, setLastSyncAt } = useSettingsStore();
  const refresh = useFolderStore((s) => s.refresh);
  const [stats, setStats] = useState<{ cards: number; folders: number } | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    initGoogleAuth();
    setIsLoggedIn(!!getToken());
  }, []);

  const loadStats = async () => {
    const [cards, folders] = await Promise.all([
      cardDao.getTotalCount(),
      folderDao.getAll().then(f => f.length),
    ]);
    setStats({ cards, folders });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const result = await csvService.importCsv(text, null);
    setImportResult(`${result.imported}件インポート、${result.skipped}件スキップ`);
    if (result.errors.length > 0) {
      setImportResult(prev => `${prev}\nエラー: ${result.errors.slice(0, 5).join(', ')}`);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    refresh();
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
    } catch (e: unknown) {
      setSyncMessage(`ログイン失敗: ${e instanceof Error ? e.message : String(e)}`);
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
    } catch (e: unknown) {
      setSyncMessage(`同期エラー: ${e instanceof Error ? e.message : String(e)}`);
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
          {/* Theme */}
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

          {/* Sync */}
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

          {/* Stats */}
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

          {/* CSV Import/Export */}
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">CSV インポート / エクスポート</h2>
            <p className="text-xs text-muted-foreground mb-3">形式: 表面,裏面,フォルダパス</p>
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start" onClick={() => fileInputRef.current?.click()}>
                <Upload size={16} className="mr-2" />
                CSVファイルを選択
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleImport}
              />
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
    </AppShell>
  );
}
