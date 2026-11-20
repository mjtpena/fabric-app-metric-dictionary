import { date, entity, role, set, text, uuid } from '@microsoft/rayfin-core';

/**
 * A steward's decision on one version of a metric. Append-only (create and read only). The reviewer's sub is stamped
 * in reviewerSub and checked by the create policy. Whether the reviewer is a steward (Person.isAdmin, which clients
 * cannot set) and not the metric's owner is checked in the domain on write and again on read.
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', 'create', {
  policy: (claims, item) => claims.sub.eq(item.reviewerSub),
})
export class Review {
  @uuid() id!: string;
  @uuid() metricId!: string;
  @text({ min: 3, max: 12 }) versionLabel!: string;
  @text({ min: 1, max: 255 }) reviewerSub!: string;
  @text({ min: 1, max: 100 }) reviewerName!: string;
  @set('approve', 'changes') decision!: 'approve' | 'changes';
  @text({ max: 500, optional: true }) comment?: string;
  @date() createdAt!: Date;
}
