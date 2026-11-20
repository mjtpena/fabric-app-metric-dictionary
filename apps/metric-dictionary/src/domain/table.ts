/** Read model for the periodic table home: every metric plus which drafts a steward sent back (for Today). */
import { daysBetween } from '@x10/shared/lib';
import type { DataStore } from '@x10/shared/data';

import type { Metric, Schema } from '../model';
import { listMetrics, stewardSubs } from './metrics';
import { isTrustedReview, openChangeRequest } from './rules';

export interface TableData {
  metrics: Metric[];
  sentBack: Map<string, { reviewerName: string; daysAgo: number }>;
}

export async function loadTable(store: DataStore<Schema>, now: Date = new Date()): Promise<TableData> {
  const [metrics, reviews, stewards] = await Promise.all([listMetrics(store), store.repo('Review').list(), stewardSubs(store)]);
  const sentBack = new Map<string, { reviewerName: string; daysAgo: number }>();
  for (const m of metrics) {
    if (m.status !== 'draft') continue;
    const trusted = reviews.filter((r) => isTrustedReview(r, m, stewards));
    const req = openChangeRequest(m, trusted);
    if (req) sentBack.set(m.id, { reviewerName: req.reviewerName, daysAgo: Math.max(0, daysBetween(req.createdAt, now)) });
  }
  return { metrics, sentBack };
}
