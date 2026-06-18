import type { ActionId } from './types';

export const ACTION_LABELS: Record<ActionId, string> = {
  summarize: 'Summarize',
  rewrite: 'Smart Rewrite',
  reply: 'Draft Reply',
  translate: 'Translate',
  form_fill: 'Smart Form Fill',
  explain: 'Explain',
  simplify: 'Simplify',
  expand: 'Expand',
  improve: 'Improve Writing',
  grammar: 'Fix Grammar',
  custom: 'Custom Prompt',
  ask: 'Ask Question',
};

const SYSTEM_PROMPT = [
  'You are ContextIQ, a precise browser assistant.',
  'Use only the provided content and user instruction.',
  'Avoid advertisement content, sponsored content, promotional text, and decorative special symbols.',
  'Do not invent facts.',
  'Follow the requested format exactly.',
  'Use simple, clean English unless translation is requested.',
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

  rewrite: [
    'Rewrite the provided content according to the user rewrite instruction.',
    'If the user gives a style, tone, length, or format instruction, follow it strictly.',
    'Preserve the original meaning.',
    'Improve clarity, grammar, tone, and flow.',
    'If no specific instruction is provided, rewrite clearly and professionally.',
    'Return only the rewritten text.',
  ].join('\n'),

  reply: [
    'Draft a context-aware reply according to the user reply instruction.',
    'If the user gives a tone, goal, length, or direction, follow it strictly.',
    'Use only the provided content as context.',
    'Do not invent details.',
    'Make the reply natural, concise, and appropriate.',
    'Return only the reply text.',
  ].join('\n'),

  translate: [
    'Translate the provided selected text into the target language.',
    'Preserve the original meaning, tone, intent, legal context, technical context, and colloquial expressions.',
    'Do not explain the translation.',
    'Return only the translated text.',
  ].join('\n'),

  form_fill: [
    'You are filling a web form using the saved user profile or resume data.',
    'Use only information available in the saved profile and form context.',
    'Do not invent missing personal details.',
    'Return JSON only.',
    'The JSON format must be:',
    '{"values":{"field_key":"value"}}',
    'Use exact field_key values provided in the form context.',
    'If a field cannot be answered from the profile, omit it.',
  ].join('\n'),

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
        ? [
            `Translate the following selected text into ${input.targetLanguage?.trim() || 'English'}.`,
            'Preserve meaning, tone, legal context, technical context, and colloquial expressions.',
            'Return only the translated text.',
          ].join('\n')
        : ACTION_PROMPTS[input.action];

  const userParts = [
    `Instruction:\n${instruction}`,
    input.question ? `User instruction - follow this carefully:\n${input.question}` : '',
    `Content:\n${cleanInputText(input.text)}`,
  ].filter(Boolean);

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userParts.join('\n\n') },
  ];
}