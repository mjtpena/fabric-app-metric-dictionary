/** Export of approved metrics: one row each, as a Markdown table or CSV. Pure. */
import { mdTable, toCsv } from '@x10/shared/lib';

import type { Metric } from '../model';

export const NOT_IMPLEMENTED = 'Not yet implemented';

export const exportColumns = [
  'Name',
  'Domain',
  'Definition',
  'Formula',
  'Measure',
  'Semantic model',
  'Synonyms',
  'Owner',
  'Version',
  'Last updated (UTC)',
] as const;

/** Approved metrics only, sorted by domain then name. */
export function approvedMetrics(metrics: Metric[]): Metric[] {
  return metrics
    .filter((m) => m.status === 'approved')
    .sort((a, b) => a.domain.localeCompare(b.domain) || a.name.localeCompare(b.name));
}

export function exportRow(m: Metric): string[] {
  return [
    m.name,
    m.domain,
    m.definition,
    m.formula,
    m.measureName ?? NOT_IMPLEMENTED,
    m.modelRef ?? '',
    m.synonyms ?? '',
    m.ownerName,
    m.version,
    m.updatedAt.slice(0, 10),
  ];
}

export function toMarkdown(metrics: Metric[], nowIso: string): string {
  const rows = approvedMetrics(metrics).map(exportRow);
  return [
    '# Metric Dictionary: approved metrics',
    '',
    `Exported ${nowIso.slice(0, 10)} · ${rows.length} metric${rows.length === 1 ? '' : 's'}`,
    '',
    mdTable([...exportColumns], rows),
    '',
  ].join('\n');
}

export function toCsvText(metrics: Metric[]): string {
  return toCsv([...exportColumns], approvedMetrics(metrics).map(exportRow));
}

export function exportFileName(nowIso: string): string {
  return `approved-metrics-${nowIso.slice(0, 10)}.csv`;
}
