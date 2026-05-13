import { AppConstants } from '@/lib/constants';
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
      nextDayStartsHour: AppConstants.defaultNextDayStartsHour,
      setNextDayStartsHour: (hour) => set({ nextDayStartsHour: Math.min(23, Math.max(0, Math.round(hour))) }),
      learnAheadMinutes: AppConstants.defaultLearnAheadMinutes,
      setLearnAheadMinutes: (minutes) => set({ learnAheadMinutes: Math.max(0, minutes) }),
    }),
    {
      name: 'anki-reset-settings',
      version: 1,
      migrate: (persistedState) => {
        const state = (persistedState ?? {}) as Partial<SettingsState>;
        const learnAheadMinutes = state.learnAheadMinutes === 0.5
          ? AppConstants.defaultLearnAheadMinutes
          : state.learnAheadMinutes;

        return {
          theme: state.theme ?? 'system',
          lastSyncAt: state.lastSyncAt ?? null,
          nextDayStartsHour: state.nextDayStartsHour ?? AppConstants.defaultNextDayStartsHour,
          learnAheadMinutes: learnAheadMinutes ?? AppConstants.defaultLearnAheadMinutes,
        };
      },
    },
  ),
);
