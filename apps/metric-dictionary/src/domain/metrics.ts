/**
 * Data access for Metric Dictionary. Components call these; they never touch the store directly.
 * Every rule the row policies cannot express (stewards only, not your own metric, status transitions, unique names,
 * stale edits) is checked here, so it holds in demo mode and in Fabric.
 */
import { NotFoundError, PermissionError, RuleError, type DataStore } from '@x10/shared/data';
import type { Person } from '@x10/shared/identity';
import { checkText } from '@x10/shared/lib';

import { rules } from '../config';
import { limits, type Metric, type MetricVersion, type Review, type Schema } from '../model';
import {
  allowedActions,
  approvalCheck,
  checkReplacement,
  cleanInput,
  currentVersionRow,
  DuplicateNameError,
  findDuplicateName,
  isTrustedReview,
  newestFirst,
  nextStatus,
  OWN_METRIC_REASON,
  openChangeRequest,
  pendingApprovedVersion,
  planSave,
  replacedBy,
  replacementChain,
  StaleEditError,
  trustedVersions,
  validateMetricInput,
  type ApprovalCheck,
  type MetricInput,
} from './rules';

type Store = DataStore<Schema>;
type Me = Pick<Person, 'sub' | 'displayName' | 'isAdmin'>;

const iso = (now: Date) => now.toISOString();

/* ------------------------------------------------------------------ reads */

export async function listMetrics(store: Store): Promise<Metric[]> {
  return store.repo('Metric').list({ orderBy: { field: 'name', dir: 'asc' } });
}

/** Subs of stewards (Person.isAdmin). Clients cannot set isAdmin, so this is a trustworthy list. */
export async function stewardSubs(store: Store): Promise<Set<string>> {
  const people = await store.repo('Person').list();
  return new Set(people.filter((p) => p.isAdmin === true).map((p) => p.sub));
}

export interface MetricDetail {
  metric: Metric;
  /** Trusted version rows, newest first. */
  versions: MetricVersion[];
  /** Trusted reviews, newest first. */
  reviews: Review[];
  /** Rows stored for this metric that failed the trust checks (written through the API by someone else). */
  ignoredRows: number;
  /** Where a deprecated metric points: [replacement, its replacement, …]. */
  chain: Metric[];
  /** Metrics this one replaces. */
  replaces: Metric[];
  /** "v1.0 is the approved version" while a newer version is pending. */
  approvedVersion: MetricVersion | null;
  /** Steward comment shown on top of a draft sent back for changes. */
  changeRequest: Review | null;
  /** For approved metrics: whether the approval is backed by a steward review and unchanged content. */
  approval: ApprovalCheck | null;
  all: Metric[];
}

export async function getMetricDetail(store: Store, id: string): Promise<MetricDetail> {
  const [all, versionRows, reviewRows, stewards] = await Promise.all([
    listMetrics(store),
    store.repo('MetricVersion').list({ where: { metricId: id } }),
    store.repo('Review').list({ where: { metricId: id } }),
    stewardSubs(store),
  ]);
  const metric = all.find((m) => m.id === id);
  if (!metric) throw new NotFoundError('Metric', id);
  const versions = newestFirst(trustedVersions(metric, versionRows));
  const reviews = newestFirst(reviewRows.filter((r) => isTrustedReview(r, metric, stewards)));
  return {
    metric,
    versions,
    reviews,
    ignoredRows: versionRows.length - versions.length + reviewRows.length - reviews.length,
    chain: replacementChain(all, id),
    replaces: replacedBy(all, id),
    approvedVersion: pendingApprovedVersion(metric, versions),
    changeRequest: openChangeRequest(metric, reviews),
    approval: approvalCheck(metric, reviews, versions),
    all,
  };
}

/** Load a metric for the editor, with the approved version (for the "Changes since approved" panel). */
export async function getMetricForEdit(
  store: Store,
  id: string,
): Promise<{ metric: Metric; approved: MetricVersion | null; latest: MetricVersion | null; all: Metric[] }> {
  const [all, versionRows] = await Promise.all([listMetrics(store), store.repo('MetricVersion').list({ where: { metricId: id } })]);
  const metric = all.find((m) => m.id === id);
  if (!metric) throw new NotFoundError('Metric', id);
  const trusted = trustedVersions(metric, versionRows);
  const approved = metric.approvedVersionId ? (trusted.find((v) => v.id === metric.approvedVersionId) ?? null) : null;
  return { metric, approved, latest: newestFirst(trusted)[0] ?? null, all };
}

export interface QueueRow {
  metric: Metric;
  /** True when the viewer owns it (cannot review their own). */
  own: boolean;
  /** Version pending, with the approved one if this is a re-review. */
  approvedLabel: string | null;
}

/** Metrics in review, oldest submission first. */
export async function reviewQueue(store: Store, me: Me): Promise<QueueRow[]> {
  const [metrics, versions] = await Promise.all([listMetrics(store), store.repo('MetricVersion').list()]);
  const byId = new Map(versions.map((v) => [v.id, v]));
  return metrics
    .filter((m) => m.status === 'in_review')
    .sort((a, b) => (a.submittedAt ?? a.updatedAt).localeCompare(b.submittedAt ?? b.updatedAt))
    .map((m) => {
      const approved = m.approvedVersionId ? byId.get(m.approvedVersionId) : undefined;
      return {
        metric: m,
        own: m.ownerSub === me.sub,
        approvedLabel: approved && approved.metricId === m.id && approved.changedBySub === m.ownerSub ? approved.version : null,
      };
    });
}

/* ------------------------------------------------------------------ writes */

async function freshMetric(store: Store, id: string): Promise<Metric> {
  const m = await store.repo('Metric').get(id);
  if (!m) throw new NotFoundError('Metric', id);
  return m;
}

function checkInput(input: MetricInput) {
  const errors = validateMetricInput(input);
  const first = Object.values(errors).find(Boolean);
  if (first) throw new RuleError(first);
}

async function checkUniqueName(store: Store, name: string, exceptId: string | null) {
  const dup = findDuplicateName(await listMetrics(store), name, exceptId);
  if (dup) throw new DuplicateNameError({ id: dup.id, name: dup.name });
}

/** Create a draft metric at version 1.0 owned by the viewer, with its first version row. */
export async function createMetric(store: Store, me: Me, input: MetricInput, now = new Date()): Promise<Metric> {
  checkInput(input);
  const clean = cleanInput(input);
  await checkUniqueName(store, clean.name, null);
  const at = iso(now);
  const metric = await store.repo('Metric').create({
    ...clean,
    ownerName: me.displayName,
    ownerSub: me.sub,
    status: 'draft',
    version: rules.firstVersion,
    replacedById: null,
    approvedVersionId: null,
    deprecationNote: null,
    submittedAt: null,
    createdAt: at,
    updatedAt: at,
  });
  await store.repo('MetricVersion').create({
    metricId: metric.id,
    version: metric.version,
    definition: clean.definition,
    formula: clean.formula,
    measureName: clean.measureName,
    changedBy: me.displayName,
    changedBySub: me.sub,
    changedAt: at,
    changeNote: 'Created',
  });
  return metric;
}

export interface SaveOptions {
  /** updatedAt of the row when the form loaded it. */
  loadedUpdatedAt: string;
  /** Save even though someone changed the metric since the form loaded (last save wins). */
  force?: boolean;
  changeNote?: string | null;
}

export interface SaveResult {
  metric: Metric;
  version: MetricVersion | null;
  reopened: boolean;
}

/**
 * Save the owner's edits. Re-reads the metric first: if updatedAt moved since the form loaded, throws StaleEditError
 * unless `force`. Content changes append a version row; on an approved metric they bump the minor version and send
 * it back to review while approvedVersionId keeps pointing at the approved version.
 */
export async function saveMetric(
  store: Store,
  me: Me,
  id: string,
  input: MetricInput,
  opts: SaveOptions,
  now = new Date(),
): Promise<SaveResult> {
  const current = await freshMetric(store, id);
  if (current.ownerSub !== me.sub) throw new PermissionError(`Only the owner (${current.ownerName}) can edit this metric.`);
  if (!opts.force && current.updatedAt !== opts.loadedUpdatedAt) throw new StaleEditError(current);
  checkInput(input);
  const changeNoteError = checkText(opts.changeNote, { ...limits.changeNote, optional: true, label: 'Change note' });
  if (changeNoteError) throw new RuleError(changeNoteError);
  const clean = cleanInput(input);
  await checkUniqueName(store, clean.name, id);
  const at = iso(now);
  const plan = planSave(current, clean, at, opts.changeNote);
  let version: MetricVersion | null = null;
  if (plan.version) {
    version = await store.repo('MetricVersion').create({
      ...plan.version,
      metricId: id,
      changedBy: me.displayName,
      changedBySub: me.sub,
    });
  }
  const metric = await store.repo('Metric').update(id, plan.patch);
  return { metric, version, reopened: plan.reopened };
}

export async function submitForReview(store: Store, me: Me, id: string, now = new Date()): Promise<Metric> {
  const m = await freshMetric(store, id);
  if (m.ownerSub !== me.sub) throw new PermissionError('Only the owner can submit this metric for review.');
  const status = nextStatus(m.status, 'submit');
  const at = iso(now);
  return store.repo('Metric').update(id, { status, submittedAt: at, updatedAt: at });
}

function checkSteward(me: Me, m: Metric) {
  if (me.isAdmin !== true) throw new PermissionError('Only stewards can review metrics.');
  if (m.ownerSub === me.sub) throw new PermissionError(OWN_METRIC_REASON);
}

/** Steward approval: status approved, approvedVersionId = the version row being approved, plus a Review row. */
export async function approveMetric(store: Store, me: Me, id: string, comment: string | null, now = new Date()): Promise<Metric> {
  const m = await freshMetric(store, id);
  checkSteward(me, m);
  const status = nextStatus(m.status, 'approve');
  const note = comment?.trim() || null;
  const err = checkText(note, { ...limits.reviewComment, optional: true, label: 'Comment' });
  if (err) throw new RuleError(err);
  const versions = trustedVersions(m, await store.repo('MetricVersion').list({ where: { metricId: id } }));
  const row = currentVersionRow(m, versions);
  const at = iso(now);
  const updated = await store.repo('Metric').update(id, {
    status,
    approvedVersionId: row?.id ?? m.approvedVersionId,
    updatedAt: at,
  });
  await store.repo('Review').create({
    metricId: id,
    versionLabel: m.version,
    reviewerSub: me.sub,
    reviewerName: me.displayName,
    decision: 'approve',
    comment: note,
    createdAt: at,
  });
  return updated;
}

/** Steward sends the metric back to draft; the comment is required and shown on top of the metric. */
export async function requestChanges(store: Store, me: Me, id: string, comment: string, now = new Date()): Promise<Metric> {
  const m = await freshMetric(store, id);
  checkSteward(me, m);
  const status = nextStatus(m.status, 'request_changes');
  const err = checkText(comment, { min: 5, max: limits.reviewComment.max, label: 'Comment' });
  if (err) throw new RuleError(err);
  const at = iso(now);
  const updated = await store.repo('Metric').update(id, { status, updatedAt: at });
  await store.repo('Review').create({
    metricId: id,
    versionLabel: m.version,
    reviewerSub: me.sub,
    reviewerName: me.displayName,
    decision: 'changes',
    comment: comment.trim(),
    createdAt: at,
  });
  return updated;
}

/** Owner deprecates with a required note and an optional replacement. */
export async function deprecateMetric(
  store: Store,
  me: Me,
  id: string,
  note: string,
  replacementId: string | null,
  now = new Date(),
): Promise<Metric> {
  const m = await freshMetric(store, id);
  if (m.ownerSub !== me.sub) throw new PermissionError('Only the owner can deprecate this metric.');
  const status = nextStatus(m.status, 'deprecate');
  const err = checkText(note, { ...limits.deprecationNote, label: 'Deprecation note' });
  if (err) throw new RuleError(err);
  const replacementError = checkReplacement(await listMetrics(store), id, replacementId);
  if (replacementError) throw new RuleError(replacementError);
  return store.repo('Metric').update(id, {
    status,
    deprecationNote: note.trim(),
    replacedById: replacementId,
    updatedAt: iso(now),
  });
}

export { allowedActions };
