import type { ActionId } from './types';

export const ACTION_LABELS: Record<ActionId, string> = {
  summarize: 'Summarize',
  rewrite: 'Rewrite',
  translate: 'Translate',
  explain: 'Explain',
  simplify: 'Simplify',
  expand: 'Expand',
  improve: 'Improve Writing',
  grammar: 'Fix Grammar',
  custom: 'Custom Prompt',
  ask: 'Ask Question',
};

const SYSTEM_PROMPT = [
  'You are ContextIQ, a precise webpage summarizer.',
  'Summarize the provided webpage content clearly and accurately.',
  'Avoid advertisement content, sponsored content, promotional text, and decorative special symbols.',
  'Do not invent facts.',
  'Use simple, clean English.',
].join(' ');

const ACTION_PROMPTS: Record<ActionId, string> = {
 summarize: [
    'Create a precise webpage summary using this exact format:',
    '',
    'First write one short paragraph of 1-2 sentences explaining the main topic.',
    '',
    'Then write:',
    'Key Points',
    '',
    'After Key Points, list 5-8 important points.',
    '',
    'Rules:',
    '- Avoid advertisement content.',
    '- Avoid sponsored or promotional text.',
    '- Avoid special symbols and decorative formatting.',
    '- Do not use markdown headings like ## or ###.',
    '- Do not add extra sections.',
    '- Keep only useful facts from the page.',
    '- Keep each key point short and direct.',
  ].join('\n'),

  rewrite: 'Rewrite the following content professionally while preserving meaning.',
  translate:
    'Translate the following content while preserving context and intent. If no target language is provided, translate it into English.',
  explain: 'Explain this content clearly with examples.',
  simplify: 'Simplify this content using plain language while preserving the key facts.',
  expand: 'Expand this content with helpful detail while preserving the original intent.',
  improve: 'Improve the writing for clarity, tone, and flow while preserving meaning.',
  grammar: 'Fix grammar, spelling, and punctuation while preserving the original voice.',
  custom: 'Follow the custom instruction for the provided webpage content.',
  ask: 'Answer the user question using only the provided webpage content when possible. Say when the answer is not present.',
};

function cleanInputText(text: string) {
  return text
    .replace(/[•●◆◇■□▲▼▶►▪▫★☆✓✔✕✖→←↑↓]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildMessages(input: {
  action: ActionId;
  text: string;
  question?: string;
  targetLanguage?: string;
  customPrompt?: string;
}) {
  const instruction =
    input.action === 'custom' && input.customPrompt
      ? input.customPrompt
      : input.action === 'translate'
        ? `Translate the following content into ${
            input.targetLanguage?.trim() || 'English'
          } while preserving context and intent. Ignore ads, sponsored content, popups, cookie banners, navigation, footer, sidebars, comments, and promotional text.`
        : ACTION_PROMPTS[input.action];

  const userParts = [
    `Instruction:\n${instruction}`,
    input.question ? `Question or detail:\n${input.question}` : '',
    `Webpage content:\n${cleanInputText(input.text)}`,
  ].filter(Boolean);

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userParts.join('\n\n') },
  ];
}