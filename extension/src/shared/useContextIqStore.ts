import { create } from 'zustand';
import { getHistory, getSettings, saveSettings } from './storage';
import type { ExtensionSettings, HistoryItem } from './types';

interface ContextIqStore {
  settings: ExtensionSettings | null;
  history: HistoryItem[];
  setSettings: (settings: ExtensionSettings) => void;
  setHistory: (history: HistoryItem[]) => void;
  loadSettings: () => Promise<ExtensionSettings>;
  loadHistory: () => Promise<HistoryItem[]>;
  persistSettings: (settings: ExtensionSettings) => Promise<void>;
}

export const useContextIqStore = create<ContextIqStore>((set) => ({
  settings: null,
  history: [],
  setSettings: (settings) => set({ settings }),
  setHistory: (history) => set({ history }),
  loadSettings: async () => {
    const settings = await getSettings();
    set({ settings });
    return settings;
  },
  loadHistory: async () => {
    const history = await getHistory();
    set({ history });
    return history;
  },
  persistSettings: async (settings) => {
    await saveSettings(settings);
    set({ settings });
  },
}));
