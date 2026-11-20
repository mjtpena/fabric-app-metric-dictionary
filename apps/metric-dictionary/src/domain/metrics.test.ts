import { PermissionError, RuleError } from '@x10/shared/data';
import type { Person } from '@x10/shared/identity';
import { addMinutes } from '@x10/shared/lib';
import { FIXED_NOW, testStore } from '@x10/shared/test';

import { personas } from '../app.config';
import { defs, type Metric } from '../model';
import { seed } from '../seed';
import {
  approveMetric,
  createMetric,
  deprecateMetric,
  getMetricDetail,
  getMetricForEdit,
  listMetrics,
  requestChanges,
  reviewQueue,
  saveMetric,
  submitForReview,
} from './metrics';
import { DuplicateNameError, emptyInput, inputFromMetric, OWN_METRIC_REASON, StaleEditError } from './rules';
import { searchMetrics } from './search';

async function setup() {
  const store = await testStore(defs, { personas, fn: seed, now: FIXED_NOW });
  const people = await store.repo('Person').list();
  const bySub = (sub: string) => people.find((p) => p.sub === sub) as Person;
  return {
    store,
    steward: bySub('demo-steward'),
    stewardOwner: bySub('demo-steward-owner'),
    sam: bySub('demo-owner'),
    jordan: bySub('demo-owner-2'),
  };
}

const at = (minutes: number) => new Date(addMinutes(FIXED_NOW, minutes));
const byName = async (store: Awaited<ReturnType<typeof setup>>['store'], name: string) =>
  (await listMetrics(store)).find((m) => m.name === name) as Metric;

const input = {
  ...emptyInput,
  name: 'Average Order Value',
  domain: 'Sales',
  definition: 'Average value of a customer order in the period, after discounts.',
  formula: 'Revenue divided by number of orders in the period.',
  measureName: '[AOV]',
  synonyms: 'AOV, Basket size',
};

describe('seed', () => {
  it('covers every status and edge case the spec asks for', async () => {
    const { store } = await setup();
    const metrics = await listMetrics(store);
    expect(metrics).toHaveLength(20);
    const count = (s: string) => metrics.filter((m) => m.status === s).length;
    expect({ approved: count('approved'), in_review: count('in_review'), draft: count('draft'), deprecated: count('deprecated') }).toEqual({
      approved: 11,
      in_review: 3,
      draft: 4,
      deprecated: 2,
    });
    expect(new Set(metrics.map((m) => m.domain))).toEqual(new Set(['Finance', 'Sales', 'People', 'Operations']));
    expect(metrics.some((m) => m.measureName === null)).toBe(true);
    expect(metrics.some((m) => m.definition.length > 700)).toBe(true);
    // Morgan (steward) owns nothing; Priya (steward) owns a metric in review.
    expect(metrics.some((m) => m.ownerSub === 'demo-steward')).toBe(false);
    expect(metrics.some((m) => m.ownerSub === 'demo-steward-owner' && m.status === 'in_review')).toBe(true);
  });

  it('has one metric with 3 versions at the end of a replacement chain', async () => {
    const { store } = await setup();
    const churn = await byName(store, 'Customer Churn Rate');
    const detail = await getMetricDetail(store, churn.id);
    expect(detail.versions.map((v) => v.version)).toEqual(['1.2', '1.1', '1.0']);
    expect(detail.approval?.verified).toBe(true);
    expect(detail.replaces.map((m) => m.name)).toEqual(['Logo Churn Rate']);
    const monthly = await byName(store, 'Monthly Churn Count');
    const chain = (await getMetricDetail(store, monthly.id)).chain.map((m) => m.name);
    expect(chain).toEqual(['Logo Churn Rate', 'Customer Churn Rate']);
  });

  it('every approved metric has a verified steward approval', async () => {
    const { store } = await setup();
    for (const m of (await listMetrics(store)).filter((x) => x.status === 'approved')) {
      expect((await getMetricDetail(store, m.id)).approval?.verified, m.name).toBe(true);
    }
  });

  it('shows the approved-version banner on a re-review and the change request on a returned draft', async () => {
    const { store } = await setup();
    const gm = await getMetricDetail(store, (await byName(store, 'Gross Margin')).id);
    expect(gm.metric.version).toBe('1.1');
    expect(gm.approvedVersion?.version).toBe('1.0');
    const ac = await getMetricDetail(store, (await byName(store, 'Active Customers')).id);
    expect(ac.changeRequest?.comment).toMatch(/trial/);
  });
});

describe('AC1: unique names', () => {
  it('blocks a duplicate name in a different case and offers the existing metric', async () => {
    const { store, sam } = await setup();
    const revenue = await byName(store, 'Revenue');
    const attempt = createMetric(store, sam, { ...input, name: '  rEVENUE ' }, FIXED_NOW);
    await expect(attempt).rejects.toBeInstanceOf(DuplicateNameError);
    await expect(attempt).rejects.toMatchObject({ existing: { id: revenue.id, name: 'Revenue' } });
    expect(await listMetrics(store)).toHaveLength(20);
  });

  it('blocks renaming onto another metric but allows keeping your own name', async () => {
    const { store, sam } = await setup();
    const win = await byName(store, 'Win Rate');
    const rename = saveMetric(store, sam, win.id, { ...inputFromMetric(win), name: 'headcount' }, { loadedUpdatedAt: win.updatedAt });
    await expect(rename).rejects.toBeInstanceOf(DuplicateNameError);
    const same = await saveMetric(store, sam, win.id, { ...inputFromMetric(win), name: 'WIN RATE' }, { loadedUpdatedAt: win.updatedAt });
    expect(same.metric.name).toBe('WIN RATE');
  });
});

describe('AC2: draft, review, approve, edit, re-review', () => {
  it('produces the right version rows and status values', async () => {
    const { store, sam, steward, stewardOwner } = await setup();

    // Draft
    const created = await createMetric(store, sam, input, at(1));
    expect(created).toMatchObject({ status: 'draft', version: '1.0', ownerSub: sam.sub, approvedVersionId: null });
    let detail = await getMetricDetail(store, created.id);
    expect(detail.versions.map((v) => [v.version, v.changeNote])).toEqual([['1.0', 'Created']]);

    // Review
    const submitted = await submitForReview(store, sam, created.id, at(2));
    expect(submitted).toMatchObject({ status: 'in_review', submittedAt: at(2).toISOString() });
    expect((await reviewQueue(store, steward)).map((r) => r.metric.name)).toContain('Average Order Value');

    // Approve (a steward who is not the owner)
    const approved = await approveMetric(store, steward, created.id, 'Looks good', at(3));
    detail = await getMetricDetail(store, created.id);
    expect(approved.status).toBe('approved');
    expect(approved.approvedVersionId).toBe(detail.versions[0].id);
    expect(detail.approval).toMatchObject({ verified: true });
    expect(detail.reviews.map((r) => [r.decision, r.versionLabel])).toEqual([['approve', '1.0']]);

    // Edit content of the approved metric -> v1.1, back to review, approved version kept
    const edit = await saveMetric(
      store,
      sam,
      created.id,
      { ...input, definition: 'Average value of a customer order in the period, after discounts and returns.' },
      { loadedUpdatedAt: approved.updatedAt, changeNote: 'Net of returns' },
      at(4),
    );
    expect(edit.reopened).toBe(true);
    expect(edit.metric).toMatchObject({ status: 'in_review', version: '1.1', approvedVersionId: approved.approvedVersionId });
    detail = await getMetricDetail(store, created.id);
    expect(detail.versions.map((v) => [v.version, v.changeNote])).toEqual([
      ['1.1', 'Net of returns'],
      ['1.0', 'Created'],
    ]);
    expect(detail.approvedVersion?.version).toBe('1.0');

    // Re-review: request changes -> draft with the comment on top
    await requestChanges(store, stewardOwner, created.id, 'Say which returns window applies.', at(5));
    detail = await getMetricDetail(store, created.id);
    expect(detail.metric.status).toBe('draft');
    expect(detail.changeRequest?.comment).toBe('Say which returns window applies.');
    expect(detail.approvedVersion?.version).toBe('1.0');

    // Fix, resubmit, approve v1.1
    const fixed = await saveMetric(
      store,
      sam,
      created.id,
      { ...input, definition: 'Average value of a customer order in the period, after discounts and 30-day returns.' },
      { loadedUpdatedAt: detail.metric.updatedAt },
      at(6),
    );
    expect(fixed.metric).toMatchObject({ status: 'draft', version: '1.1' });
    await submitForReview(store, sam, created.id, at(7));
    const reapproved = await approveMetric(store, steward, created.id, null, at(8));
    detail = await getMetricDetail(store, created.id);
    expect(reapproved).toMatchObject({ status: 'approved', version: '1.1' });
    expect(reapproved.approvedVersionId).toBe(detail.versions[0].id);
    expect(detail.versions.map((v) => v.version)).toEqual(['1.1', '1.1', '1.0']);
    expect(detail.reviews.map((r) => `${r.decision}@${r.versionLabel}`)).toEqual(['approve@1.1', 'changes@1.1', 'approve@1.0']);
    expect(detail.approvedVersion).toBeNull();
    expect(detail.changeRequest).toBeNull();
  });

  it('does not create a version for metadata-only edits', async () => {
    const { store, sam } = await setup();
    const win = await byName(store, 'Win Rate');
    const res = await saveMetric(store, sam, win.id, { ...inputFromMetric(win), synonyms: 'Close rate' }, { loadedUpdatedAt: win.updatedAt });
    expect(res.version).toBeNull();
    expect(res.metric).toMatchObject({ status: 'approved', version: '1.0', synonyms: 'Close rate' });
  });
});

describe('review permissions', () => {
  it('only stewards review, never their own metric, and only metrics in review', async () => {
    const { store, sam, stewardOwner, steward } = await setup();
    const pipeline = await byName(store, 'Pipeline Coverage'); // owned by the steward-owner, in review
    await expect(approveMetric(store, stewardOwner, pipeline.id, null)).rejects.toThrow(OWN_METRIC_REASON);
    await expect(approveMetric(store, sam, pipeline.id, null)).rejects.toBeInstanceOf(PermissionError);
    const revenue = await byName(store, 'Revenue'); // approved
    await expect(approveMetric(store, steward, revenue.id, null)).rejects.toBeInstanceOf(RuleError);
    await expect(requestChanges(store, steward, pipeline.id, 'no')).rejects.toThrow(/at least 5/);
    const queue = await reviewQueue(store, stewardOwner);
    expect(queue.find((r) => r.metric.id === pipeline.id)?.own).toBe(true);
  });

  it('lists the review queue oldest submission first, with the approved label for re-reviews', async () => {
    const { store, steward } = await setup();
    const queue = await reviewQueue(store, steward);
    expect(queue.map((r) => r.metric.name)).toEqual(['Time to Hire', 'Pipeline Coverage', 'Gross Margin']);
    expect(queue.find((r) => r.metric.name === 'Gross Margin')?.approvedLabel).toBe('1.0');
  });

  it('only the owner edits, submits and deprecates', async () => {
    const { store, steward, jordan } = await setup();
    const enps = await byName(store, 'Employee Net Promoter Score');
    await expect(submitForReview(store, steward, enps.id)).rejects.toBeInstanceOf(PermissionError);
    await expect(
      saveMetric(store, steward, enps.id, inputFromMetric(enps), { loadedUpdatedAt: enps.updatedAt }),
    ).rejects.toBeInstanceOf(PermissionError);
    await expect(deprecateMetric(store, steward, enps.id, 'Not needed any more', null)).rejects.toBeInstanceOf(PermissionError);
    expect((await submitForReview(store, jordan, enps.id)).status).toBe('in_review');
  });
});

describe('stale edits', () => {
  it('warns when updatedAt changed since the form loaded, and the last save wins when forced', async () => {
    const { store, sam } = await setup();
    const win = await byName(store, 'Win Rate');
    const loaded = (await getMetricForEdit(store, win.id)).metric;
    // Another tab saves first.
    await saveMetric(store, sam, win.id, { ...inputFromMetric(win), synonyms: 'Close rate' }, { loadedUpdatedAt: loaded.updatedAt }, at(1));
    const mine = { ...inputFromMetric(loaded), synonyms: 'Hit rate' };
    const stale = saveMetric(store, sam, win.id, mine, { loadedUpdatedAt: loaded.updatedAt }, at(2));
    await expect(stale).rejects.toBeInstanceOf(StaleEditError);
    await expect(stale).rejects.toMatchObject({ current: { synonyms: 'Close rate' } });
    const forced = await saveMetric(store, sam, win.id, mine, { loadedUpdatedAt: loaded.updatedAt, force: true }, at(3));
    expect(forced.metric.synonyms).toBe('Hit rate');
  });
});

describe('deprecation', () => {
  it('requires a note, may name a replacement, and refuses loops', async () => {
    const { store, sam } = await setup();
    const fcr = await byName(store, 'First Contact Resolution');
    const otd = await byName(store, 'On-Time Delivery');
    await expect(deprecateMetric(store, sam, fcr.id, '', null)).rejects.toThrow(/required/);
    const done = await deprecateMetric(store, sam, fcr.id, 'Folded into a broader service metric.', otd.id, at(1));
    expect(done).toMatchObject({ status: 'deprecated', replacedById: otd.id, deprecationNote: 'Folded into a broader service metric.' });
    await expect(submitForReview(store, sam, fcr.id)).rejects.toThrow(/deprecated/);

    const churn = await byName(store, 'Customer Churn Rate');
    const monthly = await byName(store, 'Monthly Churn Count');
    await expect(deprecateMetric(store, sam, churn.id, 'Loop attempt here', monthly.id)).rejects.toThrow(/already replaced/);
  });
});

describe('AC3: search over the seed', () => {
  it('finds a metric by synonym, ranked below the exact name hit', async () => {
    const { store } = await setup();
    const hits = searchMetrics(await listMetrics(store), 'revenue');
    const names = hits.map((h) => h.metric.name);
    expect(names[0]).toBe('Revenue');
    const bookings = hits.findIndex((h) => h.metric.name === 'Bookings');
    expect(bookings).toBeGreaterThan(0);
    expect(hits[bookings]).toMatchObject({ field: 'synonym', matchedText: 'Contracted revenue' });
  });
});

describe('untrusted rows written through the API', () => {
  it('ignores forged reviews and versions', async () => {
    const { store, sam } = await setup();
    const enps = await byName(store, 'Employee Net Promoter Score');
    // A non-steward writes an approve review and flips status itself (possible through the API while owner).
    await store.repo('Review').create({
      metricId: enps.id,
      versionLabel: '1.0',
      reviewerSub: sam.sub,
      reviewerName: sam.displayName,
      decision: 'approve',
      comment: null,
      createdAt: FIXED_NOW.toISOString(),
    });
    await store.repo('MetricVersion').create({
      metricId: enps.id,
      version: '9.9',
      definition: 'Forged definition text',
      formula: 'Forged',
      measureName: null,
      changedBy: sam.displayName,
      changedBySub: sam.sub,
      changedAt: FIXED_NOW.toISOString(),
      changeNote: null,
    });
    await store.repo('Metric').update(enps.id, { status: 'approved' });
    const detail = await getMetricDetail(store, enps.id);
    expect(detail.approval).toMatchObject({ verified: false, review: null, reason: 'no_review' });
    expect(detail.versions.map((v) => v.version)).toEqual(['1.0']);
    expect(detail.ignoredRows).toBe(2);
  });

  it('flags an approved metric whose content was changed through the API without a new version', async () => {
    const { store } = await setup();
    const revenue = await byName(store, 'Revenue'); // approved v1.0
    expect((await getMetricDetail(store, revenue.id)).approval?.verified).toBe(true);
    // The owner (or anyone while in review) patches the definition directly, keeping status and version.
    await store.repo('Metric').update(revenue.id, { definition: 'Gross bookings, including tax and before returns.' });
    const detail = await getMetricDetail(store, revenue.id);
    expect(detail.approval).toMatchObject({ verified: false, reason: 'changed', changed: ['definition'] });
    expect(detail.approval?.review?.decision).toBe('approve');
  });

  it('flags an approval whose approvedVersionId points at a version from another label', async () => {
    const { store } = await setup();
    const churn = await byName(store, 'Customer Churn Rate'); // approved v1.2
    const detail = await getMetricDetail(store, churn.id);
    const v10 = detail.versions.find((v) => v.version === '1.0')!;
    await store.repo('Metric').update(churn.id, { approvedVersionId: v10.id });
    expect((await getMetricDetail(store, churn.id)).approval?.reason).toBe('no_version');
  });
});
