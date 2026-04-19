
export interface Word {
  id: string;
  text: string;
  count: number;
  lastUsed?: number;
}

export interface Recommendation {
  word: string;
  translation: string;
  reason: string;
}

export interface SentenceResult {
  sentence: string;
  translation: string;
  context: string;
  imageUrl?: string;
  audioData?: string;
}

export interface AppState {
  wordBank: Word[];
  history: SentenceResult[];
}
