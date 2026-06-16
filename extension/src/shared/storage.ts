import { DEFAULT_SETTINGS, HISTORY_KEY, SETTINGS_KEY } from './constants';
import type { ExtensionSettings, HistoryItem } from './types';

export async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return {
    ...DEFAULT_SETTINGS,
    ...(result[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined),
  };
}

export async function saveSettings(settings: ExtensionSettings) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function getHistory(): Promise<HistoryItem[]> {
  const result = await chrome.storage.local.get(HISTORY_KEY);
  return Array.isArray(result[HISTORY_KEY])
    ? (result[HISTORY_KEY] as HistoryItem[])
    : [];
}

export async function addHistoryItem(item: HistoryItem) {
  const history = await getHistory();
  await chrome.storage.local.set({
    [HISTORY_KEY]: [item, ...history].slice(0, 50),
  });
}

export async function clearHistory() {
  await chrome.storage.local.set({ [HISTORY_KEY]: [] });
}
