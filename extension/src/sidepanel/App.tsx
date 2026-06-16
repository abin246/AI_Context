import React, { useEffect, useMemo, useState } from 'react';
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
  Send,
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
  TRANSLATE_LANGUAGES,
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

const quickActions: ActionId[] = [
  'summarize',
  'rewrite',
  'translate',
  'explain',
  'simplify',
  'improve',
  'grammar',
  'expand',
];

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

        if (message.type === 'VALIDATE_API_KEY') return { ok: true };
        if (message.type === 'REPLACE_SELECTION') return { ok: true };
        if (message.type === 'RETRY_AI_REQUEST') return { ok: true };
        if (message.type === 'RESET_EXTENSION') {
          memory[HISTORY_KEY] = [];
          return { ok: true };
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

  const [view, setView] = useState<PanelView>('workbench');
  const [loading, setLoading] = useState<AiState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selection, setSelection] = useState<SelectionSnapshot>({ text: '', updatedAt: 0 });
  const [composer, setComposer] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [targetLanguage, setTargetLanguage] = useState<string>(TRANSLATE_LANGUAGES[0]);
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState('');

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
      if (changes[AI_STATE_KEY]) {
        applyAiState(changes[AI_STATE_KEY].newValue as AiState | undefined);
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
  }, [loadHistory, loadSettings, setHistory]);

  const latest = history[0];
  const activeText = selection.text || '';
  const hasApiKey = Boolean(settings?.apiKey.trim());
  const loadingTitle = loading?.type === 'AI_LOADING' ? loading.title : '';
  const selectionAge = useMemo(() => {
    if (!selection.updatedAt) return 'No live selection';
    if (selection.source === 'page') return 'Using page content';
    return new Date(selection.updatedAt).toLocaleTimeString();
  }, [selection.source, selection.updatedAt]);

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
    const response = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_SELECTION' });
    setSelection(response?.text ? { ...response, source: 'selection' } : { text: '', updatedAt: 0 });
  }

  async function getTextForAction() {
    const selectedText = activeText.trim();
    if (selectedText) return selectedText;

    const page = await chrome.runtime.sendMessage({ type: 'GET_PAGE_CONTENT' });
    if (page?.ok && page.text) {
      const snapshot = {
        text: page.text,
        title: page.title || 'Current page',
        url: page.url,
        updatedAt: page.updatedAt ?? Date.now(),
        source: 'page' as const,
      };
      setSelection(snapshot);
      return page.text as string;
    }

    throw new Error(page?.error || 'No selected text or readable webpage content found.');
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

  async function sendComposer() {
    const prompt = composer.trim();
    if (!prompt) return;
    await runAction('ask', { question: prompt });
    setComposer('');
  }

  async function sendCustomPrompt() {
    const prompt = customPrompt.trim();
    if (!prompt) return;
    await runAction('custom', { customPrompt: prompt });
    setCustomPrompt('');
  }

  async function runQuickAction(action: ActionId) {
    if (action !== 'translate') {
      await runAction(action);
      return;
    }

    await runAction('translate', { targetLanguage });
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
    setSettingsStatus('Validating...');
    const response = await chrome.runtime.sendMessage({
      type: 'VALIDATE_API_KEY',
      apiKey: settings.apiKey,
    });
    setSettingsStatus(response?.ok ? 'Groq key validated.' : response?.error ?? 'Validation failed.');
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
          <section className="ci-grid">
            <div className="selection-panel">
              <div className="section-head">
                <div>
                  <h2>{selection.source === 'page' ? 'Page Context' : 'Selected Context'}</h2>
                  <p>{selection.title || selectionAge}</p>
                </div>
                <button className="soft-button compact" onClick={refreshSelection}>
                  <RefreshCw size={15} />
                  <span>Refresh</span>
                </button>
              </div>
              <div className={activeText ? 'selection-text' : 'selection-text empty'}>
                {activeText || 'Select text on any webpage to start.'}
              </div>
            </div>

            <div className="actions-panel">
              <div className="section-head">
                <div>
                  <h2>Actions</h2>
                  <p>Uses selected text, or the webpage content if nothing is selected</p>
                </div>
              </div>
              <label className="translate-language-field" htmlFor="translate-language">
                Translate language
                <select
                  id="translate-language"
                  value={targetLanguage}
                  onChange={(event) => setTargetLanguage(event.target.value)}
                >
                  {TRANSLATE_LANGUAGES.map((language) => (
                    <option key={language} value={language}>
                      {language}
                    </option>
                  ))}
                </select>
              </label>
              <div className="action-grid">
                {quickActions.map((action) => (
                  <button key={action} onClick={() => runQuickAction(action)}>
                    <span>{ACTION_LABELS[action]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="composer-panel">
              <div className="composer-block">
                <label htmlFor="ask">Ask about selection</label>
                <div className="composer-row">
                  <input
                    id="ask"
                    value={composer}
                    placeholder="Ask a precise follow-up..."
                    onChange={(event) => setComposer(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void sendComposer();
                    }}
                  />
                  <button className="send-button" title="Send" onClick={sendComposer}>
                    <Send size={16} />
                  </button>
                </div>
              </div>

              <div className="composer-block">
                <label htmlFor="custom">Custom prompt</label>
                <textarea
                  id="custom"
                  rows={3}
                  value={customPrompt}
                  placeholder="Example: Convert this into a client-ready email with action items."
                  onChange={(event) => setCustomPrompt(event.target.value)}
                />
                <button className="primary-wide" onClick={sendCustomPrompt}>
                  Run Custom Prompt
                </button>
              </div>
            </div>

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
              <button className="soft-button" onClick={validateKey}>Validate Key</button>
              <button className="soft-button danger" onClick={() => chrome.runtime.sendMessage({ type: 'RESET_EXTENSION' })}>
                Reset Extension
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
      <h2>No output yet</h2>
      <p>Select text on a webpage and run an action.</p>
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
