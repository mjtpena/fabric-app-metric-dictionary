import { fieldScore, scoreMetric, searchMetrics, type SearchableMetric } from './search';

const m = (name: string, extra: Partial<SearchableMetric> = {}): SearchableMetric => ({
  name,
  synonyms: null,
  measureName: null,
  definition: 'A business metric.',
  formula: 'Sum of things',
  status: 'approved',
  ...extra,
});

describe('fieldScore', () => {
  it('ranks exact > prefix > word start > contains', () => {
    expect(fieldScore('Revenue', ' revenue ')).toBe(4);
    expect(fieldScore('Revenue Growth', 'revenue')).toBe(3);
    expect(fieldScore('Net Revenue Retention', 'revenue')).toBe(2);
    expect(fieldScore('Prerevenue stage', 'revenue')).toBe(1);
    expect(fieldScore('Headcount', 'revenue')).toBe(0);
  });
  it('matches all words of a multi-word query in any order', () => {
    expect(fieldScore('Rate of customer churn', 'churn customer')).toBe(1);
    expect(fieldScore('Rate of customer churn', 'churn supplier')).toBe(0);
  });
  it('ignores case and surrounding spaces, and empty input', () => {
    expect(fieldScore('  On-Time Delivery ', 'on-time delivery')).toBe(4);
    expect(fieldScore(null, 'x')).toBe(0);
    expect(fieldScore('x', '   ')).toBe(0);
  });
});

describe('searchMetrics', () => {
  const metrics = [
    m('Bookings', { synonyms: 'Contracted revenue, TCV signed' }),
    m('Gross Margin', { definition: 'Revenue minus cost of goods sold, divided by revenue.' }),
    m('Net Revenue Retention', { synonyms: 'NRR' }),
    m('Revenue', { synonyms: 'Net sales, Turnover, Top line', measureName: '[Total Revenue]' }),
    m('Headcount'),
    m('Monthly Revenue (legacy)', { status: 'deprecated' }),
    m('Annual Recurring Revenue', { synonyms: 'ARR' }),
  ];

  it('ranks the exact name hit first, then other name hits, then synonyms, then definitions', () => {
    const names = searchMetrics(metrics, 'revenue').map((h) => h.metric.name);
    expect(names).toEqual([
      'Revenue',
      'Annual Recurring Revenue',
      'Net Revenue Retention',
      'Monthly Revenue (legacy)',
      'Bookings',
      'Gross Margin',
    ]);
  });

  it('returns a metric found by synonym, ranked below an exact name hit', () => {
    const list = [m('Turnover'), m('Revenue', { synonyms: 'Net sales, Turnover' })];
    const hits = searchMetrics(list, 'Turnover');
    expect(hits.map((h) => [h.metric.name, h.field])).toEqual([
      ['Turnover', 'name'],
      ['Revenue', 'synonym'],
    ]);
    expect(hits[1].matchedText).toBe('Turnover');
  });

  it('finds synonyms by exact and partial match', () => {
    expect(searchMetrics(metrics, 'arr')[0]).toMatchObject({ field: 'synonym', matchedText: 'ARR' });
    expect(searchMetrics(metrics, 'top')[0].metric.name).toBe('Revenue');
  });

  it('ranks any name hit above any synonym hit', () => {
    const list = [m('Sales Velocity'), m('Revenue', { synonyms: 'Sales' })];
    // "Sales" is an exact synonym of Revenue but only a prefix of a name: the name still wins.
    expect(searchMetrics(list, 'sales').map((h) => h.metric.name)).toEqual(['Sales Velocity', 'Revenue']);
  });

  it('puts measure-name hits between synonyms and definitions', () => {
    const list = [m('A', { definition: 'Uses total revenue' }), m('B', { measureName: '[Total Revenue]' })];
    expect(searchMetrics(list, 'total revenue').map((h) => h.field)).toEqual(['measure', 'definition']);
  });

  it('puts deprecated metrics after live ones on a tie', () => {
    const list = [m('Churn Rate', { status: 'deprecated' }), m('Churn Rate ', { status: 'approved' })];
    expect(searchMetrics(list, 'churn rate').map((h) => h.metric.status)).toEqual(['approved', 'deprecated']);
  });

  it('returns everything for an empty query, live first then by name', () => {
    const names = searchMetrics(metrics, '  ').map((h) => h.metric.name);
    expect(names).toHaveLength(metrics.length);
    expect(names[0]).toBe('Annual Recurring Revenue');
    expect(names[names.length - 1]).toBe('Monthly Revenue (legacy)');
  });

  it('returns nothing when nothing matches', () => {
    expect(searchMetrics(metrics, 'zzz')).toEqual([]);
    expect(scoreMetric(metrics[0], 'zzz')).toEqual({ score: 0, field: null, matchedText: null });
  });
});
