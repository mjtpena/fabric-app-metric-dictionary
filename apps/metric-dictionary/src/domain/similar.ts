/**
 * Live duplicate detection for the Lab (pure). Two signals, strongest first:
 * 1. the name or a synonym typed matches an existing name, synonym or measure (the dictionary search ranking);
 * 2. a significant word typed shares its stem with a word of an existing name or synonym ("Churned Revenue" finds
 *    "Customer Churn Rate" and "Revenue"). Generic words such as rate, count or total are ignored.
 */
import { commaList } from '@x10/shared/lib';

import type { Metric } from '../model';
import { nameWords } from './elements';
import { matchLabel, searchMetrics } from './search';

export interface SimilarHit {
  id: string;
  score: number;
  reason: string;
}

const GENERIC = new Set([
  'rate',
  'count',
  'total',
  'number',
  'average',
  'ratio',
  'percent',
  'percentage',
  'share',
  'value',
  'days',
  'time',
  'score',
  'index',
  'amount',
  'monthly',
  'annual',
  'daily',
  'weekly',
]);

/** First letters of a word that count as its stem: "churned" → "churn", "revenue" → "reven". */
export function stem(word: string): string {
  const w = word.toLowerCase();
  return w.length <= 5 ? w : w.slice(0, Math.max(5, w.length - 2));
}

function significant(text: string): string[] {
  return nameWords(text).filter((w) => w.length >= 4 && !GENERIC.has(w));
}

export function similarMetrics(all: Metric[], name: string, synonyms: string, exceptId: string | null, limit = 4): SimilarHit[] {
  const out = new Map<string, SimilarHit>();
  const add = (id: string, score: number, reason: string) => {
    if (id === exceptId) return;
    const cur = out.get(id);
    if (!cur) out.set(id, { id, score, reason });
    else if (score > cur.score) out.set(id, { id, score: score + Math.min(cur.score, 50), reason });
    else cur.score += Math.min(score, 50);
  };

  const queries = [name, ...commaList(synonyms)].map((q) => q.trim()).filter((q) => q.length >= 3);
  for (const q of queries) {
    for (const h of searchMetrics(all, q)) {
      if (!h.field || h.field === 'definition') continue;
      add(h.metric.id, 1000 + h.score, h.field === 'name' ? `Name match for “${q}”` : `${matchLabel[h.field]}${h.matchedText ? `: ${h.matchedText}` : ''}`);
    }
  }

  const typed = [...new Set(queries.flatMap(significant))];
  for (const m of all) {
    const words = [...significant(m.name), ...commaList(m.synonyms).flatMap(significant)];
    const shared = typed.filter((t) => words.some((w) => w.startsWith(stem(t)) || t.startsWith(stem(w))));
    if (shared.length) add(m.id, 100 * shared.length, `Shares “${shared.slice(0, 2).join('”, “')}”`);
  }

  const byId = new Map(all.map((m) => [m.id, m]));
  const dep = (id: string) => (byId.get(id)?.status === 'deprecated' ? 1 : 0);
  return [...out.values()]
    .sort((a, b) => b.score - a.score || dep(a.id) - dep(b.id) || (byId.get(a.id)?.name ?? '').localeCompare(byId.get(b.id)?.name ?? ''))
    .slice(0, limit);
}
