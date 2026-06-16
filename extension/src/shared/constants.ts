import type { CustomPrompt, ExtensionSettings } from './types';

export const SETTINGS_KEY = 'contextiqSettings';
export const HISTORY_KEY = 'contextiqHistory';
export const AI_STATE_KEY = 'latestAiState';
export const RATE_LIMIT_KEY = 'contextiqRateLimit';
export const SELECTED_TEXT_KEY = 'contextiqSelectedText';

export const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'deepseek-r1-distill-llama-70b',
  'qwen-qwq-32b',
] as const;

export const TRANSLATE_LANGUAGES = [
  'English',
  'Hindi',
  'Malayalam',
  'Tamil',
  'Telugu',
  'Kannada',
] as const;

export const DEFAULT_PROMPTS: CustomPrompt[] = [
  {
    id: 'executive-summary',
    title: 'Summarize for executives',
    prompt: 'Summarize this for an executive audience with decisions, risks, and next steps.',
  },
  {
    id: 'beginner-explain',
    title: 'Explain for beginners',
    prompt: 'Explain this for a beginner using plain language and one concrete example.',
  },
  {
    id: 'technical-explanation',
    title: 'Technical explanation',
    prompt: 'Explain this technically, including assumptions, mechanisms, and edge cases.',
  },
];

export const DEFAULT_SETTINGS: ExtensionSettings = {
  apiKey: '',
  provider: 'groq',
  model: 'llama-3.3-70b-versatile',
  theme: 'system',
  prompts: DEFAULT_PROMPTS,
};
