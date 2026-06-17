import {
  AI_STATE_KEY,
  DEFAULT_SETTINGS,
  HISTORY_KEY,
  RATE_LIMIT_KEY,
  SELECTED_TEXT_KEY,
  SETTINGS_KEY,
} from '../shared/constants';
import { ACTION_LABELS, buildMessages } from '../shared/prompts';
import { addHistoryItem, getSettings } from '../shared/storage';
import type { ActionId, AiState, HistoryItem, ProcessAiMessage } from '../shared/types';

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS_URL = 'https://api.groq.com/openai/v1/models';
const MAX_REQUESTS_PER_MINUTE = 20;
const MIN_REQUEST_GAP_MS = 1500;

interface RateLimitState {
  windowStartedAt: number;
  count: number;
  lastRequestAt: number;
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaultSettings();
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  createContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id || !info.selectionText) return;
  const action = String(info.menuItemId) as ActionId;

  if (action === 'ask' || action === 'custom' || action === 'translate') {
    chrome.tabs.sendMessage(tab.id, {
      type: 'PROMPT_FOR_DETAIL',
      action,
      text: info.selectionText,
    });
    return;
  }

  void processAiRequest({ type: 'PROCESS_AI_REQUEST', action, text: info.selectionText }, tab.id);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PROCESS_AI_REQUEST') {
    void getMessageTabId(sender).then((tabId) => {
      if (!tabId) {
        sendResponse({ ok: false, error: 'No active tab found.' });
        return;
      }

      void processAiRequest(message as ProcessAiMessage, tabId);
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === 'UPDATE_SELECTION') {
    const text = typeof message.text === 'string' ? message.text : '';
    void chrome.storage.local.set({
      [SELECTED_TEXT_KEY]: {
        text,
        url: sender.tab?.url ?? '',
        title: sender.tab?.title ?? '',
        updatedAt: Date.now(),
      },
    });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'GET_ACTIVE_SELECTION') {
    void getActiveSelection(sender).then(sendResponse);
    return true;
  }

  if (message.type === 'GET_PAGE_CONTENT') {
    void getPageContent(sender).then(sendResponse);
    return true;
  }

  if (message.type === 'OPEN_SIDE_PANEL') {
    void getMessageTabId(sender).then((tabId) => {
      if (!tabId) {
        sendResponse({ ok: false, error: 'No active tab found.' });
        return;
      }
      chrome.sidePanel.open({ tabId }).catch(() => undefined);
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === 'OPEN_ACTIVE_SIDE_PANEL') {
    void openActiveSidePanel().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === 'VALIDATE_API_KEY') {
    void validateApiKey(message.apiKey).then(sendResponse);
    return true;
  }

  if (message.type === 'RESET_EXTENSION') {
    void resetExtensionState()
      .then((settings) => {
        sendResponse({ ok: true, settings });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Could not reset ContextIQ.',
        });
      });

    return true;
  }

  if (message.type === 'REPLACE_SELECTION') {
    void sendToActiveTab({ type: 'REPLACE_SELECTION', text: message.text }).then(sendResponse);
    return true;
  }

  if (message.type === 'RETRY_AI_REQUEST') {
    void sendRetry(message.item as HistoryItem).then(sendResponse);
    return true;
  }

  return false;
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id }).catch(() => undefined);
  }
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (!tab.id) return;

  if (command === 'open-contextiq') {
    chrome.sidePanel.open({ tabId: tab.id }).catch(() => undefined);
    return;
  }

  if (command === 'summarize-current-page') {
    void summarizeTabFromCommand(tab.id);
  }
});

async function summarizeTabFromCommand(tabId: number) {
  await chrome.sidePanel.open({ tabId }).catch(() => undefined);

  const tab = await chrome.tabs.get(tabId).catch(() => undefined);

  if (!isReadableTabUrl(tab?.url)) {
    await publishAiState({
      type: 'AI_ERROR',
      requestId: `${Date.now()}`,
      action: 'summarize',
      title: 'Summarize',
      error: 'ContextIQ cannot read this browser page. Open a normal website tab and try again.',
      originalText: '',
    });
    return;
  }

  const content = await getPageContentFromTabId(tabId);

  if (!content.ok || !content.text) {
    await publishAiState({
      type: 'AI_ERROR',
      requestId: `${Date.now()}`,
      action: 'summarize',
      title: 'Summarize',
      error: content.error || 'No readable page text found.',
      originalText: '',
    });
    return;
  }

  await processAiRequest(
    {
      type: 'PROCESS_AI_REQUEST',
      action: 'summarize',
      text: content.text,
    },
    tabId
  );
}

async function getPageContentFromTabId(tabId: number) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_CONTENT' });

    if (response?.text) {
      return { ok: true, ...response };
    }
  } catch {
    // Content script may not be available on old tabs.
  }

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractReadablePageContent,
    });

    const content = result?.result;

    if (content?.text) {
      return { ok: true, ...content };
    }

    return { ok: false, text: '', error: 'No readable page text found.' };
  } catch (error) {
    return {
      ok: false,
      text: '',
      error:
        error instanceof Error
          ? `ContextIQ could not read this webpage: ${error.message}`
          : 'ContextIQ could not read this webpage.',
    };
  }
}

async function ensureDefaultSettings() {
  const settings = await getSettings();
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

async function resetExtensionState() {
  await chrome.storage.local.remove([
    SETTINGS_KEY,
    HISTORY_KEY,
    AI_STATE_KEY,
    RATE_LIMIT_KEY,
    SELECTED_TEXT_KEY,
  ]);

  const freshSettings = {
    ...DEFAULT_SETTINGS,
    prompts: [...DEFAULT_SETTINGS.prompts],
  };

  await chrome.storage.local.set({
    [SETTINGS_KEY]: freshSettings,
    [HISTORY_KEY]: [],
  });

  return freshSettings;
}

function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    (Object.keys(ACTION_LABELS) as ActionId[]).forEach((action) => {
      chrome.contextMenus.create({
        id: action,
        title: ACTION_LABELS[action],
        contexts: ['selection'],
      });
    });
  });
}

async function processAiRequest(message: ProcessAiMessage, tabId: number) {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const title = ACTION_LABELS[message.action];

  try {
    await chrome.sidePanel.open({ tabId }).catch(() => undefined);
    await publishAiState({
      type: 'AI_LOADING',
      requestId,
      action: message.action,
      title,
      originalText: message.text,
      question: message.question,
      targetLanguage: message.targetLanguage,
    });

    const settings = await getSettings();
    if (settings.provider !== 'groq') {
      throw new Error('Only Groq is available in this MVP. Select Groq in Settings.');
    }

    if (!settings.apiKey.trim()) {
      throw new Error('Add your Groq API key in ContextIQ Settings before using AI actions.');
    }

    await enforceRateLimit();

    const response = await fetchWithTimeout(
      GROQ_CHAT_URL,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: settings.model,
          messages: buildMessages({
            action: message.action,
            text: message.text,
            question: message.question,
            targetLanguage: message.targetLanguage,
            customPrompt: message.customPrompt,
          }),
          temperature: 0.1,
          max_tokens: 900,
        }),
      },
      45000
    );

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(getGroqError(data, response));
    }

    const result = data?.choices?.[0]?.message?.content?.trim();
    if (!result) {
      throw new Error('Groq returned an empty response.');
    }

    const item: HistoryItem = {
      id: requestId,
      action: message.action,
      title,
      result,
      originalText: message.text,
      question: message.question,
      targetLanguage: message.targetLanguage,
      createdAt: Date.now(),
    };

    await addHistoryItem(item);
    await publishAiState({ ...item, type: 'AI_RESPONSE' });
    notifyTab(tabId, { type: 'AI_RESPONSE' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred.';
    await publishAiState({
      type: 'AI_ERROR',
      requestId,
      action: message.action,
      title,
      error: errorMessage,
      originalText: message.text,
      targetLanguage: message.targetLanguage,
    });
    notifyTab(tabId, { type: 'AI_ERROR' });
  }
}

async function validateApiKey(apiKey: string) {
  if (!apiKey.trim()) {
    return { ok: false, error: 'Enter a Groq API key first.' };
  }

  try {
    const response = await fetchWithTimeout(
      GROQ_MODELS_URL,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
      15000
    );

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      return { ok: false, error: getGroqError(data, response) };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not validate the key.',
    };
  }
}

async function enforceRateLimit() {
  const now = Date.now();
  const result = await chrome.storage.local.get(RATE_LIMIT_KEY);
  const previous = result[RATE_LIMIT_KEY] as RateLimitState | undefined;
  const state =
    previous && now - previous.windowStartedAt < 60000
      ? previous
      : { windowStartedAt: now, count: 0, lastRequestAt: 0 };

  if (state.count >= MAX_REQUESTS_PER_MINUTE) {
    throw new Error('Local rate limit reached. Wait a minute before sending more requests.');
  }

  if (now - state.lastRequestAt < MIN_REQUEST_GAP_MS) {
    throw new Error('Please wait a moment before sending another ContextIQ request.');
  }

  await chrome.storage.local.set({
    [RATE_LIMIT_KEY]: {
      windowStartedAt: state.windowStartedAt,
      count: state.count + 1,
      lastRequestAt: now,
    },
  });
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The Groq request timed out. Try again in a moment.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getGroqError(data: unknown, response: Response) {
  if (
    data &&
    typeof data === 'object' &&
    'error' in data &&
    data.error &&
    typeof data.error === 'object' &&
    'message' in data.error &&
    typeof data.error.message === 'string'
  ) {
    return data.error.message;
  }

  return `Groq API error: ${response.status} ${response.statusText}`;
}

async function publishAiState(state: AiState) {
  await chrome.storage.local.set({ [AI_STATE_KEY]: state });
  chrome.runtime.sendMessage(state).catch(() => undefined);
}

function notifyTab(tabId: number, message: unknown) {
  chrome.tabs.sendMessage(tabId, message).catch(() => undefined);
}

async function openActiveSidePanel() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
}

async function getMessageTabId(sender: chrome.runtime.MessageSender) {
  if (sender.tab?.id) return sender.tab.id;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function getActiveSelection(sender: chrome.runtime.MessageSender) {
  const tabId = await getMessageTabId(sender);
  if (tabId) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: 'GET_SELECTION' });
      if (response?.text) return response;
    } catch {
      // Some pages cannot receive content-script messages; fall through to injection.
    }

    const tab = await chrome.tabs.get(tabId).catch(() => undefined);
    if (isReadableTabUrl(tab?.url)) {
      try {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => ({
            text: window.getSelection()?.toString().trim() || '',
            title: document.title || '',
            url: window.location.href,
            updatedAt: Date.now(),
          }),
        });
        if (result?.result?.text) return result.result;
      } catch {
        // Stored selection is still useful after transient tab access failures.
      }
    }
  }

  const result = await chrome.storage.local.get(SELECTED_TEXT_KEY);
  return result[SELECTED_TEXT_KEY] ?? { text: '', updatedAt: 0 };
}

async function getPageContent(sender: chrome.runtime.MessageSender) {
  const tabId = await getMessageTabId(sender);
  if (!tabId) {
    return { ok: false, text: '', error: 'No active tab found.' };
  }

  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  if (!isReadableTabUrl(tab?.url)) {
    return {
      ok: false,
      text: '',
      error: 'ContextIQ cannot read protected browser pages. Open a regular website tab and try again.',
    };
  }

  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_CONTENT' });
    if (response?.text) {
      return { ok: true, ...response };
    }
  } catch {
    // The content script can be unavailable on already-open tabs. Fall through to direct injection.
  }

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractReadablePageContent,
    });
    const content = result?.result;
    if (content?.text) {
      return { ok: true, ...content };
    }

    return { ok: false, text: '', error: 'No readable page text found.' };
  } catch (error) {
    return {
      ok: false,
      text: '',
      error:
        error instanceof Error
          ? `ContextIQ could not read this webpage: ${error.message}`
          : 'ContextIQ could not read this webpage.',
    };
  }
}

function isReadableTabUrl(url?: string) {
  if (!url) return false;
  return /^(https?|file):\/\//i.test(url);
}

function extractReadablePageContent() {
  const baseSkipSelectors = [
    'script',
    'style',
    'noscript',
    'svg',
    'canvas',
    'iframe',
    'template',
  ];

  const directAdSelectors = [
    '[data-ad]',
    '[data-ads]',
    '[data-ad-slot]',
    '[data-ad-client]',
    '[data-ad-format]',
    '[data-testid="ad"]',
    '[data-testid="ads"]',
    '[data-testid="advertisement"]',
    '.ad',
    '.ads',
    '.advert',
    '.advertisement',
    '.advertorial',
    '.adsbygoogle',
    '.google-auto-placed',
    '.sponsored',
    '.sponsor',
    '.promoted',
    '#ad',
    '#ads',
    '#advert',
    '#advertisement',
    '#sponsored',
  ];

  const adLabelPattern =
    /(^|[\s_-])(ad|ads|advert|advertisement|advertorial|sponsor|sponsored|promoted|adslot|adunit|adsbygoogle|doubleclick|google-auto-placed)([\s_-]|$)/i;

  const decorativeSymbolPattern = /[•●◆◇■□▲▼▶►▪▫★☆✓✔✕✖→←↑↓]/g;

  const adLinePatterns = [
    /^advertisement$/i,
    /^advertisements$/i,
    /^sponsored$/i,
    /^sponsored content$/i,
    /^promoted$/i,
    /^paid promotion$/i,
    /^ad choices$/i,
    /^ads by google$/i,
  ];

  const title = document.title || '';
  const url = window.location.href;

  const normalizeLine = (line: string) =>
    line
      .replace(/\u00a0/g, ' ')
      .replace(decorativeSymbolPattern, ' ')
      .replace(/[^\S\r\n]+/g, ' ')
      .trim();

  const isAdvertisementLine = (line: string) =>
    adLinePatterns.some((pattern) => pattern.test(line));

  const normalizeReadableText = (text: string) => {
    const seen = new Set<string>();

    return text
      .replace(/\u00a0/g, ' ')
      .replace(decorativeSymbolPattern, ' ')
      .replace(/[^\S\r\n]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 1)
      .filter((line) => !isAdvertisementLine(line))
      .filter((line) => {
        const key = line.toLowerCase();
        if (seen.has(key)) return false;

        seen.add(key);
        return true;
      })
      .join('\n');
  };

  const hasAdLabel = (element: HTMLElement) => {
    const label = [
      element.id,
      ...Array.from(element.classList),
      element.getAttribute('aria-label') || '',
      element.getAttribute('data-testid') || '',
    ]
      .join(' ')
      .toLowerCase();

    return adLabelPattern.test(label);
  };

  const isHiddenElement = (element: HTMLElement) => {
    if (element.hidden || element.getAttribute('aria-hidden') === 'true') {
      return true;
    }

    const style = window.getComputedStyle(element);

    return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
  };

  const shouldSkipTextNode = (element: HTMLElement) => {
    if (element.closest(baseSkipSelectors.join(','))) {
      return true;
    }

    if (element.closest(directAdSelectors.join(','))) {
      return true;
    }

    const labelledAncestor = element.closest<HTMLElement>('[id], [class], [aria-label], [data-testid]');
    if (labelledAncestor && hasAdLabel(labelledAncestor)) {
      return true;
    }

    return isHiddenElement(element);
  };

  const collectVisibleReadableText = (root: HTMLElement) => {
    const lines: string[] = [];

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const rawText = node.nodeValue || '';
        if (!rawText.trim()) return NodeFilter.FILTER_REJECT;

        const parent = node.parentElement;
        if (!parent || shouldSkipTextNode(parent)) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      },
    });

    while (walker.nextNode()) {
      const line = normalizeLine(walker.currentNode.nodeValue || '');

      if (line.length > 1 && !isAdvertisementLine(line)) {
        lines.push(line);
      }
    }

    return normalizeReadableText(lines.join('\n'));
  };

  const body = document.body;

  if (!body) {
    return { text: '', title, url, updatedAt: Date.now(), source: 'page' };
  }

  const text = collectVisibleReadableText(body).slice(0, 28000);

  return {
    text,
    title,
    url,
    updatedAt: Date.now(),
    source: 'page',
  };
}

async function sendToActiveTab(message: unknown) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return { ok: false, error: 'No active tab found.' };
  }

  await chrome.tabs.sendMessage(tab.id, message);
  return { ok: true };
}

async function sendRetry(item: HistoryItem) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return { ok: false, error: 'No active tab found.' };
  }

  await processAiRequest(
    {
      type: 'PROCESS_AI_REQUEST',
      action: item.action,
      text: item.originalText,
      question: item.question,
      targetLanguage: item.targetLanguage,
    },
    tab.id
  );

  return { ok: true };
}
