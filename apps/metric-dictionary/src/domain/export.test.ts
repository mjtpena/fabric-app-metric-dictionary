import { parseCsv } from '@x10/shared/lib';

import type { Metric } from '../model';
import { approvedMetrics, exportFileName, NOT_IMPLEMENTED, toCsvText, toMarkdown } from './export';

const m = (name: string, over: Partial<Metric> = {}): Metric => ({
  id: name,
  name,
  domain: 'Finance',
  definition: `Definition of ${name}`,
  formula: 'A | B, "quoted"',
  measureName: '[M]',
  modelRef: null,
  synonyms: null,
  ownerName: 'Owner',
  ownerSub: 'o',
  status: 'approved',
  version: '1.0',
  replacedById: null,
  approvedVersionId: null,
  deprecationNote: null,
  submittedAt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-02T10:00:00.000Z',
  ...over,
});

const list = [
  m('Zeta', { domain: 'Sales' }),
  m('Alpha'),
  m('Draft one', { status: 'draft' }),
  m('Old', { status: 'deprecated' }),
  m('No measure', { measureName: null, domain: 'Sales' }),
];

describe('export', () => {
  it('keeps approved metrics only, by domain then name', () => {
    expect(approvedMetrics(list).map((x) => x.name)).toEqual(['Alpha', 'No measure', 'Zeta']);
  });

  it('writes one CSV row per approved metric, with quoting', () => {
    const rows = parseCsv(toCsvText(list));
    expect(rows).toHaveLength(4);
    expect(rows[0][0]).toBe('Name');
    expect(rows[1]).toContain('A | B, "quoted"');
    expect(rows[2][4]).toBe(NOT_IMPLEMENTED);
    expect(rows[1][9]).toBe('2026-11-02');
  });

  it('writes a Markdown table with escaped pipes', () => {
    const md = toMarkdown(list, '2026-11-20T09:00:00.000Z');
    expect(md).toContain('# Metric Dictionary: approved metrics');
    expect(md).toContain('Exported 2026-11-20 · 3 metrics');
    expect(md).toContain('A \\| B, "quoted"');
    expect(md.split('\n').filter((l) => l.startsWith('| ')).length).toBe(5);
  });

  it('names the file by date', () => {
    expect(exportFileName('2026-11-20T09:00:00.000Z')).toBe('approved-metrics-2026-11-20.csv');
  });
});
