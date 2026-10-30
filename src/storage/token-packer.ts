export interface PackableExcerptItem {
  id: string;
  title: string;
  citation: string;
  signature?: string | null;
  snippet: string;
  priority: number;
}

export interface PackedBudgetResult {
  tokenBudget: number;
  usedTokens: number;
  truncatedCount: number;
  included: PackableExcerptItem[];
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Packs cited code and ADR excerpts strictly within a target `tokenBudget`.
 * Items are sorted by priority descending and included until the budget is reached.
 */
export function packWithinTokenBudget(
  items: PackableExcerptItem[],
  tokenBudget = 2500
): PackedBudgetResult {
  const sorted = [...items].sort((a, b) => b.priority - a.priority);
  const included: PackableExcerptItem[] = [];
  let usedTokens = 0;
  let truncatedCount = 0;

  for (const item of sorted) {
    const formattedHeader = `[${item.citation}] ${item.title} ${item.signature || ''}\n`;
    const itemTokens = estimateTokens(formattedHeader + (item.snippet || ''));

    if (usedTokens + itemTokens <= tokenBudget) {
      included.push(item);
      usedTokens += itemTokens;
    } else {
      truncatedCount++;
    }
  }

  return {
    tokenBudget,
    usedTokens,
    truncatedCount,
    included
  };
}

