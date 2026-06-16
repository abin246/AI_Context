export type Provider = 'groq' | 'openai' | 'gemini';
export type Theme = 'light' | 'dark' | 'system';

export type ActionId =
  | 'summarize'
  | 'rewrite'
  | 'translate'
  | 'explain'
  | 'simplify'
  | 'expand'
  | 'improve'
  | 'grammar'
  | 'custom'
  | 'ask';

export interface CustomPrompt {
  id: string;
  title: string;
  prompt: string;
}

export interface ExtensionSettings {
  apiKey: string;
  provider: Provider;
  model: string;
  theme: Theme;
  prompts: CustomPrompt[];
}

export interface HistoryItem {
  id: string;
  action: ActionId;
  title: string;
  result: string;
  originalText: string;
  question?: string;
  targetLanguage?: string;
  createdAt: number;
}

export interface AiLoadingState {
  type: 'AI_LOADING';
  requestId: string;
  action: ActionId;
  title: string;
  originalText: string;
  question?: string;
  targetLanguage?: string;
}

export interface AiResponseState extends HistoryItem {
  type: 'AI_RESPONSE';
}

export interface AiErrorState {
  type: 'AI_ERROR';
  requestId: string;
  action: ActionId;
  title: string;
  error: string;
  originalText: string;
  targetLanguage?: string;
}

export type AiState = AiLoadingState | AiResponseState | AiErrorState;

export interface ProcessAiMessage {
  type: 'PROCESS_AI_REQUEST';
  action: ActionId;
  text: string;
  question?: string;
  targetLanguage?: string;
  customPrompt?: string;
}
