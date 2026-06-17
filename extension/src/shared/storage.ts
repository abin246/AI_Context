import { CLIPBOARD_KEY, DEFAULT_SETTINGS, HISTORY_KEY, SETTINGS_KEY } from './constants';
import type { ClipboardEntry, ExtensionSettings, HistoryItem } from './types';


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

export async function getClipboardItems(): Promise<ClipboardEntry[]> {
  const result = await chrome.storage.local.get(CLIPBOARD_KEY);
  return Array.isArray(result[CLIPBOARD_KEY])
    ? (result[CLIPBOARD_KEY] as ClipboardEntry[])
    : [];
}

export async function addClipboardItem(item: ClipboardEntry) {
  const items = await getClipboardItems();

  const nextItems = [
    item,
    ...items.filter((entry) => entry.text.trim() !== item.text.trim()),
  ].slice(0, 50);

  await chrome.storage.local.set({ [CLIPBOARD_KEY]: nextItems });

  return nextItems;
}

export async function deleteClipboardItem(id: string) {
  const items = await getClipboardItems();
  const nextItems = items.filter((item) => item.id !== id);

  await chrome.storage.local.set({ [CLIPBOARD_KEY]: nextItems });

  return nextItems;
}

export async function clearClipboardItems() {
  await chrome.storage.local.set({ [CLIPBOARD_KEY]: [] });
}