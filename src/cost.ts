// What one Claude call costs, from the token counts the API returns.
// US dollars per 1 million tokens; check https://claude.com/pricing before quoting.
// Output tokens include Claude's thinking, which is billed as output.
export const PRICES_PER_MILLION: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

// Used by the spending stop when a model has no price on file, so an unknown
// model can never make the spend look smaller than it is.
export const WORST_CASE_PRICE = { input: 10, output: 50 };

export type TokenUsage = { input_tokens: number; output_tokens: number };

export function costUsd(model: string, usage: TokenUsage): number | null {
  const price = PRICES_PER_MILLION[model];
  if (!price) return null;
  return (usage.input_tokens * price.input + usage.output_tokens * price.output) / 1_000_000;
}

export function worstCaseCostUsd(usage: TokenUsage): number {
  return (usage.input_tokens * WORST_CASE_PRICE.input + usage.output_tokens * WORST_CASE_PRICE.output) / 1_000_000;
}
