import { TRANSLATE_LANGUAGES } from '../shared/constants';
import { ACTION_LABELS } from '../shared/prompts';
import type { ActionId } from '../shared/types';

let toolbar: HTMLElement | null = null;
let loadingIndicator: HTMLElement | null = null;
let languagePicker: HTMLElement | null = null;
let currentSelectedText = '';

const primaryActions: ActionId[] = ['summarize', 'rewrite', 'translate', 'explain'];
const moreActions: ActionId[] = ['simplify', 'expand', 'improve', 'grammar', 'custom', 'ask'];

document.addEventListener('mouseup', handleTextSelection);
document.addEventListener('selectionchange', handleSelectionChange);
document.addEventListener('scroll', hideToolbar, true);

function handleTextSelection(event: MouseEvent) {
  if (isInsideContextIq(event.target)) return;

  const selection = window.getSelection();
  const selectedText = selection?.toString().trim();

  if (selectedText) {
    currentSelectedText = selectedText;
    publishSelection(selectedText);
    showToolbar(event.pageX, event.pageY);
  } else {
    publishSelection('');
    hideToolbar();
  }
}

function handleSelectionChange() {
  setTimeout(() => {
    const selection = window.getSelection();
    if (!selection?.toString().trim()) {
      publishSelection('');
      hideToolbar();
    }
  }, 150);
}

function showToolbar(x: number, y: number) {
  hideToolbar();

  toolbar = document.createElement('div');
  toolbar.className = 'contextiq-toolbar';
  toolbar.style.left = `${Math.max(12, x)}px`;
  toolbar.style.top = `${Math.max(12, y - 54)}px`;

  primaryActions.forEach((action) => toolbar?.appendChild(createActionButton(action)));

  const moreWrap = document.createElement('div');
  moreWrap.className = 'contextiq-more-wrap';

  const moreButton = document.createElement('button');
  moreButton.className = 'contextiq-toolbar-button contextiq-more-button';
  moreButton.type = 'button';
  moreButton.textContent = 'More';
  moreButton.addEventListener('mousedown', stopToolbarEvent);
  moreButton.addEventListener('click', (event) => {
    stopToolbarEvent(event);
    moreWrap.classList.toggle('contextiq-open');
  });

  const moreMenu = document.createElement('div');
  moreMenu.className = 'contextiq-more-menu';
  moreActions.forEach((action) => moreMenu.appendChild(createActionButton(action)));
  moreWrap.append(moreButton, moreMenu);
  toolbar.appendChild(moreWrap);

  toolbar.addEventListener('mousedown', stopToolbarEvent);
  document.body.appendChild(toolbar);
}

function createActionButton(action: ActionId) {
  const button = document.createElement('button');
  button.className = 'contextiq-toolbar-button';
  button.textContent = ACTION_LABELS[action];
  button.type = 'button';
  button.addEventListener('mousedown', (event) => {
    stopToolbarEvent(event);
    void handleAction(action);
  });
  button.addEventListener('click', stopToolbarEvent);
  return button;
}

function hideToolbar() {
  toolbar?.remove();
  toolbar = null;
  hideLanguagePicker();
}

async function handleAction(action: ActionId) {
  const selectedText = currentSelectedText || window.getSelection()?.toString().trim();
  if (!selectedText) return;

  let question: string | undefined;
  let customPrompt: string | undefined;
  let targetLanguage: string | undefined;

  if (action === 'ask') {
    question = window.prompt('What would you like to know about this selection?') || undefined;
    if (!question) return;
  }

  if (action === 'custom') {
    customPrompt = window.prompt('Enter your custom instruction for this selection:') || undefined;
    if (!customPrompt) return;
  }

  if (action === 'translate') {
    targetLanguage = await showTargetLanguagePicker();
    if (!targetLanguage) return;
  }

  hideToolbar();
  showLoadingIndicator(`ContextIQ is working on ${ACTION_LABELS[action].toLowerCase()}...`);
  await chrome.runtime.sendMessage({
    type: 'PROCESS_AI_REQUEST',
    action,
    text: selectedText,
    question,
    targetLanguage,
    customPrompt,
  });
  await chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
}

function publishSelection(text: string) {
  chrome.runtime.sendMessage({ type: 'UPDATE_SELECTION', text }).catch(() => undefined);
}

function showLoadingIndicator(message: string) {
  hideLoadingIndicator();
  loadingIndicator = document.createElement('div');
  loadingIndicator.className = 'contextiq-loading';
  loadingIndicator.innerHTML = `
    <div class="contextiq-loading-spinner"></div>
    <div class="contextiq-loading-text">${escapeHtml(message)}</div>
  `;
  document.body.appendChild(loadingIndicator);
}

function hideLoadingIndicator() {
  loadingIndicator?.remove();
  loadingIndicator = null;
}

function hideLanguagePicker() {
  languagePicker?.remove();
  languagePicker = null;
}

function replaceSelection(text: string) {
  const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
  if (
    active &&
    (active.tagName === 'TEXTAREA' ||
      (active.tagName === 'INPUT' && ['text', 'search', 'url', 'email', 'tel', 'password'].includes(active.type)))
  ) {
    const start = active.selectionStart ?? active.value.length;
    const end = active.selectionEnd ?? start;
    active.setRangeText(text, start, end, 'end');
    active.dispatchEvent(new Event('input', { bubbles: true }));
    active.focus();
    return;
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  selection.deleteFromDocument();
  selection.getRangeAt(0).insertNode(document.createTextNode(text));
}

function stopToolbarEvent(event: Event) {
  event.preventDefault();
  event.stopPropagation();
}

function isInsideContextIq(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('.contextiq-toolbar'));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[char];
  });
}

function showTargetLanguagePicker(): Promise<string | undefined> {
  hideLanguagePicker();

  return new Promise((resolve) => {
    const picker = document.createElement('div');
    picker.className = 'contextiq-language-picker';

    const select = document.createElement('select');
    select.className = 'contextiq-language-select';
    TRANSLATE_LANGUAGES.forEach((language) => {
      const option = document.createElement('option');
      option.value = language;
      option.textContent = language;
      select.appendChild(option);
    });

    const translateButton = document.createElement('button');
    translateButton.className = 'contextiq-language-action';
    translateButton.type = 'button';
    translateButton.textContent = 'Translate';

    const cancelButton = document.createElement('button');
    cancelButton.className = 'contextiq-language-cancel';
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancel';

    const finish = (language?: string) => {
      hideLanguagePicker();
      resolve(language);
    };

    picker.addEventListener('mousedown', stopToolbarEvent);
    translateButton.addEventListener('click', (event) => {
      stopToolbarEvent(event);
      finish(select.value);
    });
    cancelButton.addEventListener('click', (event) => {
      stopToolbarEvent(event);
      finish();
    });

    picker.append(select, translateButton, cancelButton);
    document.body.appendChild(picker);
    languagePicker = picker;

    const toolbarRect = toolbar?.getBoundingClientRect();
    picker.style.left = `${Math.max(12, toolbarRect?.left ?? 12)}px`;
    picker.style.top = `${Math.max(12, (toolbarRect?.bottom ?? 64) + window.scrollY + 8)}px`;
    select.focus();
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_SELECTION') {
    sendResponse({
      text: currentSelectedText || window.getSelection()?.toString().trim() || '',
      updatedAt: Date.now(),
    });
    return false;
  }

  if (message.type === 'GET_PAGE_CONTENT') {
    sendResponse(extractPageContent());
    return false;
  }

  if (message.type === 'PROMPT_FOR_DETAIL') {
    currentSelectedText = message.text;
    void handleAction(message.action as ActionId);
  }

  if (message.type === 'AI_RESPONSE' || message.type === 'AI_ERROR') {
    hideLoadingIndicator();
  }

  if (message.type === 'REPLACE_SELECTION') {
    replaceSelection(message.text);
  }
});

const NOISE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'svg',
  'canvas',
  'iframe',
  'nav',
  'footer',
  'header',
  'form',
  'button',
  'input',
  'textarea',
  'select',
  'aside',
  '[aria-hidden="true"]',
  '[role="banner"]',
  '[role="navigation"]',
  '[role="complementary"]',
  '[role="contentinfo"]',
  '[role="dialog"]',
  '[role="alert"]',
  '[class*="ad"]',
  '[id*="ad"]',
  '[class*="ads"]',
  '[id*="ads"]',
  '[class*="advert"]',
  '[id*="advert"]',
  '[class*="sponsor"]',
  '[id*="sponsor"]',
  '[class*="promo"]',
  '[id*="promo"]',
  '[class*="banner"]',
  '[id*="banner"]',
  '[class*="cookie"]',
  '[id*="cookie"]',
  '[class*="consent"]',
  '[id*="consent"]',
  '[class*="newsletter"]',
  '[id*="newsletter"]',
  '[class*="subscribe"]',
  '[id*="subscribe"]',
  '[class*="popup"]',
  '[id*="popup"]',
  '[class*="modal"]',
  '[id*="modal"]',
  '[class*="share"]',
  '[id*="share"]',
  '[class*="social"]',
  '[id*="social"]',
  '[class*="related"]',
  '[id*="related"]',
  '[class*="recommend"]',
  '[id*="recommend"]',
  '[class*="comment"]',
  '[id*="comment"]',
];

const NOISE_LINE_PATTERNS = [
  /\badvertisement\b/i,
  /\bsponsored\b/i,
  /\bpromoted\b/i,
  /\baffiliate\b/i,
  /\bsubscribe\b/i,
  /\bnewsletter\b/i,
  /\bcookie\b/i,
  /\baccept cookies\b/i,
  /\bprivacy policy\b/i,
  /\bterms of use\b/i,
  /\bsign up\b/i,
  /\blog in\b/i,
  /\bfollow us\b/i,
  /\bshare this\b/i,
  /\brelated articles\b/i,
  /\byou may also like\b/i,
  /\brecommended for you\b/i,
  /\bmore from\b/i,
  /\bbuy now\b/i,
  /\bshop now\b/i,
  /\blimited offer\b/i,
];

function extractPageContent() {
  const title = document.title || '';
  const url = window.location.href;
  const root = findBestContentRoot();

  if (!root) {
    return { text: '', title, url, updatedAt: Date.now(), source: 'page' };
  }

  const clone = root.cloneNode(true) as HTMLElement;
  removeNoiseElements(clone);

  const text = normalizeReadableText(clone.innerText || clone.textContent || '').slice(0, 28000);

  return {
    text,
    title,
    url,
    updatedAt: Date.now(),
    source: 'page',
  };
}

function findBestContentRoot(): HTMLElement | null {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      'article, main, [role="main"], .article, .post, .entry-content, .post-content, .article-content, .content'
    )
  );

  if (candidates.length === 0) {
    return document.body;
  }

  return candidates
    .map((element) => ({
      element,
      score: scoreContentElement(element),
    }))
    .sort((a, b) => b.score - a.score)[0]?.element ?? document.body;
}

function scoreContentElement(element: HTMLElement) {
  const text = normalizeReadableText(element.innerText || element.textContent || '');
  const paragraphs = element.querySelectorAll('p').length;
  const headings = element.querySelectorAll('h1, h2, h3').length;
  const links = element.querySelectorAll('a').length;

  return text.length + paragraphs * 300 + headings * 120 - links * 80;
}

function removeNoiseElements(root: HTMLElement) {
  root.querySelectorAll(NOISE_SELECTORS.join(',')).forEach((node) => node.remove());

  root.querySelectorAll<HTMLElement>('*').forEach((element) => {
    const label = [
      element.className,
      element.id,
      element.getAttribute('aria-label'),
      element.getAttribute('data-testid'),
    ]
      .join(' ')
      .toLowerCase();

    if (
      /advert|sponsor|promo|cookie|consent|newsletter|subscribe|popup|modal|related|recommend|share|social|comment/.test(
        label
      )
    ) {
      element.remove();
    }
  });
}

function normalizeReadableText(text: string) {
  const seen = new Set<string>();

  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 1)
    .filter((line) => !NOISE_LINE_PATTERNS.some((pattern) => pattern.test(line)))
    .filter((line) => {
      const key = line.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join('\n');
}