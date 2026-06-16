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
  'Summarize only the main content of the webpage.',
  'Ignore advertisements, sponsored content, affiliate text, popups, cookie banners, newsletter prompts, login prompts, navigation menus, headers, footers, sidebars, related posts, comments, and repeated boilerplate.',
  'Do not mention ignored ads or removed content.',
  'Do not invent facts.',
  'Do not add extra explanations.',
  'Avoid special symbols, markdown headings, emojis, decorative formatting, and promotional language.',
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
    'Strict rules:',
    '- Do not use markdown headings like ## or ###.',
    '- Do not use bold text.',
    '- Do not use emojis.',
    '- Do not use decorative symbols.',
    '- Do not add sections like Quick Summary, Important Details, or Main Takeaway.',
    '- Do not include advertisements, sponsored content, cookie text, newsletter text, navigation text, footer text, sidebar text, related article text, or comments.',
    '- Keep only precise facts from the main webpage content.',
    '- Prefer names, dates, events, places, numbers, and important facts.',
    '- Keep each key point short and direct.',
    '- Do not make the summary longer than needed.',
    '',
    'Example style:',
    'Julius Caesar was a Roman general, statesman, and author who played a critical role in the transformation of the Roman Republic into the Roman Empire.',
    '',
    'Key Points',
    'Born into a patrician family, the gens Julia, on 12 or 13 July 100 BC',
    'Rose to become one of the most powerful politicians in the Roman Republic through military victories',
    'Formed the First Triumvirate with Crassus and Pompey',
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