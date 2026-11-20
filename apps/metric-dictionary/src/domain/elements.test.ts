import { describe, expect, it } from 'vitest';

import type { Metric, MetricStatus } from '../model';
import {
  assignSymbols,
  atomicOrder,
  freshnessOf,
  groupHues,
  nameWords,
  previewSymbol,
  symbolCandidates,
  tableLayout,
  tableRows,
  toElements,
  todaySignals,
} from './elements';

const NOW = new Date('2026-11-20T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

let seq = 0;
function metric(name: string, over: Partial<Metric> = {}): Metric {
  seq++;
  return {
    id: `m${String(seq).padStart(3, '0')}`,
    name,
    domain: 'Finance',
    definition: 'Definition text long enough.',
    formula: 'A / B',
    measureName: '[M]',
    modelRef: null,
    synonyms: null,
    ownerName: 'Sam Taylor',
    ownerSub: 'sam',
    status: 'approved' as MetricStatus,
    version: '1.0',
    replacedById: null,
    approvedVersionId: null,
    deprecationNote: null,
    submittedAt: null,
    createdAt: daysAgo(100 - seq),
    updatedAt: daysAgo(10),
    ...over,
  };
}

describe('symbols', () => {
  it('drops stop words and punctuation', () => {
    expect(nameWords('Time to Hire')).toEqual(['time', 'hire']);
    expect(nameWords('On-Time Delivery')).toEqual(['on', 'time', 'delivery']);
  });

  it('prefers the initials of the first two words, then the first word', () => {
    expect(symbolCandidates('Customer Churn Rate')[0]).toBe('Cc');
    expect(symbolCandidates('Revenue')[0]).toBe('Re');
    expect(symbolCandidates('Time to Hire')[0]).toBe('Th');
  });

  it('assigns unique symbols in atomic order, so the oldest metric keeps its symbol', () => {
    const a = metric('Customer Churn', { createdAt: daysAgo(50) });
    const b = metric('Customer Count', { createdAt: daysAgo(10) });
    const c = metric('Cash Conversion', { createdAt: daysAgo(5) });
    const s = assignSymbols([c, b, a]);
    expect(s.get(a.id)).toBe('Cc');
    expect(s.get(b.id)).toBe('Cu');
    expect(s.get(c.id)).toBe('Ca');
    expect(new Set(s.values()).size).toBe(3);
  });

  it('stays unique for many similar names', () => {
    const many = Array.from({ length: 60 }, (_, i) => metric(`Revenue ${'abcdefghij'[i % 10]} ${i}`));
    const s = assignSymbols(many);
    expect(new Set(s.values()).size).toBe(60);
    for (const v of s.values()) expect(v).toMatch(/^[A-Z][a-z]$/);
  });

  it('previews the symbol a new name would get', () => {
    const rev = metric('Revenue');
    expect(previewSymbol([rev], 'Retention')).toBe('Rt');
    expect(previewSymbol([rev], 'Revenue', rev.id)).toBe('Re');
  });
});

describe('elements', () => {
  it('numbers metrics by creation order', () => {
    const late = metric('Late', { createdAt: daysAgo(1) });
    const early = metric('Early', { createdAt: daysAgo(90) });
    expect(atomicOrder([late, early]).map((m) => m.name)).toEqual(['Early', 'Late']);
    const els = toElements([late, early], NOW);
    expect(els.map((e) => [e.metric.name, e.n])).toEqual([
      ['Early', 1],
      ['Late', 2],
    ]);
  });

  it('buckets freshness by days since the last change', () => {
    expect(freshnessOf(0)).toBe('fresh');
    expect(freshnessOf(14)).toBe('recent');
    expect(freshnessOf(60)).toBe('ageing');
    expect(freshnessOf(120)).toBe('stale');
    const [e] = toElements([metric('X', { updatedAt: daysAgo(30) })], NOW);
    expect(e.ageDays).toBe(30);
  });

  it('gives each domain a stable hue in name order, ignoring case', () => {
    const els = toElements([metric('A', { domain: 'Sales' }), metric('B', { domain: 'finance ' }), metric('C', { domain: 'Finance' })], NOW);
    const hues = groupHues(els);
    expect([...hues.values()].map((h) => [h.label, h.count])).toEqual([
      ['finance', 2],
      ['Sales', 1],
    ]);
  });
});

describe('table layout', () => {
  const domainSet = (domain: string, n: number) => Array.from({ length: n }, (_, i) => metric(`${domain} metric ${i}`, { domain }));

  it('chooses 3 to 7 rows', () => {
    expect(tableRows(4)).toBe(3);
    expect(tableRows(18)).toBe(4);
    expect(tableRows(500)).toBe(7);
  });

  it('puts the two biggest groups at the edges and the rest lower in the middle', () => {
    const els = toElements([...domainSet('Sales', 6), ...domainSet('Finance', 4), ...domainSet('People', 4), ...domainSet('Operations', 4)], NOW);
    const t = tableLayout(els);
    expect(t.rows).toBe(4);
    expect(t.midRows).toBe(2);
    expect(t.left?.label).toBe('Sales');
    expect(t.left?.columns.map((c) => c.length)).toEqual([4, 2]);
    expect(t.right?.label).toBe('Finance');
    expect(t.right?.columns.map((c) => c.length)).toEqual([4]);
    expect(t.middle.map((b) => [b.label, b.columns.map((c) => c.length)])).toEqual([
      ['Operations', [2, 2]],
      ['People', [2, 2]],
    ]);
    expect(t.columns).toBe(7);
    expect(t.order).toHaveLength(18);
  });

  it('pulls deprecated metrics out into the series', () => {
    const els = toElements([metric('Live'), metric('Old', { status: 'deprecated' })], NOW);
    const t = tableLayout(els);
    expect(t.series.map((e) => e.metric.name)).toEqual(['Old']);
    expect(t.order.map((e) => e.metric.name)).toEqual(['Live', 'Old']);
  });

  it('handles a single group and an empty table', () => {
    expect(tableLayout(toElements(domainSet('Solo', 5), NOW)).right).toBeNull();
    const empty = tableLayout([]);
    expect(empty.left).toBeNull();
    expect(empty.columns).toBe(0);
  });
});

describe('today', () => {
  it('ranks the steward queue oldest first and caps at five', () => {
    const els = toElements(
      [
        metric('Fresh review', { status: 'in_review', submittedAt: daysAgo(2) }),
        metric('Old review', { status: 'in_review', submittedAt: daysAgo(9) }),
        metric('Re-review', { status: 'in_review', submittedAt: daysAgo(3), approvedVersionId: 'v1', version: '1.1' }),
        metric('No measure', { status: 'draft', measureName: null }),
        metric('Sent back', { status: 'draft' }),
        metric('Stale', { updatedAt: daysAgo(130) }),
      ],
      NOW,
    );
    const sentBack = new Map([[els.find((e) => e.metric.name === 'Sent back')!.metric.id, { reviewerName: 'Morgan Lee', daysAgo: 4 }]]);
    const s = todaySignals({ elements: els, sentBack, now: NOW, role: 'steward', me: 'morgan' });
    expect(s).toHaveLength(5);
    expect(s[0].title).toBe('Old review is waiting for review');
    expect(s[0].severity).toBe('bad');
    expect(s[1].title).toBe('Re-review v1.1 would change an approved metric');
    expect(s.map((x) => x.lens)).toContain('owner');
  });

  it('shows owners only their own metrics', () => {
    const els = toElements(
      [metric('Mine', { status: 'draft', ownerSub: 'sam' }), metric('Theirs', { status: 'in_review', ownerSub: 'jordan', submittedAt: daysAgo(3) })],
      NOW,
    );
    const s = todaySignals({ elements: els, sentBack: new Map(), now: NOW, role: 'owner', me: 'sam' });
    expect(s.map((x) => x.title)).toEqual(['Mine is a draft, not yet submitted']);
  });
});
