export interface Word {
  id: string;
  word: string; // The English word or short phrase
  phonetic: string; // IPA e.g. /əˈkæd.ə.mɪk/
  translation: string; // Chinese definition
  exampleEn: string; // Example sentence in English
  exampleZh: string; // Example sentence in Chinese
  createdTime: number;
  correctCount: number;
  mistakeCount: number;
  isStarred?: boolean;
}

export interface DictationSession {
  wordIds: string[];
  currentIndex: number;
  answers: Record<string, string>; // maps word.id -> user's typed submission
  results: Record<string, "correct" | "incorrect" | "skipped">; // maps word.id -> outcome
  status: "idle" | "testing" | "finished";
  mode: "audio" | "visual" | "sentence_gap";
  // "audio": Auditory word-focused dictation (listen to pronunciation, translation optional details displayed)
  // "visual": Visual flashcard translation-definition dictation (show Chinese + Phonetic, type English)
  // "sentence_gap": Sentence contextual fill-in-the-blank dictation (e.g. "I ate a red ____.")
  voiceRate: number; // speech rate e.g. 0.8 or 1.0
  voiceGender: "male" | "female" | "default"; 
}

export interface WordList {
  id: string;
  name: string;
  words: Word[];
  createdTime: number;
  isDefault?: boolean;
}
