import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  AlertCircle,
  Check,
  Clipboard,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react'; 
import {
  AI_STATE_KEY,
  DEFAULT_SETTINGS,
  GROQ_MODELS,
  HISTORY_KEY,
  SELECTED_TEXT_KEY,
  SETTINGS_KEY,
  TRANSLATE_LANGUAGES,
} from '../shared/constants';
import { ACTION_LABELS } from '../shared/prompts';
import {
  addClipboardItem,
  clearClipboardItems,
  clearHistory,
  deleteClipboardItem,
  getClipboardItems,
} from '../shared/storage';
import type {
  ActionId,
  AiState,
  ClipboardEntry,
  ExtensionSettings,
  HistoryItem,
} from '../shared/types';
import { useContextIqStore } from '../shared/useContextIqStore';
import '../styles/tailwind.css';
import './App.css';

type PanelView = 'workbench' | 'clipboard' | 'history' | 'settings';

installChromePreviewMock();

interface SelectionSnapshot {
  text: string;
  title?: string;
  url?: string;
  updatedAt: number;
  source?: 'selection' | 'page';
}



function installChromePreviewMock() {
  if (typeof chrome !== 'undefined') return;

  type Change = Record<string, chrome.storage.StorageChange>;
  const listeners = new Set<(changes: Change, areaName: string) => void>();
  const memory: Record<string, unknown> = {
    [SETTINGS_KEY]: {
      ...DEFAULT_SETTINGS,
      apiKey: 'preview-key',
    },
    [HISTORY_KEY]: [],
    [SELECTED_TEXT_KEY]: {
      text: '',
      title: 'Preview webpage',
      url: 'https://example.com/preview',
      updatedAt: Date.now(),
    },
  };

  const notify = (changes: Change) => {
    listeners.forEach((listener) => listener(changes, 'local'));
  };

  const readKeys = (keys?: string | string[] | Record<string, unknown> | null) => {
    if (!keys) return { ...memory };
    if (typeof keys === 'string') return { [keys]: memory[keys] };
    if (Array.isArray(keys)) {
      return keys.reduce<Record<string, unknown>>((result, key) => {
        result[key] = memory[key];
        return result;
      }, {});
    }

    return Object.keys(keys).reduce<Record<string, unknown>>((result, key) => {
      result[key] = memory[key] ?? keys[key];
      return result;
    }, {});
  };

  const mockChrome = {
    runtime: {
      sendMessage: async (message: Record<string, unknown>) => {
        if (message.type === 'GET_ACTIVE_SELECTION') {
          return memory[SELECTED_TEXT_KEY];
        }

        if (message.type === 'GET_PAGE_CONTENT') {
          return {
            ok: true,
            text:
              'This is preview webpage content. ContextIQ should summarize the whole page when the user has not selected text. The page includes product details, risks, decisions, and next steps.',
            title: 'Preview webpage',
            url: 'https://example.com/preview',
            updatedAt: Date.now(),
            source: 'page',
          };
        }

        if (message.type === 'PROCESS_AI_REQUEST') {
          const requestId = `${Date.now()}-preview`;
          const action = message.action as ActionId;
          const originalText = String(message.text ?? '');
          await mockChrome.storage.local.set({
            [AI_STATE_KEY]: {
              type: 'AI_LOADING',
              requestId,
              action,
              title: ACTION_LABELS[action],
              originalText,
            },
          });

          window.setTimeout(() => {
            const item = {
              id: requestId,
              type: 'AI_RESPONSE',
              action,
              title: ACTION_LABELS[action],
              result: `Preview ${ACTION_LABELS[action]} output:\n- The fallback read the webpage content.\n- The action button completed and produced a response.\n- Copy, retry, and history controls are visible.`,
              originalText,
              createdAt: Date.now(),
            };
            const history = [item, ...((memory[HISTORY_KEY] as HistoryItem[] | undefined) ?? [])];
            void mockChrome.storage.local.set({
              [AI_STATE_KEY]: item,
              [HISTORY_KEY]: history,
            });
          }, 450);

          return { ok: true };
        }

        if (message.type === 'VALIDATE_API_KEY') {
          const apiKey = String(message.apiKey ?? '').trim();

          return apiKey
            ? { ok: true }
            : { ok: false, error: 'Enter a Groq API key first.' };
        }

        if (message.type === 'REPLACE_SELECTION') return { ok: true };
        if (message.type === 'RETRY_AI_REQUEST') return { ok: true };

        if (message.type === 'RESET_EXTENSION') {
          const freshSettings = {
            ...DEFAULT_SETTINGS,
            prompts: [...DEFAULT_SETTINGS.prompts],
          };

          await mockChrome.storage.local.set({
            [SETTINGS_KEY]: freshSettings,
            [HISTORY_KEY]: [],
            [SELECTED_TEXT_KEY]: { text: '', updatedAt: 0 },
            [AI_STATE_KEY]: undefined,
          });

          return { ok: true, settings: freshSettings };
        }

        return { ok: true };
      },
    },
    storage: {
      local: {
        get: (
          keys?: string | string[] | Record<string, unknown> | null,
          callback?: (items: Record<string, unknown>) => void
        ) => {
          const result = readKeys(keys);
          callback?.(result);
          return Promise.resolve(result);
        },
        set: (items: Record<string, unknown>, callback?: () => void) => {
          const changes = Object.keys(items).reduce<Change>((result, key) => {
            result[key] = {
              oldValue: memory[key],
              newValue: items[key],
            };
            memory[key] = items[key];
            return result;
          }, {});
          notify(changes);
          callback?.();
          return Promise.resolve();
        },
        remove: (keys: string | string[], callback?: () => void) => {
          const list = Array.isArray(keys) ? keys : [keys];
          const changes = list.reduce<Change>((result, key) => {
            result[key] = { oldValue: memory[key], newValue: undefined };
            delete memory[key];
            return result;
          }, {});
          notify(changes);
          callback?.();
          return Promise.resolve();
        },
      },
      onChanged: {
        addListener: (listener: (changes: Change, areaName: string) => void) => {
          listeners.add(listener);
        },
        removeListener: (listener: (changes: Change, areaName: string) => void) => {
          listeners.delete(listener);
        },
      },
    },
  } as unknown as typeof chrome;

  (globalThis as typeof globalThis & { chrome: typeof chrome }).chrome = mockChrome;
}

function App() {
  const history = useContextIqStore((state) => state.history);
  const setHistory = useContextIqStore((state) => state.setHistory);
  const loadHistory = useContextIqStore((state) => state.loadHistory);
  const loadSettings = useContextIqStore((state) => state.loadSettings);
  const persistSettings = useContextIqStore((state) => state.persistSettings);
  const setStoreSettings = useContextIqStore((state) => state.setSettings);

  const [view, setView] = useState<PanelView>('workbench');
  const [loading, setLoading] = useState<AiState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selection, setSelection] = useState<SelectionSnapshot>({ text: '', updatedAt: 0 });
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState('');
  const [validatingKey, setValidatingKey] = useState(false);
  const [resettingExtension, setResettingExtension] = useState(false);

  const [clipboardItems, setClipboardItems] = useState<ClipboardEntry[]>([]);
  const [clipboardInput, setClipboardInput] = useState('');
  const [clipboardSearch, setClipboardSearch] = useState('');
  const pendingAutoReplaceRef = useRef(false);
  const pendingFormFillRef = useRef(false);

  useEffect(() => {
    void loadHistory();
    void loadSettings().then(setSettings);
    void refreshSelection();
    void getClipboardItems().then(setClipboardItems);

    chrome.storage.local.get([AI_STATE_KEY, SELECTED_TEXT_KEY], (result) => {
      applyAiState(result[AI_STATE_KEY] as AiState | undefined);
      if (result[SELECTED_TEXT_KEY]) {
        setSelection(result[SELECTED_TEXT_KEY] as SelectionSnapshot);
      }
    });

    

    const onStorage = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== 'local') return;
      if (changes[HISTORY_KEY]) {
        setHistory((changes[HISTORY_KEY].newValue as HistoryItem[] | undefined) ?? []);
      }
      if (changes[SETTINGS_KEY]) {
  const nextSettings =
    (changes[SETTINGS_KEY].newValue as ExtensionSettings | undefined) ?? {
      ...DEFAULT_SETTINGS,
      prompts: [...DEFAULT_SETTINGS.prompts],
    };

  setSettings(nextSettings);
  setStoreSettings(nextSettings);
}

if (changes[AI_STATE_KEY]) {
  const nextAiState = changes[AI_STATE_KEY].newValue as AiState | undefined;

  if (nextAiState) {
    applyAiState(nextAiState);
        } else {
          setLoading(null);
          setError(null);
        }
      }

      if (changes[SELECTED_TEXT_KEY]) {
        setSelection(
          (changes[SELECTED_TEXT_KEY].newValue as SelectionSnapshot | undefined) ?? {
            text: '',
            updatedAt: 0,
          }
        );
      }
    };

    chrome.storage.onChanged.addListener(onStorage);
    return () => chrome.storage.onChanged.removeListener(onStorage);
  },  [loadHistory, loadSettings, setHistory, setStoreSettings]);

  const latest = history[0];
  const hasApiKey = Boolean(settings?.apiKey.trim());
  const loadingTitle = loading?.type === 'AI_LOADING' ? loading.title : '';
  const currentPageTitle = selection.title || 'Current website';
  const currentPageUrl = selection.url || 'Readable content from the active tab';
  const isAiRunning = loading?.type === 'AI_LOADING';

  const filteredClipboardItems: ClipboardEntry[] = clipboardItems.filter((item) =>
    item.text.toLowerCase().includes(clipboardSearch.trim().toLowerCase())
  );

  function applyAiState(state?: AiState) {
    if (!state) return;

    if (state.type === 'AI_LOADING') {
      setLoading(state);
      setError(null);
      return;
    }

    if (state.type === 'AI_RESPONSE') {
      setLoading(null);
      setError(null);
      setView('workbench');

      if (pendingAutoReplaceRef.current && state.action === 'rewrite') {
        pendingAutoReplaceRef.current = false;
        void replaceSelection(state.result);
      }

      if (pendingFormFillRef.current && state.action === 'form_fill') {
        pendingFormFillRef.current = false;
        void applySmartFormFillResult(state.result);
      }

      return;
    }

    if (state.type === 'AI_ERROR') {
      pendingAutoReplaceRef.current = false;
      pendingFormFillRef.current = false;
      setLoading(null);
      setError(state.error);
    }
  }

  async function refreshSelection() {
    const page = await chrome.runtime.sendMessage({ type: 'GET_PAGE_CONTENT' });

    if (page?.ok && page.text) {
      setSelection({
        text: page.text,
        title: page.title || 'Current website',
        url: page.url,
        updatedAt: page.updatedAt ?? Date.now(),
        source: 'page',
      });
      setError(null);
      return;
    }

    setSelection({ text: '', updatedAt: 0 });
    setError(page?.error || 'Could not read this website.');
  }

  async function getTextForAction() {
    const page = await chrome.runtime.sendMessage({ type: 'GET_PAGE_CONTENT' });

    if (page?.ok && page.text) {
      setSelection({
        text: page.text,
        title: page.title || 'Current website',
        url: page.url,
        updatedAt: page.updatedAt ?? Date.now(),
        source: 'page',
      });

      return page.text as string;
    }

    throw new Error(page?.error || 'No readable website content found on this tab.');
  }

  async function runAction(
    action: ActionId,
    extra?: { question?: string; targetLanguage?: string; customPrompt?: string }
  ) {
    let text = '';
    try {
      text = await getTextForAction();
    } catch (requestError) {
      setLoading(null);
      setError(requestError instanceof Error ? requestError.message : 'Could not read page content.');
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: 'PROCESS_AI_REQUEST',
      action,
      text,
      question: extra?.question,
      targetLanguage: extra?.targetLanguage,
      customPrompt: extra?.customPrompt,
    });

    if (response?.ok === false) {
      setLoading(null);
      setError(response.error || 'Could not start the AI request.');
    }
  }

  async function runActionWithText(
    action: ActionId,
    text: string,
    extra?: { question?: string; targetLanguage?: string; customPrompt?: string }
  ) {
    const response = await chrome.runtime.sendMessage({
      type: 'PROCESS_AI_REQUEST',
      action,
      text,
      question: extra?.question,
      targetLanguage: extra?.targetLanguage,
      customPrompt: extra?.customPrompt,
    });

    if (response?.ok === false) {
      setLoading(null);
      setError(response.error || 'Could not start the AI request.');
    }
  }

  async function summarizeCurrentWebsite() {
    await runAction('summarize');
  }

  async function copyText(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1600);
  }

  async function replaceSelection(text: string) {
    await chrome.runtime.sendMessage({ type: 'REPLACE_SELECTION', text });
  }

  async function retry(item: HistoryItem) {
    await chrome.runtime.sendMessage({ type: 'RETRY_AI_REQUEST', item });
  }

  async function resetHistory() {
    await clearHistory();
    setHistory([]);
  }

  async function savePanelSettings() {
    if (!settings) return;
    await persistSettings(settings);
    setSettingsStatus('Saved locally.');
    window.setTimeout(() => setSettingsStatus(''), 1800);
  }

  async function validateKey() {
  if (!settings) return;

  const apiKey = settings.apiKey.trim();

  if (!apiKey) {
    setSettingsStatus('Enter a Groq API key first.');
    return;
  }

  setValidatingKey(true);
  setSettingsStatus('Validating Groq key...');

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'VALIDATE_API_KEY',
      apiKey,
    });

    if (response?.ok) {
      setSettingsStatus('Groq key validated.');
    } else {
      setSettingsStatus(response?.error || 'Validation failed.');
    }
    } catch (error) {
      setSettingsStatus(
        error instanceof Error
          ? error.message
          : 'Could not contact the extension background service.'
      );
    } finally {
      setValidatingKey(false);
    }
  } 

  async function resetExtension() {
    const shouldReset = window.confirm(
      'Reset ContextIQ? This will clear your API key, settings, selected text, and response history.'
    );

    if (!shouldReset) return;

    setResettingExtension(true);
    setSettingsStatus('Resetting extension...');

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'RESET_EXTENSION',
      });

      if (response?.ok === false) {
        throw new Error(response.error || 'Reset failed.');
      }

      const freshSettings =
        (response?.settings as ExtensionSettings | undefined) ?? {
          ...DEFAULT_SETTINGS,
          prompts: [...DEFAULT_SETTINGS.prompts],
        };

      setSettings(freshSettings);
      setStoreSettings(freshSettings);
      setHistory([]);
      setSelection({ text: '', updatedAt: 0 });
      setLoading(null);
      setError(null);
      setShowKey(false);
      setCopiedId(null);

      setSettingsStatus('Extension reset successfully.');

      window.setTimeout(() => {
        setSettingsStatus('');
      }, 1800);
    } catch (error) {
      setSettingsStatus(
        error instanceof Error ? error.message : 'Could not reset extension.'
      );
    } finally {
      setResettingExtension(false);
    }
  }

  function updateSettings<K extends keyof ExtensionSettings>(key: K, value: ExtensionSettings[K]) {
    setSettings((current) => (current ? { ...current, [key]: value } : current));
  }

  async function rewriteSelectedText() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_SELECTION' });
  const selectedText = response?.text?.trim();

  const rewriteInstruction =
      window.prompt(
        'Rewrite instruction? Example: formal, shorter, simpler, persuasive, friendly, bullet points'
      ) || undefined;

    if (selectedText) {
      pendingAutoReplaceRef.current = true;

      await runActionWithText('rewrite', selectedText, {
        question: rewriteInstruction
          ? `User rewrite instruction: ${rewriteInstruction}`
          : 'Rewrite the selected text clearly and professionally.',
      });

      return;
    }

    pendingAutoReplaceRef.current = false;

    await runAction('rewrite', {
      question: rewriteInstruction
        ? `User rewrite instruction: ${rewriteInstruction}. No text was selected, so rewrite the readable current page content.`
        : 'No text was selected, so rewrite the readable current page content clearly and professionally.',
    });
  }
  async function draftReplyFromPage() {
    const response = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_SELECTION' });
    const selectedText = response?.text?.trim();

    const replyInstruction =
      window.prompt(
        'Reply instruction? Example: polite decline, interested, short follow-up, professional reply'
      ) || undefined;

    if (selectedText) {
      await runActionWithText('reply', selectedText, {
        question: replyInstruction
          ? `User reply instruction: ${replyInstruction}`
          : 'Draft a suitable reply to the selected content.',
      });

      return;
    }

    await runAction('reply', {
      question: replyInstruction
        ? `User reply instruction: ${replyInstruction}. No text was selected, so draft a reply using the readable current page content.`
        : 'No text was selected, so draft a suitable reply using the readable current page content.',
    });
  }

  async function saveClipboardText(text?: string) {
    const value = (text ?? clipboardInput).trim();

    if (!value) {
      setError('Clipboard text is empty.');
      return;
    }

    const nextItems = await addClipboardItem({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      text: value,
      title: currentPageTitle,
      sourceUrl: currentPageUrl,
      createdAt: Date.now(),
    });

    setClipboardItems(nextItems);
    setClipboardInput('');
    setError(null);
  }

  async function readSystemClipboard() {
    try {
      if (!navigator.clipboard?.readText) {
        setError('Clipboard read is not available. Paste text manually and click Save Text.');
        return;
      }

      const text = await navigator.clipboard.readText();

      if (!text.trim()) {
        setError('System clipboard is empty.');
        return;
      }

      await saveClipboardText(text);
    } catch (error) {
      console.warn('Clipboard read failed:', error);
      setError('Clipboard permission is blocked. Paste text into the box manually and click Save Text.');
    }
  }
  async function removeClipboardEntry(id: string) {
    const nextItems = await deleteClipboardItem(id);
    setClipboardItems(nextItems);
  }

  async function clearClipboardManager() {
    await clearClipboardItems();
    setClipboardItems([]);
  }

  async function summarizeClipboardEntry(item: ClipboardEntry) {
    const response = await chrome.runtime.sendMessage({
      type: 'PROCESS_AI_REQUEST',
      action: 'summarize',
      text: item.text,
    });

    if (response?.ok === false) {
      setError(response.error || 'Could not summarize clipboard item.');
    }
  }

  async function translateSelectedText() {
    const response = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_SELECTION' });
    const selectedText = response?.text?.trim();

    if (!selectedText) {
      setError('Select text on the page before using In-context Translation.');
      return;
    }

    const targetLanguage =
      window.prompt(
        `Translate to which language? Example: ${TRANSLATE_LANGUAGES.join(', ')}`,
        'English'
      ) || 'English';

    await runActionWithText('translate', selectedText, {
      targetLanguage,
      question:
        'Preserve meaning, tone, legal context, technical context, and colloquial expressions.',
    });
  }

  async function smartFillCurrentForm() {
    const profile = settings?.userProfile?.trim();

    if (!profile) {
      setError('Add your saved profile or resume data in Settings before using Smart Form Fill.');
      setView('settings');
      return;
    }

    const response = await chrome.runtime.sendMessage({ type: 'GET_FORM_CONTEXT' });

    if (!response?.ok || !response.text) {
      setError(response?.error || 'No fillable form found on this page.');
      return;
    }

    pendingFormFillRef.current = true;

    await runActionWithText('form_fill', response.text, {
      question: [
        'Saved user profile or resume data:',
        profile,
        '',
        'Fill this form using only the saved profile.',
        'Return JSON only in this format:',
        '{"values":{"field_key":"value"}}',
        'Use exact field_key values from the form context.',
        'Omit fields that cannot be answered.',
      ].join('\n'),
    });
  }

  async function applySmartFormFillResult(result: string) {
    try {
      const cleaned = result
        .replace(/^```json/i, '')
        .replace(/^```/i, '')
        .replace(/```$/i, '')
        .trim();

      const parsed = JSON.parse(cleaned) as
        | { values?: Record<string, string> }
        | Record<string, string>;

      const values =
        'values' in parsed && parsed.values && typeof parsed.values === 'object'
          ? parsed.values
          : (parsed as Record<string, string>);

      const response = await chrome.runtime.sendMessage({
        type: 'APPLY_FORM_FILL',
        values,
      });

      if (response?.ok) {
        setError(null);
      } else {
        setError(response?.error || 'Smart Form Fill could not fill matching fields.');
      }
    } catch {
      setError('Smart Form Fill returned invalid JSON. Try again with a clearer saved profile.');
    }
  }

  return (
  <div className="ci-shell">
    <main className="ci-main">
      <header className="ci-topbar">
        <div className="ci-brand">
          <div className="ci-logo">CI</div>
          <div>
            <p className="eyebrow">ContextIQ</p>
            <h1>
              {view === 'settings'
                ? 'Settings'
                : view === 'history'
                  ? 'Response History'
                  : 'Summarize Page'}
            </h1>
          </div>
        </div>

        <div className={hasApiKey ? 'model-chip ready' : 'model-chip'}>
          {hasApiKey ? settings?.model : 'API key needed'}
        </div>
      </header>

      <nav className="ci-tabs" aria-label="ContextIQ navigation">
        <button
          type="button"
          className={view === 'workbench' ? 'active' : ''}
          onClick={() => setView('workbench')}
        >
          Current Page
        </button>

        <button
          type="button"
          className={view === 'clipboard' ? 'active' : ''}
          onClick={() => setView('clipboard')}
        >
          Clipboard
        </button>

        <button
          type="button"
          className={view === 'history' ? 'active' : ''}
          onClick={() => setView('history')}
        >
          History
        </button>

        <button
          type="button"
          className={view === 'settings' ? 'active' : ''}
          onClick={() => setView('settings')}
        >
          Settings
        </button>
      </nav>

      {loading?.type === 'AI_LOADING' && (
        <section className="ci-status loading">
          <Loader2 size={17} />
          <span>{loadingTitle} is running</span>
        </section>
      )}

      {error && (
        <section className="ci-status error">
          <AlertCircle size={17} />
          <span>{error}</span>
        </section>
      )}

      {view === 'workbench' && (
        <section className="summary-workspace">
          <section className="current-page-panel">
            <div className="current-page-info">
              <span>Current Page</span>
              <strong>{currentPageTitle}</strong>
              <p>{currentPageUrl}</p>
            </div>

            <div className="current-page-actions">
              <button
                className="summary-primary-button"
                title="Summarize current page - Ctrl+Shift+S"
                onClick={() => void summarizeCurrentWebsite()}
                disabled={!hasApiKey || isAiRunning}
              >
                {isAiRunning ? 'Summarizing...' : 'Summarize Page'}
              </button>

              <button
                className="soft-button compact"
                title="Rewrite selected text. If no text is selected, rewrite the current page."
                onClick={() => void rewriteSelectedText()}
                disabled={!hasApiKey || isAiRunning}
              >
                Smart Rewrite
              </button>

              <button
                className="soft-button compact"
                title="Draft a reply from selected text or current page content."
                onClick={() => void draftReplyFromPage()}
                disabled={!hasApiKey || isAiRunning}
              >
                Draft Reply
              </button>

              <button
                className="soft-button compact"
                onClick={() => void refreshSelection()}
                disabled={isAiRunning}
              >
                <RefreshCw size={15} />
                <span>Refresh</span>
              </button>
              <button
                className="soft-button compact"
                title="Translate selected text while preserving tone and context"
                onClick={() => void translateSelectedText()}
                disabled={!hasApiKey || isAiRunning}
              >
                Translate Selected
              </button>

              <button
                className="soft-button compact"
                title="Detect and fill forms using your saved profile"
                onClick={() => void smartFillCurrentForm()}
                disabled={!hasApiKey || isAiRunning}
              >
                Smart Form Fill
              </button>
            </div>
          </section>

          {!hasApiKey && (
            <div className="summary-warning">
              <AlertCircle size={16} />
              <span>Add your Groq API key in Settings before summarizing.</span>
            </div>
          )}

          <LatestResult
            item={latest}
            copiedId={copiedId}
            onCopy={copyText}
            onReplace={replaceSelection}
            onRetry={retry}
          />
        </section>
      )}

      {view === 'clipboard' && (
        <section className="clipboard-panel">
          <div className="section-head">
            <div>
              <h2>AI Clipboard Manager</h2>
              <p>{clipboardItems.length} saved clipboard item{clipboardItems.length === 1 ? '' : 's'}</p>
            </div>

            <button className="soft-button danger" onClick={() => void clearClipboardManager()}>
              <Trash2 size={15} />
              <span>Clear</span>
            </button>
          </div>

          <div className="clipboard-compose">
            <textarea
              rows={4}
              value={clipboardInput}
              placeholder="Paste text here or read from system clipboard..."
              onChange={(event) => setClipboardInput(event.target.value)}
            />

            <div className="clipboard-actions">
              <button className="primary-button" onClick={() => void saveClipboardText()}>
                Save Text
              </button>

              <button className="soft-button" onClick={() => void readSystemClipboard()}>
                Read Clipboard
              </button>
            </div>
          </div>

          <input
            value={clipboardSearch}
            placeholder="Search clipboard..."
            onChange={(event) => setClipboardSearch(event.target.value)}
          />

          <div className="clipboard-list">
            {filteredClipboardItems.length === 0 && (
              <div className="empty-state">
                <Clipboard size={32} />
                <h2>No clipboard items</h2>
                <p>Save copied text to reuse, summarize, or transform it later.</p>
              </div>
            )}

            {filteredClipboardItems.map((item) => (
              <article className="clipboard-card" key={item.id}>
                <time>{new Date(item.createdAt).toLocaleString()}</time>
                <p>{item.text}</p>

                <div className="card-actions">
                  <button onClick={() => void copyText(item.text, item.id)}>
                    {copiedId === item.id ? <Check size={15} /> : <Copy size={15} />}
                    <span>{copiedId === item.id ? 'Copied' : 'Copy'}</span>
                  </button>

                  <button onClick={() => void summarizeClipboardEntry(item)}>
                    <RefreshCw size={15} />
                    <span>Summarize</span>
                  </button>

                  <button onClick={() => void removeClipboardEntry(item.id)}>
                    <Trash2 size={15} />
                    <span>Delete</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {view === 'history' && (
        <section className="history-panel">
          <div className="section-head">
            <div>
              <h2>Conversation History</h2>
              <p>
                {history.length} saved response{history.length === 1 ? '' : 's'}
              </p>
            </div>

            <button className="soft-button danger" onClick={resetHistory}>
              <Trash2 size={15} />
              <span>Clear</span>
            </button>
          </div>

          <div className="history-list">
            {history.length === 0 && <EmptyState />}

            {history.map((item) => (
              <ResultCard
                key={item.id}
                item={item}
                copiedId={copiedId}
                onCopy={copyText}
                onReplace={replaceSelection}
                onRetry={retry}
              />
            ))}
          </div>
        </section>
      )}

      {view === 'settings' && settings && (
        <section className="settings-panel">
          <div className="section-head">
            <div>
              <h2>Local AI Configuration</h2>
              <p>Stored only in Chrome Storage on this device</p>
            </div>

            <button className="primary-button" onClick={savePanelSettings}>
              <Save size={15} />
              <span>Save</span>
            </button>
          </div>

          {settingsStatus && <div className="settings-status">{settingsStatus}</div>}

          <label className="field">
            API Key
            <div className="secret-row">
              <input
                type={showKey ? 'text' : 'password'}
                value={settings.apiKey}
                placeholder="gsk_..."
                onChange={(event) => updateSettings('apiKey', event.target.value)}
              />

              <button
                type="button"
                title="Show or hide API key"
                onClick={() => setShowKey((value) => !value)}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          <div className="settings-grid">
            <label className="field">
              Provider
              <select
                value={settings.provider}
                onChange={(event) =>
                  updateSettings('provider', event.target.value as ExtensionSettings['provider'])
                }
              >
                <option value="groq">Groq</option>
                <option value="openai" disabled>
                  OpenAI - future
                </option>
                <option value="gemini" disabled>
                  Gemini - future
                </option>
              </select>
            </label>

            <label className="field">
              Model
              <select
                value={settings.model}
                onChange={(event) => updateSettings('model', event.target.value)}
              >
                {GROQ_MODELS.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            Saved Profile / Resume Data
            <textarea
              rows={7}
              value={settings.userProfile}
              placeholder="Paste your profile or resume details here: name, email, phone, skills, education, work experience, address, LinkedIn, portfolio, etc."
              onChange={(event) => updateSettings('userProfile', event.target.value)}
            />
          </label>

          <div className="settings-actions">
            <button
              className="soft-button"
              onClick={validateKey}
              disabled={validatingKey || !settings.apiKey.trim()}
            >
              {validatingKey ? 'Validating...' : 'Validate Key'}
            </button>

            <button
              className="soft-button danger"
              onClick={resetExtension}
              disabled={resettingExtension}
            >
              {resettingExtension ? 'Resetting...' : 'Reset Extension'}
            </button>
          </div>
        </section>
      )}
    </main>
  </div>
);
}

function LatestResult(props: {
  item?: HistoryItem;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
  onReplace: (text: string) => void;
  onRetry: (item: HistoryItem) => void;
}) {
  if (!props.item) {
    return (
      <section className="latest-panel">
        <EmptyState />
      </section>
    );
  }

  return (
    <section className="latest-panel">
      <div className="section-head">
        <div>
          <h2>Latest Response</h2>
          <p>{ACTION_LABELS[props.item.action]}</p>
        </div>
      </div>
      <ResultCard {...props} item={props.item} compact />
    </section>
  );
}

function ResultCard(props: {
  item: HistoryItem;
  copiedId: string | null;
  compact?: boolean;
  onCopy: (text: string, id: string) => void;
  onReplace: (text: string) => void;
  onRetry: (item: HistoryItem) => void;
}) {
  return (
    <article className={props.compact ? 'result-card compact-result' : 'result-card'}>
      <div className="result-meta">
        <span>{ACTION_LABELS[props.item.action]}</span>
        <time>{new Date(props.item.createdAt).toLocaleString()}</time>
      </div>
      {props.item.question && <p className="question">{props.item.question}</p>}
      {props.item.targetLanguage && (
        <p className="question">Target language: {props.item.targetLanguage}</p>
      )}
      <p className="answer">{props.item.result}</p>
      <details className="source">
        <summary>Original selection</summary>
        <p>{props.item.originalText}</p>
      </details>
      <div className="card-actions">
        <button onClick={() => props.onCopy(props.item.result, props.item.id)}>
          {props.copiedId === props.item.id ? <Check size={15} /> : <Copy size={15} />}
          <span>{props.copiedId === props.item.id ? 'Copied' : 'Copy'}</span>
        </button>
        <button onClick={() => props.onReplace(props.item.result)}>
          <RotateCcw size={15} />
          <span>Replace</span>
        </button>
        <button onClick={() => props.onRetry(props.item)}>
          <RefreshCw size={15} />
          <span>Retry</span>
        </button>
      </div>
    </article>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <Clipboard size={32} />
      <h2>No summary yet</h2>
      <p>Open a website and click Summarize Current Website.</p>
    </div>
  );
}

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
