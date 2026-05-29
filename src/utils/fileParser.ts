import { Word } from "../types";

/**
 * Utility to parse plain text or CSV into raw words
 * Supports comma-separated, tab-separated, or line-by-line format
 */
export function parseImportedFileContent(text: string): Partial<Word>[] {
  const lines = text.split(/\r?\n/);
  const wordsList: Partial<Word>[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if it's a CSV type structure (separated by comma, semicolon, or tab)
    const separators = [",", "\t", ";"];
    let bestSeparator = ",";
    let maxSplits = 0;

    for (const sep of separators) {
      const parts = trimmed.split(sep);
      if (parts.length > maxSplits) {
        maxSplits = parts.length;
        bestSeparator = sep;
      }
    }

    if (maxSplits > 1) {
      const parts = trimmed.split(bestSeparator).map(p => p.trim());
      // Expecting: word, translation, phonetic, exampleEn, exampleZh
      const word = parts[0];
      if (!word) continue;

      wordsList.push({
        word: word,
        translation: parts[1] || "",
        phonetic: parts[2] || "",
        exampleEn: parts[3] || "",
        exampleZh: parts[4] || "",
      });
    } else {
      // Single word per line
      // Check if it contains Chinese e.g., "apple 苹果" or "apple - 苹果"
      const match = trimmed.match(/^([a-zA-Z\s'-]+)(?:[-：:\s\t]+(.*))?$/);
      if (match) {
        const eng = match[1].trim();
        const ch = match[2] ? match[2].trim() : "";
        if (eng) {
          wordsList.push({
            word: eng,
            translation: ch,
          });
        }
      } else {
        wordsList.push({
          word: trimmed,
        });
      }
    }
  }

  return wordsList;
}
