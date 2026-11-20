/**
 * Pure rules for Metric Dictionary: names, versions, status transitions, who may do what, replacement chains and
 * which stored rows the app trusts. Everything here is unit-tested; the async functions in metrics.ts use it.
 */
import { RuleError } from '@x10/shared/data';
import { checkText, commaList, normKey, type Errors } from '@x10/shared/lib';
import type { Tone } from '@x10/shared/ui';

import { rules } from '../config';
import { limits, type Metric, type MetricStatus, type MetricVersion, type Review } from '../model';

/* ------------------------------------------------------------------ errors */

/** A metric with the same name (ignoring case and spaces) exists. Carries it so the UI can offer to open it. */
export class DuplicateNameError extends RuleError {
  constructor(readonly existing: { id: string; name: string }) {
    super(`A metric called "${existing.name}" already exists. Names must be unique (case and spaces are ignored).`);
    this.name = 'DuplicateNameError';
  }
}

/** The metric changed since the form loaded it. Carries the fresh row so the UI can say when. */
export class StaleEditError extends Error {
  readonly category = 'conflict';
  constructor(readonly current: Metric) {
    super('This metric was changed after you opened the form.');
    this.name = 'StaleEditError';
  }
}

/* ------------------------------------------------------------------ status */

export const statusMeta: Record<MetricStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  in_review: { label: 'In review', tone: 'info' },
  approved: { label: 'Approved', tone: 'ok' },
  deprecated: { label: 'Deprecated', tone: 'warn' },
};

export type MetricAction = 'submit' | 'approve' | 'request_changes' | 'edit_content' | 'deprecate';

/** The status after an action, or a RuleError when the action is not allowed from this status. */
export function nextStatus(status: MetricStatus, action: MetricAction): MetricStatus {
  if (status === 'deprecated') throw new RuleError('This metric is deprecated and can no longer change.');
  switch (action) {
    case 'submit':
      if (status !== 'draft') throw new RuleError('Only a draft can be submitted for review.');
      return 'in_review';
    case 'approve':
      if (status !== 'in_review') throw new RuleError('Only a metric in review can be approved.');
      return 'approved';
    case 'request_changes':
      if (status !== 'in_review') throw new RuleError('Changes can only be requested on a metric in review.');
      return 'draft';
    case 'edit_content':
      // Editing an approved metric's definition, formula or measure sends it back for review.
      return status === 'approved' ? 'in_review' : status;
    case 'deprecate':
      return 'deprecated';
  }
}

/* ------------------------------------------------------------------ names and input */

export const nameKey = (name: string) => normKey(name);

/** The other metric with the same name ignoring case and surrounding (and repeated) spaces, if any. */
export function findDuplicateName<M extends Pick<Metric, 'id' | 'name'>>(metrics: M[], name: string, exceptId?: string | null): M | null {
  const key = nameKey(name);
  if (!key) return null;
  return metrics.find((m) => m.id !== exceptId && nameKey(m.name) === key) ?? null;
}

export interface MetricInput {
  name: string;
  domain: string;
  definition: string;
  formula: string;
  measureName: string;
  modelRef: string;
  synonyms: string;
}

export const emptyInput: MetricInput = {
  name: '',
  domain: '',
  definition: '',
  formula: '',
  measureName: '',
  modelRef: '',
  synonyms: '',
};

export function inputFromMetric(m: Metric): MetricInput {
  return {
    name: m.name,
    domain: m.domain,
    definition: m.definition,
    formula: m.formula,
    measureName: m.measureName ?? '',
    modelRef: m.modelRef ?? '',
    synonyms: m.synonyms ?? '',
  };
}

export type CleanInput = Pick<Metric, 'name' | 'domain' | 'definition' | 'formula' | 'measureName' | 'modelRef' | 'synonyms'>;

const orNull = (s: string) => {
  const v = s.trim();
  return v ? v : null;
};

/** Trim everything, collapse spaces in the name, tidy the synonym list, and turn blanks into null. */
export function cleanInput(input: MetricInput): CleanInput {
  const synonyms = commaList(input.synonyms).join(', ');
  return {
    name: input.name.trim().replace(/\s+/g, ' '),
    domain: input.domain.trim().replace(/\s+/g, ' '),
    definition: input.definition.trim(),
    formula: input.formula.trim(),
    measureName: orNull(input.measureName),
    modelRef: orNull(input.modelRef),
    synonyms: synonyms ? synonyms : null,
  };
}

export function validateMetricInput(input: MetricInput): Errors<MetricInput> {
  const out: Errors<MetricInput> = {};
  const set = (k: keyof MetricInput, msg: string | null) => {
    if (msg) out[k] = msg;
  };
  set('name', checkText(input.name, { ...limits.name, label: 'Name' }));
  set('domain', checkText(input.domain, { ...limits.domain, label: 'Domain' }));
  set('definition', checkText(input.definition, { ...limits.definition, label: 'Definition' }));
  set('formula', checkText(input.formula, { ...limits.formula, label: 'Formula' }));
  set('measureName', checkText(input.measureName, { ...limits.measureName, optional: true, label: 'Measure name' }));
  set('modelRef', checkText(input.modelRef, { ...limits.modelRef, optional: true, label: 'Semantic model' }));
  const syn = commaList(input.synonyms).join(', ');
  if (syn.length > limits.synonyms.max) out.synonyms = `Synonyms must be ${limits.synonyms.max} characters or fewer (now ${syn.length}).`;
  else if (commaList(input.synonyms).some((s) => nameKey(s) === nameKey(input.name) && s.trim()))
    out.synonyms = 'A synonym cannot repeat the metric name.';
  return out;
}

/* ------------------------------------------------------------------ versions */

/** Minor bump: 1.0 -> 1.1, 1.9 -> 1.10. Anything unparseable restarts at the first version's next minor. */
export function bumpMinor(version: string): string {
  const m = /^(\d+)\.(\d+)$/.exec(version.trim());
  if (!m) return '1.1';
  return `${Number(m[1])}.${Number(m[2]) + 1}`;
}

type Content = Pick<Metric, 'definition' | 'formula' | 'measureName'>;

export type ContentField = 'definition' | 'formula' | 'measure';

/** Which of definition, formula and measure differ (ignoring surrounding spaces; blank measure = none). */
export function changedContent(a: Content, b: Content): ContentField[] {
  const out: ContentField[] = [];
  if (a.definition.trim() !== b.definition.trim()) out.push('definition');
  if (a.formula.trim() !== b.formula.trim()) out.push('formula');
  if ((a.measureName ?? '').trim() !== (b.measureName ?? '').trim()) out.push('measure');
  return out;
}

const fieldWords: Record<ContentField, string> = { definition: 'definition', formula: 'formula', measure: 'measure' };

/** "Changed definition and formula" — the default note for a version row. */
export function describeChange(fields: ContentField[]): string {
  if (!fields.length) return 'No content change';
  const words = fields.map((f) => fieldWords[f]);
  const list = words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
  return `Changed ${list}`;
}

export interface SavePlan {
  patch: Partial<Metric>;
  /** A version row to append, or null when definition, formula and measure are unchanged. */
  version: Omit<MetricVersion, 'id' | 'metricId' | 'changedBy' | 'changedBySub'> | null;
  /** True when an approved metric went back to review because its content changed. */
  reopened: boolean;
  changed: ContentField[];
}

/**
 * Plan a save of `input` over the stored metric `current`:
 * - content (definition, formula, measure) changed on an approved metric: bump the minor version, back to in_review,
 *   keep approvedVersionId pointing at the approved version, append a version row;
 * - content changed otherwise: append a version row with the same version label, status unchanged;
 * - only name, domain, synonyms or model changed: no version row.
 */
export function planSave(current: Metric, input: CleanInput, nowIso: string, note?: string | null): SavePlan {
  if (current.status === 'deprecated') throw new RuleError('This metric is deprecated and can no longer be edited.');
  const changed = changedContent(current, input);
  const patch: Partial<Metric> = { ...input, updatedAt: nowIso };
  if (!changed.length) return { patch, version: null, reopened: false, changed };
  const reopened = current.status === 'approved';
  const version = reopened ? bumpMinor(current.version) : current.version;
  if (reopened) {
    patch.status = nextStatus(current.status, 'edit_content');
    patch.version = version;
    patch.submittedAt = nowIso;
  }
  return {
    patch,
    reopened,
    changed,
    version: {
      version,
      definition: input.definition,
      formula: input.formula,
      measureName: input.measureName,
      changedAt: nowIso,
      changeNote: note?.trim() ? note.trim() : describeChange(changed),
    },
  };
}

/* ------------------------------------------------------------------ permissions */

export interface Viewer {
  sub: string;
  isAdmin: boolean;
}

export interface Allowed {
  isOwner: boolean;
  canEdit: boolean;
  canSubmit: boolean;
  /** Steward approve / request changes. */
  canReview: boolean;
  /** Why a steward cannot review (shown next to a disabled button). */
  reviewBlockedReason: string | null;
  canDeprecate: boolean;
}

export const OWN_METRIC_REASON = 'You own this metric, so another steward has to review it.';

export function allowedActions(m: Pick<Metric, 'ownerSub' | 'status'>, v: Viewer): Allowed {
  const isOwner = m.ownerSub === v.sub;
  const live = m.status !== 'deprecated';
  const reviewable = v.isAdmin && m.status === 'in_review';
  return {
    isOwner,
    canEdit: isOwner && live,
    canSubmit: isOwner && m.status === 'draft',
    canReview: reviewable && !isOwner,
    reviewBlockedReason: reviewable && isOwner ? OWN_METRIC_REASON : null,
    canDeprecate: isOwner && live,
  };
}

/* ------------------------------------------------------------------ replacements */

/** Follow replacedById from a metric: [its replacement, that one's replacement, …]. Stops on a loop or a gap. */
export function replacementChain<M extends Pick<Metric, 'id' | 'replacedById'>>(metrics: M[], startId: string): M[] {
  const byId = new Map(metrics.map((m) => [m.id, m]));
  const seen = new Set([startId]);
  const out: M[] = [];
  let next = byId.get(startId)?.replacedById ?? null;
  while (next && !seen.has(next)) {
    const m = byId.get(next);
    if (!m) break;
    out.push(m);
    seen.add(next);
    next = m.replacedById;
  }
  return out;
}

/** Metrics whose replacedById points at this one. */
export function replacedBy<M extends Pick<Metric, 'id' | 'replacedById'>>(metrics: M[], id: string): M[] {
  return metrics.filter((m) => m.replacedById === id);
}

/** Check a proposed replacement; returns an error message or null. */
export function checkReplacement<M extends Pick<Metric, 'id' | 'replacedById' | 'name'>>(
  metrics: M[],
  metricId: string,
  replacementId: string | null,
): string | null {
  if (!replacementId) return null;
  if (replacementId === metricId) return 'A metric cannot replace itself.';
  const target = metrics.find((m) => m.id === replacementId);
  if (!target) return 'The replacement metric was not found.';
  if (replacementChain(metrics, replacementId).some((m) => m.id === metricId))
    return `"${target.name}" is already replaced by this metric; pick a different replacement.`;
  return null;
}

/* ------------------------------------------------------------------ trusted rows */

/**
 * Version rows the app trusts: rows for this metric written by its owner (only the owner edits a metric, and the
 * owner can never change). Rows anyone else inserted through the API are ignored.
 */
export function trustedVersions(m: Pick<Metric, 'id' | 'ownerSub'>, versions: MetricVersion[]): MetricVersion[] {
  return versions.filter((v) => v.metricId === m.id && v.changedBySub === m.ownerSub);
}

/** A review counts only when its writer is a steward (Person.isAdmin) who does not own the metric. */
export function isTrustedReview(r: Review, m: Pick<Metric, 'id' | 'ownerSub'>, stewardSubs: Set<string>): boolean {
  return r.metricId === m.id && stewardSubs.has(r.reviewerSub) && r.reviewerSub !== m.ownerSub;
}

export const newestFirst = <T extends { createdAt?: string; changedAt?: string }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => (b.createdAt ?? b.changedAt ?? '').localeCompare(a.createdAt ?? a.changedAt ?? ''));

export interface ApprovalCheck {
  verified: boolean;
  /** The steward's approve review for the current version label, if any. */
  review: Review | null;
  /**
   * Why it is not verified:
   * - no_review: no trusted steward approval for this version label;
   * - no_version: approvedVersionId does not point at a trusted version row with this label;
   * - changed: the stored definition, formula or measure differ from the approved version row (or from the newest
   *   owner-written row), i.e. the metric was changed after approval without going back to review.
   */
  reason: 'no_review' | 'no_version' | 'changed' | null;
  /** Which content fields differ from the approved version, for reason "changed". */
  changed: ContentField[];
}

/**
 * Verify an approved status against the append-only trail: a steward's approve review for the current version label,
 * the trusted version row approvedVersionId points at (same label), and the stored content matching both that row and
 * the newest owner-written row. Anything else is reported as unverified with a reason.
 */
export function approvalCheck(
  m: Pick<Metric, 'status' | 'version' | 'approvedVersionId' | 'definition' | 'formula' | 'measureName'>,
  trustedReviews: Review[],
  trusted: MetricVersion[],
): ApprovalCheck | null {
  if (m.status !== 'approved') return null;
  const review =
    newestFirst(trustedReviews).find((r) => r.decision === 'approve' && r.versionLabel === m.version) ?? null;
  if (!review) return { verified: false, review: null, reason: 'no_review', changed: [] };
  const approvedRow = trusted.find((v) => v.id === m.approvedVersionId && v.version === m.version) ?? null;
  if (!approvedRow) return { verified: false, review, reason: 'no_version', changed: [] };
  const latest = newestFirst(trusted)[0] ?? approvedRow;
  const changed = [...new Set([...changedContent(approvedRow, m), ...changedContent(latest, m)])];
  if (changed.length) return { verified: false, review, reason: 'changed', changed };
  return { verified: true, review, reason: null, changed: [] };
}

/** The change request to show on top of a draft: the newest trusted review, when it asked for changes. */
export function openChangeRequest(m: Pick<Metric, 'status' | 'version'>, trustedReviews: Review[]): Review | null {
  if (m.status !== 'draft') return null;
  const latest = newestFirst(trustedReviews)[0];
  return latest && latest.decision === 'changes' ? latest : null;
}

/** The newest trusted version row with the metric's current label (the one a steward approves). */
export function currentVersionRow(m: Pick<Metric, 'version'>, trusted: MetricVersion[]): MetricVersion | null {
  return newestFirst(trusted).find((v) => v.version === m.version) ?? null;
}

/** The approved version to show in a banner while a newer version is pending, or null. */
export function pendingApprovedVersion(m: Metric, trusted: MetricVersion[]): MetricVersion | null {
  if (!m.approvedVersionId || m.status === 'approved' || m.status === 'deprecated') return null;
  return trusted.find((v) => v.id === m.approvedVersionId) ?? null;
}

/* ------------------------------------------------------------------ browse helpers */

export function domainCounts(metrics: Pick<Metric, 'domain'>[]): { domain: string; count: number }[] {
  const map = new Map<string, { domain: string; count: number }>();
  for (const m of metrics) {
    const key = normKey(m.domain);
    const cur = map.get(key);
    if (cur) cur.count++;
    else map.set(key, { domain: m.domain.trim(), count: 1 });
  }
  return [...map.values()].sort((a, b) => a.domain.localeCompare(b.domain));
}

export function sameDomain(a: string, b: string): boolean {
  return normKey(a) === normKey(b);
}

/** First N characters of the definition for cards (full text on the metric page). */
export function cardDefinition(definition: string): string {
  const v = definition.trim().replace(/\s+/g, ' ');
  const n = rules.cardDefinitionChars;
  return v.length > n ? `${v.slice(0, n).trimEnd()}…` : v;
}
