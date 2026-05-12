import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  lastSyncAt: string | null;
  setLastSyncAt: (date: string) => void;
  nextDayStartsHour: number;
  setNextDayStartsHour: (hour: number) => void;
  learnAheadMinutes: number;
  setLearnAheadMinutes: (minutes: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
      lastSyncAt: null,
      setLastSyncAt: (date) => set({ lastSyncAt: date }),
      nextDayStartsHour: 4,
      setNextDayStartsHour: (hour) => set({ nextDayStartsHour: Math.min(23, Math.max(0, Math.round(hour))) }),
      learnAheadMinutes: 0.5,
      setLearnAheadMinutes: (minutes) => set({ learnAheadMinutes: Math.max(0, minutes) }),
    }),
    { name: 'anki-reset-settings' },
  ),
);
