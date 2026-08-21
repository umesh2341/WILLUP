export interface FixtureMatchCriteria {
  exact?: string;
  keywords?: string[];
  isCategoryUnclear?: boolean;
}

export interface FixtureEntry<T> {
  id: string;
  description?: string;
  match: FixtureMatchCriteria;
  output: T;
}

/**
 * Searches fixture entries for an exact match or keyword match against the input text.
 * If no fixture matches in TEST_MODE, it throws a clear Error.
 */
export function findFixtureMatch<T>(
  agentName: string,
  inputText: string,
  fixtures: FixtureEntry<T>[],
  options?: { isCategoryUnclear?: boolean; hasHistory?: boolean }
): T {
  const normalizedInput = (inputText || "").trim().toLowerCase();

  // 1. If options like isCategoryUnclear are specified, prioritize fixtures matching isCategoryUnclear
  if (options?.isCategoryUnclear) {
    const unclearMatch = fixtures.find((f) => {
      if (f.match.isCategoryUnclear !== true) return false;
      if (f.match.exact && f.match.exact.trim().toLowerCase() === normalizedInput) return true;
      if (f.match.keywords && f.match.keywords.some((k) => normalizedInput.includes(k.toLowerCase()))) return true;
      return false;
    });
    if (unclearMatch) {
      return JSON.parse(JSON.stringify(unclearMatch.output));
    }
  }

  // 2. Exact match (case-insensitive and trimmed)
  const exactMatch = fixtures.find((f) => {
    if (f.match.exact && f.match.exact.trim().toLowerCase() === normalizedInput) {
      return true;
    }
    return false;
  });
  if (exactMatch) {
    return JSON.parse(JSON.stringify(exactMatch.output));
  }

  // 3. Keyword match
  const keywordMatch = fixtures.find((f) => {
    if (f.match.keywords && f.match.keywords.length > 0) {
      return f.match.keywords.some((k) => normalizedInput.includes(k.toLowerCase()));
    }
    return false;
  });
  if (keywordMatch) {
    return JSON.parse(JSON.stringify(keywordMatch.output));
  }

  // Throw clear error if no fixture matches in TEST_MODE
  throw new Error(`[${agentName}] No fixture match found for input: "${inputText}" in TEST_MODE`);
}
