/** Product rules and thresholds. The About page reads these so the documentation never drifts from the code. */
export const rules = {
  /** Characters of the definition shown on a browse card. */
  cardDefinitionChars: 140,
  /** Version label given to a new metric. */
  firstVersion: '1.0',
  /** Search weights: any name hit outranks any synonym hit, which outranks measure, then definition/formula hits. */
  searchTiers: { name: 400, synonym: 300, measure: 200, definition: 100 },
  /** Poll interval for the review queue (a live screen), so two stewards see each other's decisions. */
  queuePollMs: 5_000,
} as const;
