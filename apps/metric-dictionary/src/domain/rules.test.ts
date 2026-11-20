import { RuleError } from '@x10/shared/data';

import type { Metric, MetricVersion, Review } from '../model';
import {
  allowedActions,
  approvalCheck,
  bumpMinor,
  cardDefinition,
  changedContent,
  checkReplacement,
  cleanInput,
  describeChange,
  domainCounts,
  emptyInput,
  findDuplicateName,
  isTrustedReview,
  nextStatus,
  openChangeRequest,
  pendingApprovedVersion,
  planSave,
  replacementChain,
  trustedVersions,
  validateMetricInput,
  OWN_METRIC_REASON,
} from './rules';

const NOW = '2026-11-20T09:00:00.000Z';

const metric = (over: Partial<Metric> = {}): Metric => ({
  id: 'm1',
  name: 'Revenue',
  domain: 'Finance',
  definition: 'Net value of goods sold.',
  formula: 'Sum of invoice lines',
  measureName: '[Total Revenue]',
  modelRef: null,
  synonyms: null,
  ownerName: 'Owner',
  ownerSub: 'owner',
  status: 'draft',
  version: '1.0',
  replacedById: null,
  approvedVersionId: null,
  deprecationNote: null,
  submittedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

const version = (over: Partial<MetricVersion> = {}): MetricVersion => ({
  id: 'v1',
  metricId: 'm1',
  version: '1.0',
  definition: 'Net value of goods sold.',
  formula: 'Sum of invoice lines',
  measureName: null,
  changedBy: 'Owner',
  changedBySub: 'owner',
  changedAt: NOW,
  changeNote: 'Created',
  ...over,
});

const review = (over: Partial<Review> = {}): Review => ({
  id: 'r1',
  metricId: 'm1',
  versionLabel: '1.0',
  reviewerSub: 'steward',
  reviewerName: 'Steward',
  decision: 'approve',
  comment: null,
  createdAt: NOW,
  ...over,
});

describe('names', () => {
  it('finds duplicates ignoring case and surrounding or repeated spaces', () => {
    const list = [metric({ id: 'a', name: 'Gross Margin' }), metric({ id: 'b', name: 'Revenue' })];
    expect(findDuplicateName(list, '  gross   MARGIN ')?.id).toBe('a');
    expect(findDuplicateName(list, 'Gross Margin %')).toBeNull();
    expect(findDuplicateName(list, 'gross margin', 'a')).toBeNull();
    expect(findDuplicateName(list, '   ')).toBeNull();
  });
});

describe('input', () => {
  it('cleans names, synonyms and blanks', () => {
    expect(
      cleanInput({ ...emptyInput, name: '  Gross   Margin ', domain: ' Finance ', definition: ' d ', formula: ' f ', synonyms: ' GM, ,  GM% ' }),
    ).toEqual({
      name: 'Gross Margin',
      domain: 'Finance',
      definition: 'd',
      formula: 'f',
      measureName: null,
      modelRef: null,
      synonyms: 'GM, GM%',
    });
  });

  it('validates with the entity limits', () => {
    const errors = validateMetricInput({ ...emptyInput, name: 'ab', definition: 'short', formula: 'x'.repeat(1001), synonyms: 'ab' });
    expect(errors.name).toMatch(/at least 3/);
    expect(errors.domain).toMatch(/required/);
    expect(errors.definition).toMatch(/at least 10/);
    expect(errors.formula).toMatch(/1000 characters or fewer/);
    expect(errors.synonyms).toMatch(/repeat the metric name/);
    expect(errors.measureName).toBeUndefined();
    const ok = validateMetricInput({
      ...emptyInput,
      name: 'Revenue',
      domain: 'Finance',
      definition: 'Net value of goods sold.',
      formula: 'Sum of lines',
    });
    expect(ok).toEqual({});
  });
});

describe('versions', () => {
  it('bumps the minor version', () => {
    expect(bumpMinor('1.0')).toBe('1.1');
    expect(bumpMinor('1.9')).toBe('1.10');
    expect(bumpMinor('2.3')).toBe('2.4');
    expect(bumpMinor('draft')).toBe('1.1');
  });

  it('detects content changes, ignoring spaces and blank measures', () => {
    const a = { definition: 'A', formula: 'B', measureName: null };
    expect(changedContent(a, { definition: ' A ', formula: 'B', measureName: '' })).toEqual([]);
    expect(changedContent(a, { definition: 'A2', formula: 'B2', measureName: '[M]' })).toEqual(['definition', 'formula', 'measure']);
    expect(describeChange(['definition', 'formula', 'measure'])).toBe('Changed definition, formula and measure');
    expect(describeChange(['formula'])).toBe('Changed formula');
  });

  const clean = (over: Partial<Metric> = {}) => {
    const m = metric(over);
    return {
      name: m.name,
      domain: m.domain,
      definition: m.definition,
      formula: m.formula,
      measureName: m.measureName,
      modelRef: m.modelRef,
      synonyms: m.synonyms,
    };
  };

  it('edits of an approved metric bump the version and reopen review, keeping the approved pointer', () => {
    const current = metric({ status: 'approved', approvedVersionId: 'v1' });
    const plan = planSave(current, clean({ definition: 'Net value of goods and services sold.' }), NOW);
    expect(plan.reopened).toBe(true);
    expect(plan.patch).toMatchObject({ status: 'in_review', version: '1.1', submittedAt: NOW, updatedAt: NOW });
    expect(plan.patch.approvedVersionId).toBeUndefined(); // unchanged: still points at v1.0
    expect(plan.version).toMatchObject({ version: '1.1', changeNote: 'Changed definition' });
  });

  it('content edits of a draft add a version row with the same label', () => {
    const plan = planSave(metric({ status: 'draft' }), clean({ formula: 'Sum of invoice lines minus credits' }), NOW, 'Credits');
    expect(plan.reopened).toBe(false);
    expect(plan.patch.status).toBeUndefined();
    expect(plan.version).toMatchObject({ version: '1.0', changeNote: 'Credits' });
  });

  it('metadata-only edits add no version row and keep the status', () => {
    const plan = planSave(metric({ status: 'approved' }), clean({ name: 'Net Revenue', synonyms: 'Sales' }), NOW);
    expect(plan.version).toBeNull();
    expect(plan.patch).toMatchObject({ name: 'Net Revenue', synonyms: 'Sales' });
    expect(plan.patch.status).toBeUndefined();
  });

  it('refuses edits of a deprecated metric', () => {
    expect(() => planSave(metric({ status: 'deprecated' }), clean(), NOW)).toThrow(RuleError);
  });
});

describe('status transitions', () => {
  it('follows draft -> in_review -> approved / draft', () => {
    expect(nextStatus('draft', 'submit')).toBe('in_review');
    expect(nextStatus('in_review', 'approve')).toBe('approved');
    expect(nextStatus('in_review', 'request_changes')).toBe('draft');
    expect(nextStatus('approved', 'edit_content')).toBe('in_review');
    expect(nextStatus('draft', 'edit_content')).toBe('draft');
    expect(nextStatus('approved', 'deprecate')).toBe('deprecated');
  });
  it('refuses invalid transitions', () => {
    expect(() => nextStatus('approved', 'submit')).toThrow(/Only a draft/);
    expect(() => nextStatus('draft', 'approve')).toThrow(/in review/);
    expect(() => nextStatus('approved', 'request_changes')).toThrow(/in review/);
    expect(() => nextStatus('deprecated', 'deprecate')).toThrow(/deprecated/);
  });
});

describe('allowedActions', () => {
  it('lets owners edit, submit and deprecate', () => {
    expect(allowedActions(metric({ status: 'draft' }), { sub: 'owner', isAdmin: false })).toEqual({
      isOwner: true,
      canEdit: true,
      canSubmit: true,
      canReview: false,
      reviewBlockedReason: null,
      canDeprecate: true,
    });
  });
  it('lets a steward who is not the owner review', () => {
    const a = allowedActions(metric({ status: 'in_review' }), { sub: 'steward', isAdmin: true });
    expect(a).toMatchObject({ canReview: true, canEdit: false, reviewBlockedReason: null });
  });
  it('blocks a steward from reviewing their own metric, with a reason', () => {
    const a = allowedActions(metric({ status: 'in_review' }), { sub: 'owner', isAdmin: true });
    expect(a).toMatchObject({ canReview: false, reviewBlockedReason: OWN_METRIC_REASON, canEdit: true });
  });
  it('gives readers nothing and freezes deprecated metrics', () => {
    expect(allowedActions(metric({ status: 'in_review' }), { sub: 'reader', isAdmin: false })).toMatchObject({
      canEdit: false,
      canReview: false,
      canSubmit: false,
      canDeprecate: false,
    });
    expect(allowedActions(metric({ status: 'deprecated' }), { sub: 'owner', isAdmin: false })).toMatchObject({
      canEdit: false,
      canDeprecate: false,
    });
  });
});

describe('replacements', () => {
  const list = [
    metric({ id: 'a', name: 'A', replacedById: 'b' }),
    metric({ id: 'b', name: 'B', replacedById: 'c' }),
    metric({ id: 'c', name: 'C' }),
    metric({ id: 'd', name: 'D' }),
  ];
  it('follows the chain', () => {
    expect(replacementChain(list, 'a').map((m) => m.id)).toEqual(['b', 'c']);
    expect(replacementChain(list, 'c')).toEqual([]);
  });
  it('stops on loops and gaps', () => {
    const loop = [metric({ id: 'x', replacedById: 'y' }), metric({ id: 'y', replacedById: 'x' })];
    expect(replacementChain(loop, 'x').map((m) => m.id)).toEqual(['y']);
    expect(replacementChain([metric({ id: 'x', replacedById: 'gone' })], 'x')).toEqual([]);
  });
  it('rejects self, missing and circular replacements', () => {
    expect(checkReplacement(list, 'd', null)).toBeNull();
    expect(checkReplacement(list, 'd', 'c')).toBeNull();
    expect(checkReplacement(list, 'c', 'c')).toMatch(/itself/);
    expect(checkReplacement(list, 'c', 'zz')).toMatch(/not found/);
    expect(checkReplacement(list, 'c', 'a')).toMatch(/already replaced by this metric/);
  });
});

describe('trusted rows', () => {
  const stewards = new Set(['steward', 'owner-steward']);
  it('keeps version rows written by the owner of this metric', () => {
    const rows = [version(), version({ id: 'v2', changedBySub: 'intruder' }), version({ id: 'v3', metricId: 'other' })];
    expect(trustedVersions(metric(), rows).map((v) => v.id)).toEqual(['v1']);
  });
  it('trusts reviews only from stewards who do not own the metric', () => {
    expect(isTrustedReview(review(), metric(), stewards)).toBe(true);
    expect(isTrustedReview(review({ reviewerSub: 'someone' }), metric(), stewards)).toBe(false);
    expect(isTrustedReview(review({ reviewerSub: 'owner-steward' }), metric({ ownerSub: 'owner-steward' }), stewards)).toBe(false);
  });
  describe('approvalCheck', () => {
    const approved = (over: Partial<Metric> = {}) => metric({ status: 'approved', approvedVersionId: 'v1', ...over });
    const v1 = version(); // same content as metric(), label 1.0

    it('is null unless the status is approved', () => {
      expect(approvalCheck(metric({ status: 'draft' }), [], [])).toBeNull();
    });
    it('verifies a steward approval of the current label whose content matches the approved row', () => {
      expect(approvalCheck(approved({ measureName: null }), [review()], [v1])).toEqual({
        verified: true,
        review: review(),
        reason: null,
        changed: [],
      });
    });
    it('reports no_review when no approve review exists for the current label', () => {
      expect(approvalCheck(approved({ version: '1.1', measureName: null }), [review()], [v1])).toMatchObject({
        verified: false,
        reason: 'no_review',
      });
      expect(approvalCheck(approved({ measureName: null }), [review({ decision: 'changes' })], [v1])?.reason).toBe('no_review');
    });
    it('reports no_version when approvedVersionId is missing or points at another label', () => {
      expect(approvalCheck(approved({ approvedVersionId: null, measureName: null }), [review()], [v1])?.reason).toBe('no_version');
      expect(approvalCheck(approved({ approvedVersionId: 'forged', measureName: null }), [review()], [v1])?.reason).toBe('no_version');
      const v11 = version({ id: 'v2', version: '1.1' });
      expect(approvalCheck(approved({ approvedVersionId: 'v2', measureName: null }), [review()], [v1, v11])?.reason).toBe('no_version');
    });
    it('reports changed when content was edited after approval without a new version', () => {
      const res = approvalCheck(approved({ definition: 'Quietly rewritten definition.', measureName: '[Other]' }), [review()], [v1]);
      expect(res).toMatchObject({ verified: false, reason: 'changed', changed: ['definition', 'measure'] });
    });
    it('reports changed when the newest owner-written row differs from the stored content', () => {
      const later = version({ id: 'v9', formula: 'Different formula', changedAt: '2026-11-21T00:00:00.000Z' });
      const res = approvalCheck(approved({ measureName: null }), [review()], [v1, later]);
      expect(res).toMatchObject({ verified: false, reason: 'changed', changed: ['formula'] });
    });
    it('ignores metadata-only differences', () => {
      expect(approvalCheck(approved({ name: 'Renamed', synonyms: 'X', measureName: null }), [review()], [v1])?.verified).toBe(true);
    });
  });
  it('shows the newest change request on a draft only', () => {
    const changes = review({ id: 'r2', decision: 'changes', comment: 'Fix it', createdAt: '2026-11-21T00:00:00Z' });
    expect(openChangeRequest(metric({ status: 'draft' }), [review(), changes])?.id).toBe('r2');
    expect(openChangeRequest(metric({ status: 'in_review' }), [changes])).toBeNull();
    expect(openChangeRequest(metric({ status: 'draft' }), [review({ createdAt: '2026-11-22T00:00:00Z' }), changes])).toBeNull();
  });
  it('shows the approved version while a newer one is pending', () => {
    const v = version();
    expect(pendingApprovedVersion(metric({ status: 'in_review', version: '1.1', approvedVersionId: 'v1' }), [v])?.version).toBe('1.0');
    expect(pendingApprovedVersion(metric({ status: 'approved', approvedVersionId: 'v1' }), [v])).toBeNull();
    expect(pendingApprovedVersion(metric({ status: 'in_review', approvedVersionId: 'forged' }), [v])).toBeNull();
  });
});

describe('browse helpers', () => {
  it('counts domains case-insensitively', () => {
    const list = [metric({ domain: 'Finance' }), metric({ domain: 'finance ' }), metric({ domain: 'People' })];
    expect(domainCounts(list)).toEqual([
      { domain: 'Finance', count: 2 },
      { domain: 'People', count: 1 },
    ]);
  });
  it('truncates definitions to 140 characters on cards', () => {
    const long = 'word '.repeat(60);
    const out = cardDefinition(long);
    expect(out.length).toBeLessThanOrEqual(141);
    expect(out.endsWith('…')).toBe(true);
    expect(cardDefinition('Short one.')).toBe('Short one.');
  });
});
