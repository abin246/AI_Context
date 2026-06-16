import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  AlertCircle,
  Brain,
  Check,
  Clipboard,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  Trash2,
} from 'lucide-react';
import {
  AI_STATE_KEY,
  DEFAULT_SETTINGS,
  GROQ_MODELS,
  HISTORY_KEY,
  SELECTED_TEXT_KEY,
  SETTINGS_KEY,
} from '../shared/constants';
import { ACTION_LABELS } from '../shared/prompts';
import { clearHistory } from '../shared/storage';
import type { ActionId, AiState, ExtensionSettings, HistoryItem } from '../shared/types';
import { useContextIqStore } from '../shared/useContextIqStore';
import '../styles/tailwind.css';
import './App.css';

type PanelView = 'workbench' | 'history' | 'settings';

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

  useEffect(() => {
    void loadHistory();
    void loadSettings().then(setSettings);
    void refreshSelection();

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

  function applyAiState(state?: AiState) {
    if (!state) return;
    if (state.type === 'AI_LOADING') {
      setLoading(state);
      setError(null);
    }
    if (state.type === 'AI_RESPONSE') {
      setLoading(null);
      setError(null);
      setView('workbench');
    }
    if (state.type === 'AI_ERROR') {
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

  return (
    <div className="ci-shell">
      <aside className="ci-rail" aria-label="ContextIQ navigation">
        <button
          className={view === 'workbench' ? 'active' : ''}
          title="Workbench"
          onClick={() => setView('workbench')}
        >
          <Brain size={19} />
        </button>
        <button
          className={view === 'history' ? 'active' : ''}
          title="History"
          onClick={() => setView('history')}
        >
          <Clipboard size={19} />
        </button>
        <button
          className={view === 'settings' ? 'active' : ''}
          title="Settings"
          onClick={() => setView('settings')}
        >
          <Settings size={19} />
        </button>
      </aside>

      <main className="ci-main">
        <header className="ci-header">
          <div>            
            <h1>{view === 'settings' ? 'Settings' : view === 'history' ? 'Response History' : 'ContextIQ'}</h1>
          </div>
          <div className={hasApiKey ? 'model-chip ready' : 'model-chip'}>
            {hasApiKey ? settings?.model : 'API key needed'}
          </div>
        </header>

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
            <section className="summary-card">
              <div className="summary-header">
                <div>
                  <span className="summary-kicker">Website summary</span>    
                </div>
              </div>

              <div className="page-source">
                <span>Current page</span>
                <strong>{currentPageTitle}</strong>
                <p>{currentPageUrl}</p>
              </div>

              {!hasApiKey && (
                <div className="summary-warning">
                  <AlertCircle size={16} />
                  <span>Add your Groq API key in Settings before summarizing.</span>
                </div>
              )}

              <div className="summary-actions">
                <button
                  className="summary-primary-button"
                  onClick={() => void summarizeCurrentWebsite()}
                  disabled={!hasApiKey || isAiRunning}
                >
                  {isAiRunning ? 'Summarizing...' : 'Summarize Current Website'}
                </button>

                <button
                  className="soft-button compact"
                  onClick={() => void refreshSelection()}
                  disabled={isAiRunning}
                >
                  <RefreshCw size={15} />
                  <span>Refresh Page</span>
                </button>
              </div>
            </section>

            <LatestResult
              item={latest}
              copiedId={copiedId}
              onCopy={copyText}
              onReplace={replaceSelection}
              onRetry={retry}
            />
          </section>
        )}

        {view === 'history' && (
          <section className="history-panel">
            <div className="section-head">
              <div>
                <h2>Conversation History</h2>
                <p>{history.length} saved response{history.length === 1 ? '' : 's'}</p>
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
                <button title="Show or hide API key" onClick={() => setShowKey((value) => !value)}>
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            <div className="settings-grid">
              <label className="field">
                Provider
                <select value={settings.provider} onChange={(event) => updateSettings('provider', event.target.value as ExtensionSettings['provider'])}>
                  <option value="groq">Groq</option>
                  <option value="openai" disabled>OpenAI - future</option>
                  <option value="gemini" disabled>Gemini - future</option>
                </select>
              </label>

              <label className="field">
                Model
                <select value={settings.model} onChange={(event) => updateSettings('model', event.target.value)}>
                  {GROQ_MODELS.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </label>
            </div>

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
