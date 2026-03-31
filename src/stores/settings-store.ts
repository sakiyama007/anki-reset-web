import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  lastSyncAt: string | null;
  setLastSyncAt: (date: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
      lastSyncAt: null,
      setLastSyncAt: (date) => set({ lastSyncAt: date }),
    }),
    { name: 'anki-reset-settings' },
  ),
);
