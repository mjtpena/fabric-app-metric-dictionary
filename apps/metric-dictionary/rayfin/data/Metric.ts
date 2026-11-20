import { date, entity, role, set, text, uuid } from '@microsoft/rayfin-core';

/**
 * A business metric: name, plain-English definition, business formula and the measure that implements it.
 *
 * Security (see README "Security model"):
 * - Everyone signed in reads every metric.
 * - Create: only as yourself (ownerSub = your sub) and only as a draft, so nobody can insert an approved metric.
 * - Update: the owner, or anyone while the row is in review. The second branch lets a steward (who usually does not
 *   own the metric) record an approval or a change request; the policy DSL has no admin claim, so "only stewards
 *   approve" and "not your own" are enforced in src/domain/metrics.ts, and an approval without a matching steward
 *   Review row is flagged as unverified on read. ownerSub and createdAt can never be changed by a client.
 * - Delete: nobody (metrics are deprecated, never deleted).
 */
@entity()
@role('authenticated', 'read')
@role('authenticated', 'create', {
  policy: (claims, item) => claims.sub.eq(item.ownerSub).and(item.status.eq('draft')),
})
@role('authenticated', 'update', {
  policy: (claims, item) => claims.sub.eq(item.ownerSub).or(item.status.eq('in_review')),
  exclude: ['ownerSub', 'createdAt'],
})
export class Metric {
  @uuid() id!: string;
  @text({ min: 3, max: 80 }) name!: string;
  @text({ min: 2, max: 60 }) domain!: string;
  @text({ min: 10, max: 1000 }) definition!: string;
  @text({ min: 3, max: 1000 }) formula!: string;
  @text({ max: 120, optional: true }) measureName?: string;
  @text({ max: 150, optional: true }) modelRef?: string;
  @text({ max: 300, optional: true }) synonyms?: string;
  @text({ min: 1, max: 100 }) ownerName!: string;
  @text({ min: 1, max: 255 }) ownerSub!: string;
  @set('draft', 'in_review', 'approved', 'deprecated') status!: 'draft' | 'in_review' | 'approved' | 'deprecated';
  @text({ min: 3, max: 12 }) version!: string;
  @uuid({ optional: true }) replacedById?: string;
  @uuid({ optional: true }) approvedVersionId?: string;
  @text({ max: 300, optional: true }) deprecationNote?: string;
  @date({ optional: true }) submittedAt?: Date;
  @date() createdAt!: Date;
  @date() updatedAt!: Date;
}
