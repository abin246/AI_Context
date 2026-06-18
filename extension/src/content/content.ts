import { TRANSLATE_LANGUAGES } from '../shared/constants';
import { ACTION_LABELS } from '../shared/prompts';
import type { ActionId } from '../shared/types';

let toolbar: HTMLElement | null = null;
let loadingIndicator: HTMLElement | null = null;
let languagePicker: HTMLElement | null = null;
let currentSelectedText = '';
let lastEditableTarget: HTMLElement | HTMLInputElement | HTMLTextAreaElement | null = null;

const primaryActions: ActionId[] = ['summarize', 'rewrite', 'translate', 'explain'];
const moreActions: ActionId[] = ['simplify', 'expand', 'improve', 'grammar', 'custom', 'ask'];

document.addEventListener('mouseup', handleTextSelection);
document.addEventListener('selectionchange', handleSelectionChange);
document.addEventListener('scroll', hideToolbar, true);
document.addEventListener('focusin', rememberEditableTarget, true);


function rememberEditableTarget(event: FocusEvent) {
  const target = event.target;

  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  ) {
    lastEditableTarget = target;
  }
}

function isTextInputElement(
  element: Element | null
): element is HTMLInputElement | HTMLTextAreaElement {
  return (
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement &&
      ['text', 'search', 'url', 'email', 'tel', 'password'].includes(element.type))
  );
}

function insertIntoTextInput(element: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const start = element.selectionStart ?? element.value.length;
  const end = element.selectionEnd ?? start;

  element.setRangeText(text, start, end, 'end');
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.focus();
}

function insertIntoContentEditable(element: HTMLElement, text: string) {
  element.focus();

  const selection = window.getSelection();

  if (selection && selection.rangeCount > 0 && element.contains(selection.anchorNode)) {
    selection.deleteFromDocument();
    selection.getRangeAt(0).insertNode(document.createTextNode(text));
    selection.collapseToEnd();
  } else {
    element.appendChild(document.createTextNode(text));
  }

  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
}

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
  const active = document.activeElement;

  if (isTextInputElement(active)) {
    insertIntoTextInput(active, text);
    return;
  }

  if (active instanceof HTMLElement && active.isContentEditable) {
    insertIntoContentEditable(active, text);
    return;
  }

  if (isTextInputElement(lastEditableTarget)) {
    insertIntoTextInput(lastEditableTarget, text);
    return;
  }

  if (lastEditableTarget instanceof HTMLElement && lastEditableTarget.isContentEditable) {
    insertIntoContentEditable(lastEditableTarget, text);
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
  if (message.type === 'GET_SELECTION' || message.type === 'GET_ACTIVE_SELECTION') {
    sendResponse({
      ok: true,
      text: currentSelectedText || window.getSelection()?.toString().trim() || '',
      updatedAt: Date.now(),
    });
    return false;
  }

  if (message.type === 'GET_PAGE_CONTENT') {
    sendResponse(extractPageContent());
    return false;
  }

  if (message.type === 'GET_FORM_CONTEXT') {
    sendResponse(extractFormContext());
    return false;
  }

  if (message.type === 'APPLY_FORM_FILL') {
    const values =
      message.values && typeof message.values === 'object'
        ? (message.values as Record<string, string>)
        : {};

    sendResponse(applyFormFill(values));
    return false;
  }

  if (message.type === 'PROMPT_FOR_DETAIL') {
    currentSelectedText = message.text;
    void handleAction(message.action as ActionId);
    return false;
  }

  if (message.type === 'AI_RESPONSE' || message.type === 'AI_ERROR') {
    hideLoadingIndicator();
    return false;
  }

  if (message.type === 'REPLACE_SELECTION') {
    replaceSelection(message.text);
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

const BASE_SKIP_SELECTORS = [
  'script',
  'style',
  'noscript',
  'svg',
  'canvas',
  'iframe',
  'template',
];

const DIRECT_AD_SELECTORS = [
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

const AD_LABEL_PATTERN =
  /(^|[\s_-])(ad|ads|advert|advertisement|advertorial|sponsor|sponsored|promoted|adslot|adunit|adsbygoogle|doubleclick|google-auto-placed)([\s_-]|$)/i;

const DECORATIVE_SYMBOL_PATTERN = /[•●◆◇■□▲▼▶►▪▫★☆✓✔✕✖→←↑↓]/g;

const AD_LINE_PATTERNS = [
  /^advertisement$/i,
  /^advertisements$/i,
  /^sponsored$/i,
  /^sponsored content$/i,
  /^promoted$/i,
  /^paid promotion$/i,
  /^ad choices$/i,
  /^ads by google$/i,
];

function extractPageContent() {
  const title = document.title || '';
  const url = window.location.href;
  const root = findBestContentRoot();

  if (!root) {
    return { text: '', title, url, updatedAt: Date.now(), source: 'page' };
  }

  const extractedText = collectVisibleReadableText(root);
  const text =
    extractedText.length < 80 && document.body
      ? collectVisibleReadableText(document.body)
      : extractedText;

  return {
    text: text.slice(0, 28000),
    title,
    url,
    updatedAt: Date.now(),
    source: 'page',
  };
}

function findBestContentRoot(): HTMLElement | null {
  const body = document.body;
  if (!body) return null;

  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      'article, main, [role="main"], .article, .post, .entry-content, .post-content, .article-content, .content'
    )
  );

  if (candidates.length === 0) {
    return body;
  }

  const best = candidates
    .map((element) => ({
      element,
      score: scoreContentElement(element),
    }))
    .sort((a, b) => b.score - a.score)[0];

  if (!best) return body;

  const bestTextLength = getTextLength(best.element);
  const bodyTextLength = getTextLength(body);

  if (bestTextLength < 300 || bodyTextLength > bestTextLength * 2.5) {
    return body;
  }

  return best.element;
}

function scoreContentElement(element: HTMLElement) {
  const textLength = getTextLength(element);
  const paragraphs = element.querySelectorAll('p').length;
  const headings = element.querySelectorAll('h1, h2, h3').length;
  const links = element.querySelectorAll('a').length;

  return textLength + paragraphs * 300 + headings * 120 - links * 40;
}

function getTextLength(element?: HTMLElement | null) {
  if (!element) return 0;
  return normalizeReadableText(element.innerText || element.textContent || '').length;
}

function collectVisibleReadableText(root: HTMLElement) {
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
}

function shouldSkipTextNode(element: HTMLElement) {
  if (element.closest(BASE_SKIP_SELECTORS.join(','))) {
    return true;
  }

  if (element.closest(DIRECT_AD_SELECTORS.join(','))) {
    return true;
  }

  const labelledAncestor = element.closest<HTMLElement>('[id], [class], [aria-label], [data-testid]');
  if (labelledAncestor && hasAdLabel(labelledAncestor)) {
    return true;
  }

  return isHiddenElement(element);
}

function hasAdLabel(element: HTMLElement) {
  const label = [
    element.id,
    ...Array.from(element.classList),
    element.getAttribute('aria-label') || '',
    element.getAttribute('data-testid') || '',
  ]
    .join(' ')
    .toLowerCase();

  return AD_LABEL_PATTERN.test(label);
}

function isHiddenElement(element: HTMLElement) {
  if (element.hidden || element.getAttribute('aria-hidden') === 'true') {
    return true;
  }

  const style = window.getComputedStyle(element);

  return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
}

function normalizeLine(line: string) {
  return line
    .replace(/\u00a0/g, ' ')
    .replace(DECORATIVE_SYMBOL_PATTERN, ' ')
    .replace(/[^\S\r\n]+/g, ' ')
    .trim();
}

function normalizeReadableText(text: string) {
  const seen = new Set<string>();

  return text
    .replace(/\u00a0/g, ' ')
    .replace(DECORATIVE_SYMBOL_PATTERN, ' ')
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
}

function isAdvertisementLine(line: string) {
  return AD_LINE_PATTERNS.some((pattern) => pattern.test(line));
}

interface FormFieldContext {
  key: string;
  label: string;
  type: string;
  name: string;
  id: string;
  placeholder: string;
  value: string;
  required: boolean;
  index: number;
}

function extractFormContext() {
  const fields: FormFieldContext[] = getFillableFields().map((element, index) => {
    const label = getFieldLabel(element);
    const type = getFieldType(element);
    const name = element.getAttribute('name') || '';
    const id = element.id || '';
    const placeholder = element.getAttribute('placeholder') || '';

    return {
      key: getFieldKey(element, index),
      label,
      type,
      name,
      id,
      placeholder,
      value: getFieldValue(element),
      required: element.hasAttribute('required'),
      index,
    };
  });

  return {
    ok: fields.length > 0,
    title: document.title || '',
    url: window.location.href,
    fields,
    text: JSON.stringify(
      {
        pageTitle: document.title || '',
        pageUrl: window.location.href,
        fields,
      },
      null,
      2
    ),
    error: fields.length > 0 ? undefined : 'No fillable form fields found on this page.',
  };
}

function getFillableFields() {
  return Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input, textarea, select'
    )
  ).filter((element) => {
    if (isHiddenElementForForm(element)) return false;

    if (element instanceof HTMLInputElement) {
      return ![
        'hidden',
        'submit',
        'button',
        'reset',
        'image',
        'file',
        'password',
      ].includes(element.type);
    }

    return true;
  });
}

function getFieldKey(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  index: number
) {
  return (
    element.getAttribute('name') ||
    element.id ||
    getFieldLabel(element) ||
    element.getAttribute('placeholder') ||
    `field_${index}`
  );
}

function getFieldLabel(element: HTMLElement) {
  if (element.id) {
    const directLabel = Array.from(document.querySelectorAll<HTMLLabelElement>('label')).find(
      (label) => label.htmlFor === element.id
    );

    if (directLabel?.innerText.trim()) {
      return directLabel.innerText.trim();
    }
  }

  const wrappingLabel = element.closest('label');

  if (wrappingLabel?.innerText.trim()) {
    return wrappingLabel.innerText.trim();
  }

  return (
    element.getAttribute('aria-label') ||
    element.getAttribute('placeholder') ||
    element.getAttribute('name') ||
    element.id ||
    ''
  ).trim();
}

function getFieldType(element: HTMLElement) {
  if (element instanceof HTMLInputElement) return element.type || 'text';
  if (element instanceof HTMLTextAreaElement) return 'textarea';
  if (element instanceof HTMLSelectElement) return 'select';
  return 'text';
}

function getFieldValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  if (element instanceof HTMLInputElement && element.type === 'checkbox') {
    return element.checked ? 'checked' : '';
  }

  return element.value || '';
}



function applyFormFill(values: Record<string, string>) {
  const fields = getFillableFields();
  let filled = 0;

  fields.forEach((field, index) => {
    const keys = [
      getFieldKey(field, index),
      field.getAttribute('name') || '',
      field.id || '',
      getFieldLabel(field),
      field.getAttribute('placeholder') || '',
    ]
      .map(normalizeFieldKey)
      .filter(Boolean);

    const matchedEntry = Object.entries(values).find(([key]) =>
      keys.includes(normalizeFieldKey(key))
    );

    if (!matchedEntry) return;

    const value = String(matchedEntry[1] ?? '').trim();
    if (!value) return;

    setFieldValue(field, value);
    filled += 1;
  });

  return {
    ok: filled > 0,
    filled,
    error: filled > 0 ? undefined : 'No matching fields were filled.',
  };
}

function setFieldValue(
  field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string
) {
  field.focus();

  if (field instanceof HTMLSelectElement) {
    const normalizedValue = normalizeFieldKey(value);

    const option = Array.from(field.options).find((item) =>
      [item.value, item.textContent || ''].some(
        (candidate) => normalizeFieldKey(candidate) === normalizedValue
      )
    );

    if (option) {
      field.value = option.value;
    }

    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  if (field instanceof HTMLInputElement && field.type === 'checkbox') {
    field.checked = ['yes', 'true', 'checked', '1'].includes(value.toLowerCase());
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
}

function normalizeFieldKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isHiddenElementForForm(element: HTMLElement) {
  if (element.hidden || element.getAttribute('aria-hidden') === 'true') {
    return true;
  }

  const style = window.getComputedStyle(element);

  return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
}