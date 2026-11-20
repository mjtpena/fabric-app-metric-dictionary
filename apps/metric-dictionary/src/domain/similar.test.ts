import { describe, expect, it } from 'vitest';

import type { Metric } from '../model';
import { similarMetrics, stem } from './similar';

let n = 0;
const metric = (name: string, over: Partial<Metric> = {}): Metric => ({
  id: `m${++n}`,
  name,
  domain: 'Sales',
  definition: 'A definition that is long enough.',
  formula: 'A / B',
  measureName: null,
  modelRef: null,
  synonyms: null,
  ownerName: 'Sam',
  ownerSub: 'sam',
  status: 'approved',
  version: '1.0',
  replacedById: null,
  approvedVersionId: null,
  deprecationNote: null,
  submittedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

const all = [
  metric('Revenue', { synonyms: 'Net sales, Turnover' }),
  metric('Customer Churn Rate', { synonyms: 'Churn, Customer attrition' }),
  metric('Win Rate'),
  metric('Monthly Churn Count', { status: 'deprecated' }),
  metric('Headcount'),
];
const name = (id: string) => all.find((m) => m.id === id)?.name;

describe('similar metrics', () => {
  it('stems words', () => {
    expect(stem('churned')).toBe('churn');
    expect(stem('rate')).toBe('rate');
  });

  it('puts a search hit (name or synonym) first', () => {
    const hits = similarMetrics(all, 'Turnover', '', null);
    expect(name(hits[0].id)).toBe('Revenue');
    expect(hits[0].reason).toBe('Matched synonym: Turnover');
  });

  it('finds shared word stems and ignores generic words', () => {
    const hits = similarMetrics(all, 'Churned Revenue', '', null).map((h) => name(h.id));
    expect(hits).toContain('Customer Churn Rate');
    expect(hits).toContain('Revenue');
    expect(hits).not.toContain('Win Rate');
    // Live metrics rank before deprecated ones on a tie.
    expect(hits.indexOf('Customer Churn Rate')).toBeLessThan(hits.indexOf('Monthly Churn Count'));
  });

  it('skips the metric being edited and short input', () => {
    const rev = all[0];
    expect(similarMetrics(all, 'Revenue', '', rev.id).map((h) => h.id)).not.toContain(rev.id);
    expect(similarMetrics(all, 'Re', '', null)).toEqual([]);
  });

  it('checks synonyms typed too', () => {
    const hits = similarMetrics(all, 'Staff total', 'Headcount', null);
    expect(name(hits[0].id)).toBe('Headcount');
  });
});
