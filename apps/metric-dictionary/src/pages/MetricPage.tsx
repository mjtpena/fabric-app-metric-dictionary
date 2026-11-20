/**
 * The element card: one metric drawn as an enlarged element (number, symbol, version as its mass), its term in the
 * editorial serif, the definition, formula and measure, its isotopes (versions) with tracked changes, and the
 * review trail. Every workflow action (edit, submit, approve, request changes, deprecate) starts here.
 */
import { useEffect, useId, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, BadgeCheck, CornerDownRight, PenLine, Send } from 'lucide-react';

import { useApp } from '@x10/shared/runtime';
import { commaList, describeError, formatDate, formatDateTime, formatRelative, useAction, useAsync, type AppErrorInfo } from '@x10/shared/lib';
import {
  Avatar,
  Breadcrumb,
  Button,
  ConfirmDialog,
  CopyButton,
  cx,
  DataState,
  Dialog,
  Field,
  InlineError,
  Select,
  Skeleton,
  Tag,
  TextArea,
  Toast,
} from '@x10/shared/ui';

import { Caption, FormulaPanel, Meta, Notice } from '../components/bits';
import { FINISH, makePalette, StaticTile, StatusMark, SymbolChip } from '../components/element';
import { DiffLegend, ValueChange, WordDiff } from '../components/WordDiff';
import { STATUS_HUE, toElements, type Element } from '../domain/elements';
import { NOT_IMPLEMENTED } from '../domain/export';
import {
  approveMetric,
  deprecateMetric,
  getMetricDetail,
  requestChanges,
  submitForReview,
  type MetricDetail,
} from '../domain/metrics';
import { allowedActions, checkReplacement } from '../domain/rules';
import { limits, type Metric, type MetricVersion, type Schema } from '../model';

export function MetricPage() {
  const { id = '' } = useParams();
  const { store } = useApp<Schema>();
  const state = useAsync(() => getMetricDetail(store, id), [store, id]);
  const location = useLocation();
  const navigate = useNavigate();
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    const flash = (location.state as { flash?: string } | null)?.flash;
    if (flash) {
      setToast(flash);
      // Clear the one-off message so a reload or back navigation does not show it again.
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  return (
    <>
      <DataState state={state} skeleton={<CardSkeleton />}>
        {(d) => <ElementCard detail={d} reload={state.reload} onToast={setToast} />}
      </DataState>
      <Toast message={toast} onDone={() => setToast(null)} tone="ok" />
    </>
  );
}

function CardSkeleton() {
  return (
    <div>
      <Skeleton width={180} height={14} />
      <div className="mt-5 flex items-end gap-6">
        <Skeleton width={168} height={168} className="rounded-[14px] max-md:size-[112px]!" />
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton width={140} height={12} />
          <Skeleton width="70%" height={44} />
          <Skeleton width={260} height={14} />
        </div>
      </div>
      <div className="mt-10 space-y-3">
        <Skeleton width="100%" height={16} />
        <Skeleton width="92%" height={16} />
        <Skeleton width="60%" height={16} />
      </div>
    </div>
  );
}

type DialogKind = 'approve' | 'changes' | 'deprecate' | null;

function ElementCard({ detail, reload, onToast }: { detail: MetricDetail; reload: () => Promise<void>; onToast: (m: string) => void }) {
  const app = useApp<Schema>();
  const navigate = useNavigate();
  const { metric: m } = detail;
  const can = allowedActions(m, { sub: app.me.sub, isAdmin: app.isAdmin });
  const [dialog, setDialog] = useState<DialogKind>(null);
  const deprecated = m.status === 'deprecated';
  const elements = useMemo(() => toElements(detail.all), [detail.all]);
  const palette = useMemo(() => makePalette(elements), [elements]);
  const byId = useMemo(() => new Map(elements.map((e) => [e.metric.id, e])), [elements]);
  const el = byId.get(m.id)!;
  const groupHue = palette.groups.get(el.group)?.hue ?? 'gray';
  const submit = useAction(async () => {
    await submitForReview(app.store, app.me, m.id);
    await reload();
    onToast(`${m.name} v${m.version} sent to the stewards for review.`);
  });

  const hasActions = can.canEdit || can.canSubmit || can.canReview || !!can.reviewBlockedReason || can.canDeprecate;
  const actions = (
    <>
      {can.canReview && (
        <>
          <Button variant="primary" icon={<BadgeCheck aria-hidden="true" />} onClick={() => setDialog('approve')}>
            Approve v{m.version}
          </Button>
          <Button onClick={() => setDialog('changes')}>Request changes</Button>
        </>
      )}
      {can.reviewBlockedReason && (
        <Button variant="primary" disabled aria-describedby="own-metric-note">
          Approve v{m.version}
        </Button>
      )}
      {can.canSubmit && (
        <Button variant="primary" icon={<Send aria-hidden="true" />} busy={submit.pending} onClick={() => void submit.run()}>
          Submit for review
        </Button>
      )}
      {can.canEdit && (
        <Button variant={can.canSubmit || can.canReview ? 'secondary' : 'primary'} icon={<PenLine aria-hidden="true" />} onClick={() => navigate(`/metrics/${m.id}/edit`)}>
          Edit
        </Button>
      )}
      {can.canDeprecate && (
        <Button variant="ghost" onClick={() => setDialog('deprecate')}>
          Deprecate…
        </Button>
      )}
    </>
  );

  return (
    <article className={cx(hasActions && 'max-md:pb-20')}>
      <Breadcrumb
        items={[
          { label: 'Table', to: '/' },
          { label: m.domain, to: `/?el=${m.id}` },
          { label: m.name },
        ]}
      />

      <header className="el-paper mt-4 grid items-end gap-x-8 gap-y-5 rounded-2xl border border-line p-5 md:grid-cols-[auto_minmax(0,1fr)] md:p-8">
        <div className="relative w-fit animate-[el-zoom_420ms_cubic-bezier(0.2,0,0,1)_both]" data-testid="element-hero">
          <span className="max-md:hidden">
            <StaticTile n={el.n} symbol={el.symbol} name={m.name} corner={m.version} hue={groupHue} finish={FINISH[m.status]} size={172} />
          </span>
          <span className="md:hidden">
            <StaticTile n={el.n} symbol={el.symbol} name={m.name} corner={m.version} hue={groupHue} finish={FINISH[m.status]} size={112} />
          </span>
        </div>
        <div className="min-w-0">
          <div className="x-legend-label flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-[3px] w-3 rounded-full" style={{ background: `var(--${groupHue}-9)` }} />
              {m.domain}
            </span>
            <span aria-hidden="true">·</span>
            <span className="num">No. {el.n}</span>
            <span aria-hidden="true">·</span>
            <span>Symbol {el.symbol}</span>
          </div>
          <h1
            className={cx(
              'x-serif m-0 mt-2 text-[56px] leading-[0.98] tracking-[-0.02em] break-words max-md:text-[40px]',
              deprecated && 'line-through decoration-2 text-muted',
            )}
            data-testid="metric-title"
          >
            {m.name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-ui text-muted">
            <StatusMark status={m.status} className="text-fg" />
            <span className="font-mono text-fg num">v{m.version}</span>
            <span className="inline-flex items-center gap-1.5">
              <Avatar name={m.ownerName} size="xs" />
              <span>{m.ownerName}</span>
            </span>
            <span title={formatDateTime(m.updatedAt)}>Changed {formatRelative(m.updatedAt)}</span>
          </div>
          {detail.approval?.verified && detail.approval.review && (
            <p className="m-0 mt-2 inline-flex items-center gap-1.5 text-ui text-ok-text" data-testid="approval-line">
              <BadgeCheck aria-hidden="true" className="size-4" />
              Approved by {detail.approval.review.reviewerName} on {formatDate(detail.approval.review.createdAt)}
            </p>
          )}
        </div>
      </header>

      {hasActions && (
        <div
          className="z-20 mt-6 flex flex-wrap items-center gap-2 max-md:fixed max-md:inset-x-0 max-md:mt-0 max-md:border-t max-md:border-line max-md:bg-[color-mix(in_oklab,var(--bg)_92%,transparent)] max-md:px-4 max-md:py-3 max-md:backdrop-blur-md max-md:[&>button]:h-11"
          style={{ bottom: 'var(--x-bottom-inset)' }}
          data-testid="card-actions"
        >
          {actions}
        </div>
      )}
      {can.reviewBlockedReason && (
        <p id="own-metric-note" className="m-0 mt-3 text-ui font-medium text-warn-text" data-testid="own-metric-note">
          {can.reviewBlockedReason}
        </p>
      )}
      <InlineError error={submit.error} className="mt-3" />

      <div className="mt-6">
        <Banners detail={detail} />
      </div>

      <div className="mt-6 grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <section>
            <Caption id="def-h">Definition</Caption>
            <p className="m-0 max-w-[68ch] whitespace-pre-wrap break-words text-[17px] leading-[28px] text-fg" data-testid="metric-definition">
              {m.definition}
            </p>
          </section>
          <section className="mt-8">
            <Caption id="formula-h">Formula</Caption>
            <FormulaPanel testId="metric-formula">{m.formula}</FormulaPanel>
          </section>
          <section className="mt-8">
            <Caption id="measure-h" action={m.measureName ? <CopyButton text={m.measureName} label="Copy measure name" variant="ghost" /> : undefined}>
              Measure
            </Caption>
            {m.measureName ? (
              <p className="m-0 font-mono text-base break-words text-fg" data-testid="measure-name">
                {m.measureName}
              </p>
            ) : (
              <p className="m-0 inline-flex items-center gap-2 text-sm text-muted" data-testid="measure-name">
                <span aria-hidden="true" className="size-2 rounded-full border border-dashed border-gray-8" />
                {NOT_IMPLEMENTED}
              </p>
            )}
            {m.modelRef && <p className="m-0 mt-1 text-sm text-muted">in {m.modelRef}</p>}
          </section>

          <Isotopes metric={m} el={el} versions={detail.versions} />
          <ReviewTrail detail={detail} isOwner={can.isOwner} />

          {detail.ignoredRows > 0 && (
            <p className="m-0 mt-4 text-xs text-muted">
              {detail.ignoredRows} stored row(s) for this metric were not written by its owner or a steward and are not shown.
            </p>
          )}
        </div>

        <aside className="min-w-0" aria-label="Properties">
          <Caption>Properties</Caption>
          <dl className="m-0 divide-y divide-[var(--line)]">
            <Meta label="Atomic no.">
              <span className="font-mono num">{el.n}</span>
            </Meta>
            <Meta label="Group">{m.domain}</Meta>
            <Meta label="Finish">
              <StatusMark status={m.status} />
            </Meta>
            <Meta label="Owner">{m.ownerName}</Meta>
            <Meta label="Created">{formatDate(m.createdAt)}</Meta>
            <Meta label="Changed">{formatDateTime(m.updatedAt)}</Meta>
            <Meta label="Synonyms">
              {commaList(m.synonyms).length ? (
                <ul className="m-0 flex list-none flex-wrap gap-1 p-0">
                  {commaList(m.synonyms).map((s) => (
                    <li key={s}>
                      <Tag size="sm">{s}</Tag>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted">None</span>
              )}
            </Meta>
            {detail.replaces.length > 0 && (
              <Meta label="Replaces">
                <ul className="m-0 list-none space-y-1.5 p-0">
                  {detail.replaces.map((r) => (
                    <ElementLink key={r.id} el={byId.get(r.id)} />
                  ))}
                </ul>
              </Meta>
            )}
            {detail.chain.length > 0 && (
              <Meta label="Decays into">
                <ul className="m-0 list-none space-y-1.5 p-0">
                  {detail.chain.map((c) => (
                    <ElementLink key={c.id} el={byId.get(c.id)} />
                  ))}
                </ul>
              </Meta>
            )}
          </dl>
        </aside>
      </div>

      <ConfirmDialog
        open={dialog === 'approve'}
        onClose={() => setDialog(null)}
        title={`Approve ${m.name} v${m.version}?`}
        body={<p className="m-0">The metric becomes the approved definition for everyone. Your name is recorded on the approval.</p>}
        confirmLabel="Approve"
        noteLabel="Comment (optional)"
        noteMax={limits.reviewComment.max}
        onConfirm={async (note) => {
          await approveMetric(app.store, app.me, m.id, note || null);
          await reload();
          onToast(`${m.name} v${m.version} approved.`);
        }}
      />
      <ConfirmDialog
        open={dialog === 'changes'}
        onClose={() => setDialog(null)}
        title={`Request changes to ${m.name}`}
        body={<p className="m-0">The metric goes back to draft and your comment is shown at the top of it until the owner resubmits.</p>}
        confirmLabel="Request changes"
        noteLabel="What needs to change"
        noteRequired
        noteMax={limits.reviewComment.max}
        onConfirm={async (note) => {
          await requestChanges(app.store, app.me, m.id, note);
          await reload();
          onToast(`Changes requested on ${m.name}.`);
        }}
      />
      <DeprecateDialog
        open={dialog === 'deprecate'}
        onClose={() => setDialog(null)}
        metric={m}
        all={detail.all}
        onDone={async () => {
          await reload();
          onToast(`${m.name} is deprecated.`);
        }}
      />
    </article>
  );
}

function ElementLink({ el }: { el: Element | undefined }) {
  if (!el) return null;
  return (
    <li>
      <Link to={`/metrics/${el.metric.id}`} className="group inline-flex items-center gap-2 text-fg no-underline">
        <SymbolChip symbol={el.symbol} hue={STATUS_HUE[el.metric.status]} finish={FINISH[el.metric.status]} size={24} />
        <span className={cx('group-hover:underline', el.metric.status === 'deprecated' && 'text-muted line-through')}>{el.metric.name}</span>
      </Link>
    </li>
  );
}

function Banners({ detail }: { detail: MetricDetail }) {
  const { metric: m, chain, changeRequest, approvedVersion, approval } = detail;
  const [showApproved, setShowApproved] = useState(false);
  const current = chain[chain.length - 1];
  const approvedOn = approvedVersion
    ? detail.reviews.find((r) => r.decision === 'approve' && r.versionLabel === approvedVersion.version)?.createdAt
    : undefined;
  return (
    <>
      {m.status === 'deprecated' && (
        <Notice tone="warn" title="This element is deprecated" testId="deprecated-banner">
          {m.deprecationNote && <p className="m-0 text-fg">{m.deprecationNote}</p>}
          {chain.length > 0 ? (
            <p className="m-0 mt-1.5 flex flex-wrap items-center gap-x-1.5">
              <CornerDownRight aria-hidden="true" className="size-3.5" />
              Decays into{' '}
              <Link to={`/metrics/${current.id}`} className="font-semibold text-accent-11" data-testid="replacement-link">
                {current.name}
              </Link>
              {chain.length > 1 && (
                <span>
                  {' '}
                  via{' '}
                  {chain.slice(0, -1).map((c, i) => (
                    <span key={c.id}>
                      {i > 0 && ', '}
                      <Link to={`/metrics/${c.id}`} className={c.status === 'deprecated' ? 'line-through' : undefined}>
                        {c.name}
                      </Link>
                    </span>
                  ))}
                </span>
              )}
            </p>
          ) : (
            <p className="m-0 mt-1">No replacement was named.</p>
          )}
        </Notice>
      )}
      {changeRequest && (
        <Notice tone="bad" title={`Changes requested by ${changeRequest.reviewerName}`} testId="changes-banner">
          <p className="m-0 whitespace-pre-wrap text-fg">{changeRequest.comment}</p>
          <p className="m-0 mt-1 text-xs">
            On v{changeRequest.versionLabel}, {formatRelative(changeRequest.createdAt)}. Edit the metric, then submit it for review again.
          </p>
        </Notice>
      )}
      {approvedVersion && (
        <Notice
          tone="info"
          title={`v${approvedVersion.version} is the approved version`}
          testId="approved-version-banner"
          actions={
            <Button size="sm" aria-expanded={showApproved} onClick={() => setShowApproved((s) => !s)}>
              {showApproved ? 'Hide' : 'Show'} what changed since v{approvedVersion.version}
            </Button>
          }
        >
          v{m.version} is {m.status === 'in_review' ? 'waiting for a steward' : 'a draft'}. Until it is approved, v{approvedVersion.version}
          {approvedOn ? ` (approved ${formatDate(approvedOn)})` : ''} is the definition to rely on.
        </Notice>
      )}
      {approvedVersion && showApproved && (
        <div className="mb-3 rounded-xl border border-line bg-surface p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-base font-semibold">Changes since v{approvedVersion.version}</h2>
            <DiffLegend />
          </div>
          <WordDiff label="Definition" before={approvedVersion.definition} after={m.definition} />
          <WordDiff label="Formula" before={approvedVersion.formula} after={m.formula} mono />
          <ValueChange label="Measure" before={approvedVersion.measureName} after={m.measureName} />
        </div>
      )}
      {approval && approval.reason === 'changed' && (
        <Notice tone="warn" title="Changed since approval" testId="unverified-banner">
          The {approval.changed.join(', ')} no longer match{approval.changed.length === 1 ? 'es' : ''} the version a steward approved (v{m.version}),
          and the change did not go through review. Treat this metric as unapproved until a steward reviews it; the isotopes show the approved text.
        </Notice>
      )}
      {approval && (approval.reason === 'no_review' || approval.reason === 'no_version') && (
        <Notice tone="warn" title="Approval not on record" testId="unverified-banner">
          {approval.reason === 'no_review'
            ? `The status says approved, but there is no steward approval for v${m.version}.`
            : `A steward approved v${m.version}, but the approved version is missing from the history.`}{' '}
          Treat it as unapproved until a steward reviews it.
        </Notice>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ isotopes (versions) */

function Nuclide({ version, symbol, approved }: { version: string; symbol: string; approved: boolean }) {
  return (
    <span className={cx('inline-flex w-16 shrink-0 items-start', approved ? 'text-fg' : 'text-muted')} aria-hidden="true">
      <span className="mt-0.5 font-mono text-[10px] leading-none num">{version}</span>
      <span className="x-serif text-[28px] leading-[0.9]">{symbol}</span>
    </span>
  );
}

function Isotopes({ metric, el, versions }: { metric: Metric; el: Element; versions: MetricVersion[] }) {
  return (
    <section className="mt-10" aria-labelledby="history-h">
      <Caption id="history-h" count={versions.length}>
        Isotopes · version history
      </Caption>
      {versions.length === 0 ? (
        <p className="m-0 text-sm text-muted">No saved versions.</p>
      ) : (
        <ol className="m-0 list-none p-0" data-testid="history-list">
          {versions.map((v, i) => (
            <IsotopeRow key={v.id} v={v} symbol={el.symbol} previous={versions[i + 1] ?? null} approved={metric.approvedVersionId === v.id} current={i === 0} />
          ))}
        </ol>
      )}
    </section>
  );
}

function IsotopeRow({ v, symbol, previous, approved, current }: { v: MetricVersion; symbol: string; previous: MetricVersion | null; approved: boolean; current: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="relative border-b border-line py-3 last:border-b-0">
      <div className="flex items-center gap-3">
        <Nuclide version={v.version} symbol={symbol} approved={approved || current} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium break-words">{v.changeNote || 'Saved'}</span>
            {approved && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-ok-text">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-ok-solid" />
                Approved version
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-muted">
            v{v.version} · {v.changedBy} · <span title={formatDateTime(v.changedAt)}>{formatRelative(v.changedAt)}</span>
          </div>
        </div>
        {previous ? (
          <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide changes' : 'Show changes'}
          </Button>
        ) : (
          <span className="text-xs text-faint">First version</span>
        )}
      </div>
      {open && previous && (
        <div className="mt-3 rounded-xl bg-surface-sunken p-3.5 md:ml-[76px]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="x-legend-label text-[10px] text-muted">
              Tracked changes · v{previous.version} <ArrowRight aria-hidden="true" className="inline size-3" /> v{v.version}
            </span>
            <DiffLegend />
          </div>
          <WordDiff label="Definition" before={previous.definition} after={v.definition} />
          <WordDiff label="Formula" before={previous.formula} after={v.formula} mono />
          <ValueChange label="Measure" before={previous.measureName} after={v.measureName} />
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ review trail */

function ReviewTrail({ detail, isOwner }: { detail: MetricDetail; isOwner: boolean }) {
  const m = detail.metric;
  return (
    <section className="mt-10" aria-labelledby="reviews-h">
      <Caption id="reviews-h" count={detail.reviews.length}>
        Review trail
      </Caption>
      {detail.reviews.length === 0 ? (
        <p className="m-0 text-sm text-muted">No reviews yet.{m.status === 'draft' && isOwner ? ' Submit the metric for review when it is ready.' : ''}</p>
      ) : (
        <ol className="m-0 list-none p-0" data-testid="review-list">
          {detail.reviews.map((r) => (
            <li key={r.id} className="flex gap-3 border-b border-line py-3 last:border-b-0">
              <Avatar name={r.reviewerName} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="font-medium">{r.reviewerName}</span>
                  <span className={cx('inline-flex items-center gap-1.5 text-xs font-medium', r.decision === 'approve' ? 'text-ok-text' : 'text-warn-text')}>
                    <span aria-hidden="true" className={cx('size-1.5 rounded-full', r.decision === 'approve' ? 'bg-ok-solid' : 'bg-warn-solid')} />
                    {r.decision === 'approve' ? 'Approved' : 'Changes requested'}
                  </span>
                  <span className="font-mono text-xs text-muted num">v{r.versionLabel}</span>
                  <span className="text-xs text-muted" title={formatDateTime(r.createdAt)}>
                    {formatRelative(r.createdAt)}
                  </span>
                </div>
                {r.comment && <p className="m-0 mt-1 whitespace-pre-wrap break-words text-sm text-fg">{r.comment}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ deprecate */

function DeprecateDialog({
  open,
  onClose,
  metric,
  all,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  metric: Metric;
  all: Metric[];
  onDone: () => Promise<void>;
}) {
  const app = useApp<Schema>();
  const noteId = useId();
  const selId = useId();
  const [note, setNote] = useState('');
  const [replacement, setReplacement] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [error, setError] = useState<AppErrorInfo | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setNote('');
      setReplacement('');
      setNoteError(null);
      setError(null);
    }
  }, [open]);
  const options = all.filter((x) => x.id !== metric.id && x.status !== 'deprecated').sort((a, b) => a.name.localeCompare(b.name));
  const replacementError = checkReplacement(all, metric.id, replacement || null);

  const confirm = async () => {
    const v = note.trim();
    if (v.length < limits.deprecationNote.min) return setNoteError(`Say why it is deprecated (at least ${limits.deprecationNote.min} characters).`);
    if (v.length > limits.deprecationNote.max) return setNoteError(`Keep the note to ${limits.deprecationNote.max} characters or fewer.`);
    if (replacementError) return;
    setBusy(true);
    setError(null);
    try {
      await deprecateMetric(app.store, app.me, metric.id, v, replacement || null);
      onClose();
      await onDone();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Deprecate ${metric.name}`}
      description="It moves to the deprecated series: still readable, struck through, and no longer editable."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" busy={busy} onClick={() => void confirm()}>
            Deprecate
          </Button>
        </>
      }
    >
      <Field label="Why is it deprecated?" htmlFor={noteId} required error={noteError} counter={{ value: note.length, max: limits.deprecationNote.max }}>
        <TextArea id={noteId} rows={3} value={note} onChange={(e) => setNote(e.target.value)} invalid={!!noteError} />
      </Field>
      <Field label="Decays into (optional)" htmlFor={selId} error={replacementError} hint="People who open this metric are sent to the replacement.">
        <Select id={selId} value={replacement} onChange={(e) => setReplacement(e.target.value)}>
          <option value="">No replacement</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} ({o.domain})
            </option>
          ))}
        </Select>
      </Field>
      <InlineError error={error} />
    </Dialog>
  );
}
