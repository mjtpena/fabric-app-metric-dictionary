import { date, entity, role, text, uuid } from '@microsoft/rayfin-core';

/**
 * One saved state of a metric's definition, formula and measure. Append-only: written on every save that changes
 * one of those three fields, never updated or deleted. The writer's sub is stamped in changedBySub and checked by
 * the create policy; on read the app ignores rows not written by the metric's owner (see trustedVersions).
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', 'create', {
  policy: (claims, item) => claims.sub.eq(item.changedBySub),
})
export class MetricVersion {
  @uuid() id!: string;
  @uuid() metricId!: string;
  @text({ min: 3, max: 12 }) version!: string;
  @text({ min: 10, max: 1000 }) definition!: string;
  @text({ min: 3, max: 1000 }) formula!: string;
  @text({ max: 120, optional: true }) measureName?: string;
  @text({ min: 1, max: 100 }) changedBy!: string;
  @text({ min: 1, max: 255 }) changedBySub!: string;
  @date() changedAt!: Date;
  @text({ max: 300, optional: true }) changeNote?: string;
}
