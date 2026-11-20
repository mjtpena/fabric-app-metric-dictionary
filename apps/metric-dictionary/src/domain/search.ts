/**
 * Metric search ranking (pure). Any name hit ranks above any synonym hit, which ranks above a measure-name hit,
 * which ranks above a definition or formula hit. Within a field: exact > prefix > word start > contains.
 * Ties: live metrics before deprecated ones, then by name.
 */
import { commaList, normKey, tokens } from '@x10/shared/lib';

import { rules } from '../config';
import type { Metric } from '../model';

export type MatchField = 'name' | 'synonym' | 'measure' | 'definition';

export interface SearchHit<M extends SearchableMetric = Metric> {
  metric: M;
  score: number;
  /** Which field matched best; null when there is no query. */
  field: MatchField | null;
  /** The synonym that matched, for "Matched synonym: ARR" cues. */
  matchedText: string | null;
}

export type SearchableMetric = Pick<Metric, 'name' | 'synonyms' | 'measureName' | 'definition' | 'formula' | 'status'>;

/** 4 exact, 3 prefix, 2 a word starts with the query, 1 contains it (or all its words), 0 no match. */
export function fieldScore(text: string | null | undefined, query: string): number {
  const t = normKey(text ?? '');
  const q = normKey(query);
  if (!t || !q) return 0;
  if (t === q) return 4;
  if (t.startsWith(q)) return 3;
  const padded = ` ${t.replace(/[^\p{L}\p{N}]+/gu, ' ')}`;
  if (padded.includes(` ${q.replace(/[^\p{L}\p{N}]+/gu, ' ').trim()}`)) return 2;
  if (t.includes(q)) return 1;
  const qt = tokens(q);
  if (qt.length > 1) {
    const tt = tokens(t);
    if (qt.every((w) => tt.some((x) => x.startsWith(w)))) return 1;
  }
  return 0;
}

function best(values: string[], query: string): { score: number; text: string | null } {
  let top = { score: 0, text: null as string | null };
  for (const v of values) {
    const s = fieldScore(v, query);
    if (s > top.score) top = { score: s, text: v };
  }
  return top;
}

/** Score one metric against a query; 0 means no match. */
export function scoreMetric(m: SearchableMetric, query: string): { score: number; field: MatchField | null; matchedText: string | null } {
  const tiers = rules.searchTiers;
  const name = fieldScore(m.name, query);
  if (name) return { score: tiers.name + name * 10, field: 'name', matchedText: m.name };
  const syn = best(commaList(m.synonyms), query);
  if (syn.score) return { score: tiers.synonym + syn.score * 10, field: 'synonym', matchedText: syn.text };
  const measure = fieldScore(m.measureName, query);
  if (measure) return { score: tiers.measure + measure * 10, field: 'measure', matchedText: m.measureName };
  const def = Math.max(fieldScore(m.definition, query), fieldScore(m.formula, query));
  if (def) return { score: tiers.definition + def * 10, field: 'definition', matchedText: null };
  return { score: 0, field: null, matchedText: null };
}

/** Rank metrics for a query. An empty query returns every metric, live ones first, by name. */
export function searchMetrics<M extends SearchableMetric>(metrics: M[], query: string): SearchHit<M>[] {
  const q = normKey(query);
  const hits: SearchHit<M>[] = [];
  for (const metric of metrics) {
    if (!q) {
      hits.push({ metric, score: 0, field: null, matchedText: null });
      continue;
    }
    const s = scoreMetric(metric, q);
    if (s.score > 0) hits.push({ metric, ...s });
  }
  const dep = (m: SearchableMetric) => (m.status === 'deprecated' ? 1 : 0);
  return hits.sort(
    (a, b) =>
      b.score - a.score ||
      dep(a.metric) - dep(b.metric) ||
      a.metric.name.localeCompare(b.metric.name, undefined, { sensitivity: 'base' }),
  );
}

export const matchLabel: Record<MatchField, string> = {
  name: 'Name match',
  synonym: 'Matched synonym',
  measure: 'Matched measure',
  definition: 'Matched definition',
};
